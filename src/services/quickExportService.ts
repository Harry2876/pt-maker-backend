import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickResultService } from './quickResultService';
import { templateService } from './templateService';
import { tieBreakingService } from './tieBreakingService';
import { mediaAssetService } from './mediaAssetService';
import { QuickMediaAssetType } from '../types/mediaAsset';
import { extractR2KeyFromUrl } from '../utils/r2UrlUtils';
import { QuickPointsTableCache, QuickMatchResultCache } from '../types/quickResult';
import { pythonAIService } from './pythonAIService';
import { StandingsTeamData, StandingsExportOptions } from '../types/pythonAI';
import { ServiceError } from '../utils/serviceError';
import { buildStandingsRequest } from '../utils/standingsPayloadBuilder';
import { quickSeriesService } from './quickSeriesService';
import { SeriesTeamStanding } from '../types/quickSeries';
import { teamsMatch } from '../utils/seriesSlotUtils';
import { entitlementService } from './entitlementService';
import {
    getExpectedTeamCount,
    splitTeamDataIntoChunks,
    buildSplitOutputFilename,
} from '../utils/pythonErrorUtils';
import { 
    ConflictDetectionResult, 
    TieBreakingResult, 
    EnhancedMatchResult,
    TieBreakingConfig,
    ConflictGroup,
    ManualTieBreaking
} from '../types/tieBreaking';

export interface ExportPointsTableRequest {
    quickMatchId: string;
    userId: string;
    /** Template name stored in R2 under templates/{formatType}/ (e.g. "tmplate_1") */
    template?: string;
    /** Format type — auto-derived from template category if omitted */
    formatType?: string;
    /** Custom output filename for the generated PNG */
    outputFilename?: string;
    // ---- Standings API pass-through fields ----
    tableFontSize?: number | null;
    tableHeaderFontSize?: number | null;
    tableHeaderLabelMode?: string | null;
    tableHeaderColumnPadding?: number | null;
    rowHeightAdjust?: number | null;
    teamLogoSize?: number | null;
    teamLogoSizeAdjust?: number | null;
    teamLogoGap?: number | null;
    teamShiftRight?: number | null;
    chickenDinnerIconSize?: number | null;
    chickenIconGap?: number | null;
    eventName?: string | null;
    organiserName?: string | null;
    sponsorName?: string | null;
    elementOverrides?: Record<string, Record<string, any>> | null;
    columnOverrides?: Record<string, Record<string, any>> | null;
    fontCustomization?: Record<string, any> | null;
    advancedConfig?: Record<string, any> | null;
    showBranding?: boolean;
}

export interface ExportSeriesLeaderboardRequest extends StandingsExportOptions {
    seriesId: string;
    userId: string;
    template?: string;
    formatType?: string;
}

export interface ExportSeriesLeaderboardResponse {
    seriesId: string;
    template: string;
    formatType: string;
    totalTeams: number;
    imageCount: number;
    generationTimeMs: number;
    images: ExportStandingsImage[];
    previewImageUrl: string;
    /** @deprecated Use previewImageUrl with Authorization header */
    signedImageUrl: string;
}

/** One generated standings PNG returned to the client */
export interface ExportStandingsImage {
    part: number;
    label: 'main' | 'overflow';
    assetId: string;
    previewUrl: string;
    /** @deprecated Use previewUrl with Authorization header */
    signedUrl: string;
    filename?: string;
    teamCount: number;
}

export interface ExportPointsTableResponse {
    pointsTableId: string;
    template: string;
    formatType: string;
    totalTeams: number;
    imageCount: number;
    generationTimeMs: number;
    images: ExportStandingsImage[];
    previewImageUrl: string;
    /** @deprecated Use previewImageUrl with Authorization header */
    signedImageUrl: string;
}

interface StoredStandingsImage {
    part: number;
    label: 'main' | 'overflow';
    originalUrl: string;
    assetId?: string;
    filename?: string;
    teamCount: number;
}

interface GeneratedStandingsImage extends StoredStandingsImage {
    assetId: string;
    previewUrl: string;
    signedUrl: string;
    r2Key: string;
}

export class QuickExportService extends BaseService {
    private readonly DEFAULT_TEMPLATE = 'default';
    private readonly EXPORT_CACHE_TTL = 3600; // 1 hour

    constructor() {
        super();
    }

    /**
     * Generate and export points table for a Quick Match
     */
    async exportPointsTable(
        request: ExportPointsTableRequest
    ): Promise<ExportPointsTableResponse> {
        const startTime = Date.now();
        const { quickMatchId, userId, template, formatType } = request;

        const stylingOptions = this.pickStylingOptions({
            ...request,
            showBranding: await entitlementService.resolveShowBranding(userId),
        }
        );

        try {
            // 1. Verify match ownership and completion
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
            }

            const results = await quickResultService.getMatchResults(quickMatchId, userId);
            if (results.length === 0) {
                throw new ServiceError(
                    'No match results found. Process result screenshots or enter results manually first.',
                    400,
                    'NO_RESULTS'
                );
            }

            // 3. Resolve template → get raw R2 URLs for the Python API
            const templateName = template || this.DEFAULT_TEMPLATE;
            let resolvedFormatType = formatType;

            // Auto-detect format from template category if not supplied
            if (!resolvedFormatType) {
                resolvedFormatType = this.determineFormatType(results.length);
            }

            const templateConfig = await templateService.getTemplateWithConfig(templateName, resolvedFormatType);
            if (!templateConfig) {
                throw new ServiceError(
                    `Template "${templateName}" not found for format "${resolvedFormatType}". Check GET /quick-pt/templates.`,
                    400,
                    'TEMPLATE_NOT_FOUND'
                );
            }

            // 4. Build team_data — standings rank by total points (highest first)
            const sortedResults = this.sortResultsForStandings(results);

            // Fetch slot logos for this match
            const slots = await this.db.quickSlotAssignment.findMany({
                where: { quickMatchId },
                include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
            });
            const slotLogoMap = new Map(
                slots.map(s => [s.slotNumber, s.matchLogoStorageUrl ?? s.logoPresetEntry?.logoStorageUrl ?? null])
            );

            const teamData: StandingsTeamData[] = sortedResults.map((r, index) => ({
                rank: index + 1,
                slot_number: r.slotNumber,
                team_name: r.teamName,
                matches_played: 1,
                total_points: r.totalPoints,
                position_points: r.positionPoints,
                finish_points: r.killPoints,
                wwcd: (r.rank ?? r.position) === 1 ? 1 : 0,
                team_logo_url: slotLogoMap.get(r.slotNumber) ?? null,
            }));

            const generatedImages = await this.generateStandingsImages({
                userId,
                quickMatchId,
                assetType: 'STANDINGS',
                templateName,
                resolvedFormatType,
                templateConfig,
                teamData,
                stylingOptions,
            });

            const generationTimeMs = Date.now() - startTime;
            const pointsTableId = randomUUID();
            const storedImages: StoredStandingsImage[] = generatedImages.map(
                ({ r2Key: _k, previewUrl: _p, signedUrl: _s, ...rest }) => rest,
            );

            // 7. Persist to DB and cache (upsert so re-exports overwrite previous record)
            await this.db.quickPointsTable.upsert({
                where: { quickMatchId },
                update: {
                    id: pointsTableId,
                    tableImageUrl: generatedImages[0].originalUrl,
                    pngGeneratedAt: new Date(),
                    generationTimeMs,
                    template: templateName,
                    expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000),
                    csvData: JSON.parse(JSON.stringify({
                        format_type: resolvedFormatType,
                        total_teams: teamData.length,
                        images: storedImages,
                    })),
                },
                create: {
                    id: pointsTableId,
                    quickMatchId,
                    tableImageUrl: generatedImages[0].originalUrl,
                    pngGeneratedAt: new Date(),
                    generationTimeMs,
                    template: templateName,
                    expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000),
                    csvData: JSON.parse(JSON.stringify({
                        format_type: resolvedFormatType,
                        total_teams: teamData.length,
                        images: storedImages,
                    })),
                },
            });

            const response = this.buildExportResponse(
                pointsTableId,
                templateName,
                resolvedFormatType,
                teamData.length,
                generationTimeMs,
                generatedImages
            );

            const cacheEntry: QuickPointsTableCache = {
                id: pointsTableId,
                quickMatchId,
                tableImageUrl: response.previewImageUrl,
                generationTimeMs,
                template: templateName,
                expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000).toISOString(),
                csvData: {
                    format_type: resolvedFormatType,
                    total_teams: teamData.length,
                    images: storedImages,
                },
                pngGeneratedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED',
            };

            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, cacheEntry, this.EXPORT_CACHE_TTL);
            await redis.set(`quickMatch:${quickMatchId}:pointsTable`, pointsTableId, this.EXPORT_CACHE_TTL);

            this.logger.info(`Standings image${response.imageCount > 1 ? 's' : ''} generated for match ${quickMatchId}`, {
                pointsTableId,
                generationTimeMs,
                imageCount: response.imageCount,
            });

            return response;

        } catch (error) {
            this.logger.error(`exportPointsTable failed for match ${quickMatchId}:`, error);
            throw error;
        }
    }

    /**
     * Get existing points table for a match (same shape as POST /export response)
     */
    async getPointsTable(
        quickMatchId: string,
        userId: string
    ): Promise<ExportPointsTableResponse | null> {
        try {
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            let record: {
                id: string;
                template: string;
                tableImageUrl: string | null;
                csvData: any;
                generationTimeMs: number | null;
            } | null = null;

            const cachedId = await redis.get(`quickMatch:${quickMatchId}:pointsTable`);
            if (cachedId) {
                const cached = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${cachedId}`);
                if (cached) {
                    record = {
                        id: cached.id,
                        template: cached.template,
                        tableImageUrl: cached.tableImageUrl ?? null,
                        csvData: cached.csvData,
                        generationTimeMs: cached.generationTimeMs ?? null,
                    };
                }
            }

            if (!record) {
                const dbPointsTable = await this.db.quickPointsTable.findFirst({
                    where: { quickMatchId },
                    orderBy: { createdAt: 'desc' },
                });
                if (!dbPointsTable) return null;

                record = {
                    id: dbPointsTable.id,
                    template: dbPointsTable.template,
                    tableImageUrl: dbPointsTable.tableImageUrl,
                    csvData: dbPointsTable.csvData,
                    generationTimeMs: dbPointsTable.generationTimeMs,
                };
            }

            const storedImages = this.normalizeStoredImages(record.csvData, record.tableImageUrl ?? undefined);
            if (storedImages.length === 0) return null;

            const resolvedImages = await this.resolveStoredImages(
                userId,
                quickMatchId,
                storedImages,
                'STANDINGS',
            );
            const csvData = record.csvData as Record<string, unknown> | null;

            return this.buildExportResponse(
                record.id,
                record.template,
                (csvData?.format_type as string) ?? this.determineFormatType(resolvedImages.reduce((n, i) => n + i.teamCount, 0)),
                (csvData?.total_teams as number) ?? resolvedImages.reduce((n, i) => n + i.teamCount, 0),
                record.generationTimeMs ?? 0,
                resolvedImages
            );
        } catch (error) {
            this.handleError(error, 'Get Points Table');
            return null;
        }
    }

    /**
     * Regenerate points table (e.g., with different template)
     */
    async regeneratePointsTable(
        request: ExportPointsTableRequest
    ): Promise<ExportPointsTableResponse> {
        const { quickMatchId, userId } = request;

        try {
            // Clear cached version so exportPointsTable generates a fresh one
            const cachedId = await redis.get(`quickMatch:${quickMatchId}:pointsTable`);
            if (cachedId) {
                await redis.delete(`quickPointsTable:${cachedId}`);
                await redis.delete(`quickMatch:${quickMatchId}:pointsTable`);
            }
            return this.exportPointsTable(request);
        } catch (error) {
            this.logger.error(`regeneratePointsTable failed for match ${quickMatchId}:`, error);
            throw error;
        }
    }

    /**
     * Export aggregated series leaderboard as standings PNG(s)
     */
    async exportSeriesLeaderboard(
        request: ExportSeriesLeaderboardRequest
    ): Promise<ExportSeriesLeaderboardResponse> {
        const startTime = Date.now();
        const { seriesId, userId, template, formatType } = request;

        try {
            const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
            }

            const leaderboard = await quickSeriesService.getSeriesLeaderboard(seriesId, userId);
            if (!leaderboard?.leaderboardData?.length) {
                throw new ServiceError(
                    'No series leaderboard data. Add matches with results before exporting.',
                    400,
                    'NO_LEADERBOARD'
                );
            }

            const templateName = template || this.DEFAULT_TEMPLATE;
            const standings = leaderboard.leaderboardData;
            let resolvedFormatType = formatType;
            if (!resolvedFormatType) {
                resolvedFormatType = this.determineFormatType(standings.length);
            }

            const templateConfig = await templateService.getTemplateWithConfig(templateName, resolvedFormatType);
            if (!templateConfig) {
                throw new ServiceError(
                    `Template "${templateName}" not found for format "${resolvedFormatType}". Check GET /quick-pt/templates.`,
                    400,
                    'TEMPLATE_NOT_FOUND'
                );
            }

            const teamData = await this.buildSeriesTeamData(standings, userId);
            const stylingOptions = this.pickStylingOptions({
                ...request,
                eventName: request.eventName ?? series.seriesName,
                showBranding: await entitlementService.resolveShowBranding(userId),
            });

            const generatedImages = await this.generateStandingsImages({
                userId,
                quickMatchId: seriesId,
                quickSeriesId: seriesId,
                assetType: 'SERIES_STANDINGS',
                templateName,
                resolvedFormatType,
                templateConfig,
                teamData,
                stylingOptions,
            });

            const generationTimeMs = Date.now() - startTime;
            const clientImages: ExportStandingsImage[] = generatedImages.map(
                ({ part, label, assetId, previewUrl, filename, teamCount }) => ({
                    part,
                    label,
                    assetId,
                    previewUrl,
                    signedUrl: previewUrl,
                    filename,
                    teamCount,
                }),
            );

            const firstPreview = clientImages[0]?.previewUrl ?? '';

            return {
                seriesId,
                template: templateName,
                formatType: resolvedFormatType,
                totalTeams: teamData.length,
                imageCount: clientImages.length,
                generationTimeMs,
                images: clientImages,
                previewImageUrl: firstPreview,
                signedImageUrl: firstPreview,
            };
        } catch (error) {
            this.logger.error(`exportSeriesLeaderboard failed for series ${seriesId}:`, error);
            throw error;
        }
    }

    /**
     * Detect points conflicts for a match
     */
    async detectConflicts(
        quickMatchId: string,
        userId: string
    ): Promise<ConflictDetectionResult> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get match results
            const results = await quickResultService.getMatchResults(quickMatchId, userId);
            if (results.length === 0) {
                return {
                    hasConflicts: false,
                    conflictGroups: [],
                    totalConflictedTeams: 0,
                    autoResolvableCount: 0,
                    manualResolutionRequired: 0
                };
            }

            // 3. Detect conflicts
            const conflictDetection = await tieBreakingService.detectMatchConflicts(results);
            
            this.logger.info(`Conflict detection for match ${quickMatchId}: ${conflictDetection.conflictGroups.length} conflicts found`);
            
            return conflictDetection;

        } catch (error) {
            this.handleError(error, 'Detect Conflicts');
            throw error;
        }
    }

    /**
     * Apply manual tie-breaking resolution
     */
    async resolveConflicts(
        quickMatchId: string,
        userId: string,
        conflictGroupId: string,
        userDefinedOrder: string[],
        reason?: string
    ): Promise<{ success: boolean; resolvedTeams: string[] }> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get current conflicts
            const results = await quickResultService.getMatchResults(quickMatchId, userId);
            const conflictDetection = await tieBreakingService.detectMatchConflicts(results);

            // 3. Find specific conflict group
            const conflictGroup = conflictDetection.conflictGroups.find(g =>
                g.points.toString() === conflictGroupId
            );
            
            if (!conflictGroup) {
                throw new Error('Conflict group not found');
            }

            // 4. Create manual resolution
            const manualResolution: ManualTieBreaking = {
                conflictGroupId,
                points: conflictGroup.points,
                userDefinedOrder,
                resolvedBy: userId,
                resolvedAt: new Date().toISOString(),
                reason
            };

            // 5. Apply manual tie-breaking
            const resolvedTeams = await tieBreakingService.applyManualTieBreaking(
                conflictGroup,
                manualResolution
            );

            // 6. Update tie-breaking configuration with manual resolution
            const config = await tieBreakingService.getTieBreakingConfig(quickMatchId, 'match');
            if (config) {
                config.manualResolutions = config.manualResolutions || [];
                config.manualResolutions.push(manualResolution);
                await tieBreakingService.saveTieBreakingConfig(quickMatchId, 'match', config);
            }

            this.logger.info(`Manual tie-breaking applied for match ${quickMatchId}, conflict ${conflictGroupId}`);
            
            return {
                success: true,
                resolvedTeams: resolvedTeams.map(t => t.teamName)
            };

        } catch (error) {
            this.handleError(error, 'Resolve Conflicts');
            throw error;
        }
    }

    /**
     * Set tie-breaking rules for a match
     */
    async setTieBreakingRules(
        quickMatchId: string,
        userId: string,
        rules: any[],
        autoResolveEnabled: boolean
    ): Promise<{ success: boolean }> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Create tie-breaking configuration
            const config: TieBreakingConfig = {
                matchId: quickMatchId,
                rules,
                manualResolutions: [],
                autoResolveEnabled
            };

            // 3. Save configuration
            await tieBreakingService.saveTieBreakingConfig(quickMatchId, 'match', config);
            
            this.logger.info(`Tie-breaking rules set for match ${quickMatchId}: ${rules.length} rules, auto-resolve: ${autoResolveEnabled}`);
            
            return { success: true };

        } catch (error) {
            this.handleError(error, 'Set Tie Breaking Rules');
            throw error;
        }
    }

    /**
     * Delete points table
     */
    async deletePointsTable(
        pointsTableId: string,
        userId: string
    ): Promise<void> {
        try {
            // 1. Get points table
            const pointsTable = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${pointsTableId}`);
            
            if (pointsTable) {
                // 2. Verify ownership
                const quickMatch = await quickMatchService.getQuickMatchById(pointsTable.quickMatchId, userId);
                if (!quickMatch) {
                    throw new Error('Access denied');
                }
            }

            // 3. Delete from database
            await this.db.quickPointsTable.delete({
                where: { id: pointsTableId }
            });

            // 4. Delete from Redis
            await redis.delete(`quickPointsTable:${pointsTableId}`);
            if (pointsTable) {
                await redis.delete(`quickMatch:${pointsTable.quickMatchId}:pointsTable`);
            }

            this.logger.info(`Points table ${pointsTableId} deleted`);

        } catch (error) {
            this.handleError(error, 'Delete Points Table');
            throw error;
        }
    }

    private pickStylingOptions(options: StandingsExportOptions): StandingsExportOptions {
        return {
            outputFilename: options.outputFilename,
            eventName: options.eventName,
            organiserName: options.organiserName,
            sponsorName: options.sponsorName,
            tableFontSize: options.tableFontSize,
            tableHeaderFontSize: options.tableHeaderFontSize,
            tableHeaderLabelMode: options.tableHeaderLabelMode,
            tableHeaderColumnPadding: options.tableHeaderColumnPadding,
            rowHeightAdjust: options.rowHeightAdjust,
            teamLogoSize: options.teamLogoSize,
            teamLogoSizeAdjust: options.teamLogoSizeAdjust,
            teamLogoGap: options.teamLogoGap,
            teamShiftRight: options.teamShiftRight,
            chickenDinnerIconSize: options.chickenDinnerIconSize,
            chickenIconGap: options.chickenIconGap,
            elementOverrides: options.elementOverrides,
            columnOverrides: options.columnOverrides,
            fontCustomization: options.fontCustomization,
            advancedConfig: options.advancedConfig,
            showBranding: options.showBranding,
        };
    }

    private async buildSeriesTeamData(
        standings: SeriesTeamStanding[],
        userId: string
    ): Promise<StandingsTeamData[]> {
        const matchIds = [...new Set(standings.flatMap(s => s.matchResults.map(m => m.quickMatchId)))];
        const resultsByMatch = new Map<string, Awaited<ReturnType<typeof quickResultService.getMatchResults>>>();

        for (const matchId of matchIds) {
            resultsByMatch.set(matchId, await quickResultService.getMatchResults(matchId, userId));
        }

        return standings.map((standing, index) => {
            let positionPoints = 0;
            let finishPoints = 0;
            let wwcd = 0;
            let slotNumber = index + 1;

            for (const matchResult of standing.matchResults) {
                const matchRows = resultsByMatch.get(matchResult.quickMatchId) ?? [];
                const teamRow = matchRows.find(r => teamsMatch(r.teamName, standing.teamName));
                if (!teamRow) continue;

                positionPoints += teamRow.positionPoints;
                finishPoints += teamRow.killPoints;
                if ((teamRow.rank ?? teamRow.position) === 1) {
                    wwcd += 1;
                }
                slotNumber = teamRow.slotNumber;
            }

            return {
                rank: index + 1,
                slot_number: slotNumber,
                team_name: standing.teamName,
                matches_played: standing.matchesPlayed,
                position_points: positionPoints,
                finish_points: finishPoints,
                total_points: standing.totalPoints,
                wwcd,
            };
        });
    }

    private async generateStandingsImages(params: {
        userId: string;
        quickMatchId: string;
        quickSeriesId?: string;
        assetType: QuickMediaAssetType;
        templateName: string;
        resolvedFormatType: string;
        templateConfig: { templateUrl: string; configUrl: string };
        teamData: StandingsTeamData[];
        stylingOptions: StandingsExportOptions;
    }): Promise<GeneratedStandingsImage[]> {
        const {
            userId,
            quickMatchId,
            quickSeriesId,
            assetType,
            templateName,
            resolvedFormatType,
            templateConfig,
            teamData,
            stylingOptions,
        } = params;

        const maxTeamsPerImage = getExpectedTeamCount(resolvedFormatType);
        const teamChunks = splitTeamDataIntoChunks(teamData, maxTeamsPerImage);

        if (teamChunks.length > 1) {
            this.logger.info(
                `Splitting ${teamData.length} teams into ${teamChunks.length} standings images for ${quickMatchId}`,
                { formatType: resolvedFormatType, chunkSizes: teamChunks.map(c => c.length) }
            );
        }

        const generatedImages: GeneratedStandingsImage[] = [];

        for (let i = 0; i < teamChunks.length; i++) {
            const chunk = teamChunks[i];
            const partIndex = i + 1;
            const isOverflow = partIndex === teamChunks.length && chunk.length < maxTeamsPerImage;

            const chunkOutputFilename = buildSplitOutputFilename(
                stylingOptions.outputFilename,
                partIndex,
                teamChunks.length
            );

            const standingsReq = buildStandingsRequest(
                templateConfig.templateUrl,
                templateConfig.configUrl,
                resolvedFormatType as '8_teams' | '16_teams' | '24_teams',
                chunk,
                {
                    ...stylingOptions,
                    outputFilename: chunkOutputFilename,
                }
            );

            this.logger.info(`Generating standings image ${partIndex}/${teamChunks.length} for ${quickMatchId}`, {
                template: templateName,
                formatType: resolvedFormatType,
                teams: chunk.length,
                partLabel: isOverflow ? 'overflow' : 'main',
            });

            const pyResponse = await pythonAIService.generateStandings(standingsReq);

            if (pyResponse.status !== 'success') {
                throw new Error(`Python AI standings generation failed: ${pyResponse.status}`);
            }

            const rawImageUrl: string =
                pyResponse.data?.image_url ||
                pyResponse.data?.download_url ||
                pyResponse.data?.output_url ||
                pyResponse.metadata?.r2_upload_url;

            if (!rawImageUrl) {
                throw new Error('Python AI did not return an image URL in the response');
            }

            const r2Key = extractR2KeyFromUrl(rawImageUrl);
            const preview = await mediaAssetService.registerFromImageUrl({
                userId,
                quickMatchId: quickSeriesId ? undefined : quickMatchId,
                quickSeriesId,
                assetType,
                rawImageUrl,
                filename: chunkOutputFilename,
                metadata: {
                    part: partIndex,
                    label: isOverflow ? 'overflow' : 'main',
                    teamCount: chunk.length,
                    template: templateName,
                    formatType: resolvedFormatType,
                },
            });

            generatedImages.push({
                part: partIndex,
                label: isOverflow ? 'overflow' : 'main',
                assetId: preview.assetId,
                previewUrl: preview.previewUrl,
                signedUrl: preview.previewUrl,
                originalUrl: rawImageUrl,
                r2Key,
                filename: chunkOutputFilename,
                teamCount: chunk.length,
            });
        }

        return generatedImages;
    }

    private buildExportResponse(
        pointsTableId: string,
        template: string,
        formatType: string,
        totalTeams: number,
        generationTimeMs: number,
        images: GeneratedStandingsImage[]
    ): ExportPointsTableResponse {
        const clientImages: ExportStandingsImage[] = images.map(
            ({ part, label, assetId, previewUrl, filename, teamCount }) => ({
                part,
                label,
                assetId,
                previewUrl,
                signedUrl: previewUrl,
                filename,
                teamCount,
            }),
        );

        const firstPreview = clientImages[0]?.previewUrl ?? '';

        return {
            pointsTableId,
            template,
            formatType,
            totalTeams,
            imageCount: clientImages.length,
            generationTimeMs,
            images: clientImages,
            previewImageUrl: firstPreview,
            signedImageUrl: firstPreview,
        };
    }

    private async resolveStoredImages(
        userId: string,
        quickMatchId: string,
        stored: StoredStandingsImage[],
        assetType: QuickMediaAssetType,
        quickSeriesId?: string,
    ): Promise<GeneratedStandingsImage[]> {
        return Promise.all(
            stored.map(async (img) => {
                const r2Key = extractR2KeyFromUrl(img.originalUrl);

                if (img.assetId) {
                    const preview = mediaAssetService.previewForAssetId(img.assetId);
                    return {
                        ...img,
                        assetId: preview.assetId,
                        previewUrl: preview.previewUrl,
                        signedUrl: preview.previewUrl,
                        r2Key,
                    };
                }

                const existing = await mediaAssetService.findByR2Key(userId, r2Key);
                if (existing) {
                    const preview = mediaAssetService.previewForAssetId(existing.id);
                    return {
                        ...img,
                        assetId: preview.assetId,
                        previewUrl: preview.previewUrl,
                        signedUrl: preview.previewUrl,
                        r2Key,
                    };
                }

                const preview = await mediaAssetService.registerFromImageUrl({
                    userId,
                    quickMatchId: quickSeriesId ? undefined : quickMatchId,
                    quickSeriesId,
                    assetType,
                    rawImageUrl: img.originalUrl,
                    filename: img.filename,
                    metadata: {
                        part: img.part,
                        label: img.label,
                        teamCount: img.teamCount,
                        migratedFromLegacy: true,
                    },
                });

                return {
                    ...img,
                    assetId: preview.assetId,
                    previewUrl: preview.previewUrl,
                    signedUrl: preview.previewUrl,
                    r2Key,
                };
            }),
        );
    }

    /** Normalize DB/cache metadata — supports current and legacy export formats */
    private normalizeStoredImages(csvData: unknown, fallbackOriginalUrl?: string): StoredStandingsImage[] {
        if (!csvData || typeof csvData !== 'object') {
            return fallbackOriginalUrl
                ? [{ part: 1, label: 'main', originalUrl: fallbackOriginalUrl, teamCount: 0 }]
                : [];
        }

        const data = csvData as Record<string, any>;
        const rawImages = Array.isArray(data.images) ? data.images : [];

        if (rawImages.length > 0) {
            return rawImages.map((img: any, idx: number) => ({
                part: img.part ?? img.part_index ?? idx + 1,
                label: (img.label ?? img.part_label ?? (idx === 0 ? 'main' : 'overflow')) as 'main' | 'overflow',
                originalUrl: img.originalUrl ?? img.original_url ?? img.original_image_url,
                assetId: img.assetId ?? img.asset_id,
                filename: img.filename ?? img.output_filename,
                teamCount: img.teamCount ?? img.team_count ?? img.teams_processed ?? 0,
            })).filter((img: StoredStandingsImage) => !!img.originalUrl);
        }

        const singleUrl = data.original_image_url ?? fallbackOriginalUrl;
        if (singleUrl) {
            return [{
                part: 1,
                label: 'main',
                originalUrl: singleUrl,
                teamCount: data.total_teams ?? 0,
            }];
        }

        return [];
    }

    /**
     * Determine format type based on team count
     */
    private determineFormatType(teamCount: number): string {
        if (teamCount <= 16) return '16_teams';
        if (teamCount <= 24) return '24_teams';
        if (teamCount <= 32) return '32_teams';
        return '24_teams'; // default
    }

    /**
     * Generate output filename based on match details
     */
    private generateOutputFilename(matchName: string): string {
        const sanitizedName = matchName.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = Date.now();
        return `${sanitizedName}_standings_${timestamp}.png`;
    }

    /**
     * Calculate expiry date (7 days from now)
     * @private
     */
    private calculateExpiryDate(): string {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // 7 days
        return expiryDate.toISOString();
    }

    /**
     * Order teams for the PT standings image: highest total points first.
     * Tie-break: more kills, then better in-game placement.
     */
    private sortResultsForStandings(results: QuickMatchResultCache[]): QuickMatchResultCache[] {
        return [...results].sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
            return (a.rank ?? a.position) - (b.rank ?? b.position);
        });
    }

    /**
     * Check if points table has expired
     */
    async isExpired(pointsTableId: string): Promise<boolean> {
        try {
            const pointsTable = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${pointsTableId}`);
            
            if (!pointsTable || !pointsTable.expiresAt) {
                return false;
            }

            return new Date(pointsTable.expiresAt) < new Date();

        } catch (error) {
            this.logger.error('Error checking points table expiry:', error);
            return false;
        }
    }
}

export const quickExportService = new QuickExportService();