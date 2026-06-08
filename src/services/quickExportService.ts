import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickResultService } from './quickResultService';
import { templateService } from './templateService';
import { tieBreakingService } from './tieBreakingService';
import { signedUrlUtility } from './signedUrlUtility';
import { QuickPointsTableCache } from '../types/quickResult';
import { pythonAIService } from './pythonAIService';
import { StandingsTeamData, StandingsRequest } from '../types/pythonAI';
import { ServiceError } from '../utils/serviceError';
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
    /** Global font size for all table DATA rows */
    tableFontSize?: number | null;
    /** Global font size for all table HEADER rows */
    tableHeaderFontSize?: number | null;
    /** Header label mode: 'full' | 'abbr' | 'initial' */
    tableHeaderLabelMode?: string | null;
    /** Pixels to add/subtract from row height */
    rowHeightAdjust?: number | null;
    /** Per-element font/color overrides (event_name, organiser_name, sponsor_name, etc.) */
    elementOverrides?: Record<string, Record<string, any>> | null;
    /** Per-column font/color overrides (rank, team, position, kills, total, etc.) */
    columnOverrides?: Record<string, Record<string, any>> | null;
    /** Advanced config for header/organiser text position overrides */
    advancedConfig?: Record<string, any> | null;
}

/** One generated standings PNG returned to the client */
export interface ExportStandingsImage {
    part: number;
    label: 'main' | 'overflow';
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
    /** First image signed URL — convenience alias for single-image clients */
    signedImageUrl: string;
}

interface StoredStandingsImage {
    part: number;
    label: 'main' | 'overflow';
    originalUrl: string;
    filename?: string;
    teamCount: number;
}

interface GeneratedStandingsImage extends StoredStandingsImage {
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
        const {
            quickMatchId,
            userId,
            template,
            formatType,
            outputFilename,
            tableFontSize,
            tableHeaderFontSize,
            tableHeaderLabelMode,
            rowHeightAdjust,
            elementOverrides,
            columnOverrides,
            advancedConfig,
        } = request;

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

            // 4. Build team_data (rank order)
            const sortedResults = [...results].sort((a, b) => (a.rank ?? a.position) - (b.rank ?? b.position));

            const teamData: StandingsTeamData[] = sortedResults.map(r => ({
                rank: r.rank ?? r.position,
                slot_number: r.slotNumber,
                team_name: r.teamName,
                matches_played: 1,
                total_points: r.totalPoints,
                position_points: r.positionPoints,
                finish_points: r.killPoints,
                wwcd: (r.rank ?? r.position) === 1 ? 1 : 0,
            }));

            const maxTeamsPerImage = getExpectedTeamCount(resolvedFormatType);
            const teamChunks = splitTeamDataIntoChunks(teamData, maxTeamsPerImage);
            const splitExport = teamChunks.length > 1;

            if (splitExport) {
                this.logger.info(
                    `Splitting ${teamData.length} teams into ${teamChunks.length} standings images for match ${quickMatchId}`,
                    { formatType: resolvedFormatType, chunkSizes: teamChunks.map(c => c.length) }
                );
            }

            const generatedImages: GeneratedStandingsImage[] = [];

            for (let i = 0; i < teamChunks.length; i++) {
                const chunk = teamChunks[i];
                const partIndex = i + 1;
                const isOverflow = partIndex === teamChunks.length && chunk.length < maxTeamsPerImage;

                const chunkOutputFilename = buildSplitOutputFilename(
                    outputFilename,
                    partIndex,
                    teamChunks.length
                );

                const standingsReq: StandingsRequest = {
                    template_url: templateConfig.templateUrl,
                    template_config_url: templateConfig.configUrl,
                    format_type: resolvedFormatType as '8_teams' | '16_teams' | '24_teams',
                    team_data: chunk,
                    ...(chunkOutputFilename && { output_filename: chunkOutputFilename }),
                    ...(tableFontSize != null && { table_font_size: tableFontSize }),
                    ...(tableHeaderFontSize != null && { table_header_font_size: tableHeaderFontSize }),
                    ...(tableHeaderLabelMode != null && { table_header_label_mode: tableHeaderLabelMode }),
                    ...(rowHeightAdjust != null && { row_height_adjust: rowHeightAdjust }),
                    ...(elementOverrides && { element_overrides: elementOverrides }),
                    ...(columnOverrides && { column_overrides: columnOverrides }),
                    ...(advancedConfig && { advanced_config: advancedConfig }),
                    options: { upload_to_r2: true },
                };

                this.logger.info(`Generating standings image ${partIndex}/${teamChunks.length} for match ${quickMatchId}`, {
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

                const r2Key = this.extractR2KeyFromUrl(rawImageUrl);
                const signedUrlData = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });

                generatedImages.push({
                    part: partIndex,
                    label: isOverflow ? 'overflow' : 'main',
                    signedUrl: signedUrlData.signedUrl,
                    originalUrl: rawImageUrl,
                    r2Key,
                    filename: chunkOutputFilename,
                    teamCount: chunk.length,
                });
            }

            const generationTimeMs = Date.now() - startTime;
            const pointsTableId = randomUUID();
            const storedImages: StoredStandingsImage[] = generatedImages.map(({ signedUrl: _s, r2Key: _k, ...rest }) => rest);

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
                tableImageUrl: response.signedImageUrl,
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

            this.logger.info(`Standings image${splitExport ? 's' : ''} generated for match ${quickMatchId}`, {
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

            const signedImages = await this.signStoredImages(storedImages);
            const csvData = record.csvData as Record<string, unknown> | null;

            return this.buildExportResponse(
                record.id,
                record.template,
                (csvData?.format_type as string) ?? this.determineFormatType(signedImages.reduce((n, i) => n + i.teamCount, 0)),
                (csvData?.total_teams as number) ?? signedImages.reduce((n, i) => n + i.teamCount, 0),
                record.generationTimeMs ?? 0,
                signedImages
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

    private buildExportResponse(
        pointsTableId: string,
        template: string,
        formatType: string,
        totalTeams: number,
        generationTimeMs: number,
        images: GeneratedStandingsImage[]
    ): ExportPointsTableResponse {
        const clientImages: ExportStandingsImage[] = images.map(({ part, label, signedUrl, filename, teamCount }) => ({
            part,
            label,
            signedUrl,
            filename,
            teamCount,
        }));

        return {
            pointsTableId,
            template,
            formatType,
            totalTeams,
            imageCount: clientImages.length,
            generationTimeMs,
            images: clientImages,
            signedImageUrl: clientImages[0]?.signedUrl ?? '',
        };
    }

    private async signStoredImages(stored: StoredStandingsImage[]): Promise<GeneratedStandingsImage[]> {
        return Promise.all(
            stored.map(async (img) => {
                const r2Key = this.extractR2KeyFromUrl(img.originalUrl);
                const signed = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });
                return {
                    ...img,
                    signedUrl: signed.signedUrl,
                    r2Key,
                };
            })
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
     * Extract R2 key from full R2 URL
     */
    private extractR2KeyFromUrl(imageUrl: string): string {
        try {
            const url = new URL(imageUrl);
            let key = url.pathname.replace(/^\/+/, ''); // Remove leading slashes
            const bucketName = process.env.R2_BUCKET_NAME;

            // Python service can return path-style URLs like:
            // https://<account>.r2.cloudflarestorage.com/<bucket>/<key>
            // Our signer expects only <key> (without bucket prefix).
            if (bucketName && key.startsWith(`${bucketName}/`)) {
                key = key.substring(bucketName.length + 1);
            }

            if (!key) {
                throw new Error('Empty R2 object key');
            }

            return key;
        } catch (error) {
            this.logger.error('Failed to extract R2 key from URL:', imageUrl);
            throw new Error('Invalid image URL format');
        }
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