import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { templateService } from './templateService';
import { tieBreakingService } from './tieBreakingService';
import { signedUrlUtility } from './signedUrlUtility';
import { QuickPointsTableCache } from '../types/quickResult';
import { pythonAIService } from './pythonAIService';
import { StandingsTeamData } from '../types/pythonAI';
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

export interface ExportPointsTableResponse {
    success: boolean;
    pointsTableId: string;
    signedImageUrl: string;        // New: signed URL instead of direct URL
    originalImageUrl: string;      // New: original R2 URL
    r2Key: string;                // New: R2 storage key
    pngUrl: string;               // Keep for backward compatibility
    csvData: any;
    generationTimeMs: number;
    tieBreakingApplied: boolean;
    conflictsResolved: number;
    manualResolutionsApplied: number;
    // New: Enhanced metadata
    formatType: string;
    templateUsed: string;
    teamsProcessed: number;
    standingsMetadata: {
        processing_time_seconds: number;
        image_dimensions: string;
        template_source: string;
        total_text_elements: number;
        r2_upload_success: boolean;
    };
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
            if (!quickMatch) throw new Error('Quick Match not found or access denied');

            // 2. Get match results
            const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
            if (results.length === 0) throw new Error('No match results found. Process result screenshots first.');

            // 3. Resolve template → get raw R2 URLs for the Python API
            const templateName = template || this.DEFAULT_TEMPLATE;
            let resolvedFormatType = formatType;

            // Auto-detect format from template category if not supplied
            if (!resolvedFormatType) {
                resolvedFormatType = this.determineFormatType(results.length);
            }

            const templateConfig = await templateService.getTemplateWithConfig(templateName, resolvedFormatType);
            if (!templateConfig) {
                throw new Error(`Template "${templateName}" not found for format "${resolvedFormatType}". Check available templates.`);
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

            // 5. Call Python AI to generate standings image
            // Use raw R2 URLs — Python accesses R2 directly with its own credentials
            const standingsReq = {
                template_url: templateConfig.templateUrl,        // raw R2 URL
                template_config_url: templateConfig.configUrl,   // raw R2 URL (rawConfigUrl)
                format_type: resolvedFormatType as '8_teams' | '16_teams' | '24_teams',
                team_data: teamData,
                output_filename: outputFilename,
                table_font_size: tableFontSize ?? null,
                table_header_font_size: tableHeaderFontSize ?? null,
                table_header_label_mode: tableHeaderLabelMode ?? null,
                row_height_adjust: rowHeightAdjust ?? null,
                element_overrides: elementOverrides ?? null,
                column_overrides: columnOverrides ?? null,
                advanced_config: advancedConfig ?? null,
                options: { upload_to_r2: true },
            };

            this.logger.info(`Generating standings image for match ${quickMatchId}`, {
                template: templateName,
                formatType: resolvedFormatType,
                teams: teamData.length,
            });

            const pyResponse = await pythonAIService.generateStandings(standingsReq);

            if (pyResponse.status !== 'success') {
                throw new Error(`Python AI standings generation failed: ${pyResponse.status}`);
            }

            // 6. Extract and sign the generated image URL
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
            const signedImageUrl = signedUrlData.signedUrl;

            const generationTimeMs = Date.now() - startTime;
            const pointsTableId = randomUUID();

            // 7. Persist to DB and cache (upsert so re-exports overwrite previous record)
            await this.db.quickPointsTable.upsert({
                where: { quickMatchId },
                update: {
                    id: pointsTableId,
                    tableImageUrl: rawImageUrl,
                    pngGeneratedAt: new Date(),
                    generationTimeMs,
                    template: templateName,
                    expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000),
                    csvData: JSON.parse(JSON.stringify({
                        original_image_url: rawImageUrl,
                        format_type: resolvedFormatType,
                        teams: teamData,
                        python_response_data: pyResponse.data,
                    })),
                },
                create: {
                    id: pointsTableId,
                    quickMatchId,
                    tableImageUrl: rawImageUrl,
                    pngGeneratedAt: new Date(),
                    generationTimeMs,
                    template: templateName,
                    expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000),
                    csvData: JSON.parse(JSON.stringify({
                        original_image_url: rawImageUrl,
                        format_type: resolvedFormatType,
                        teams: teamData,
                        python_response_data: pyResponse.data,
                    })),
                },
            });

            const cacheEntry: QuickPointsTableCache = {
                id: pointsTableId,
                quickMatchId,
                tableImageUrl: signedImageUrl,
                generationTimeMs,
                template: templateName,
                expiresAt: new Date(Date.now() + this.EXPORT_CACHE_TTL * 1000).toISOString(),
                csvData: { original_image_url: rawImageUrl },
                pngGeneratedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED',
            };

            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, cacheEntry, this.EXPORT_CACHE_TTL);
            await redis.set(`quickMatch:${quickMatchId}:pointsTable`, pointsTableId, this.EXPORT_CACHE_TTL);

            this.logger.info(`Standings image generated for match ${quickMatchId}`, {
                pointsTableId,
                generationTimeMs,
            });

            const stats = pyResponse.metadata?.processing_stats;

            return {
                success: true,
                pointsTableId,
                signedImageUrl,
                originalImageUrl: rawImageUrl,
                r2Key,
                pngUrl: signedImageUrl,
                csvData: { teams: teamData },
                generationTimeMs,
                tieBreakingApplied: false,
                conflictsResolved: 0,
                manualResolutionsApplied: 0,
                formatType: resolvedFormatType,
                templateUsed: templateName,
                teamsProcessed: teamData.length,
                standingsMetadata: {
                    processing_time_seconds: (stats?.processing_time_ms ?? generationTimeMs) / 1000,
                    image_dimensions: pyResponse.metadata?.image_dimensions ?? '',
                    template_source: templateConfig.templateUrl,
                    total_text_elements: stats?.teams_processed ?? teamData.length,
                    r2_upload_success: !!rawImageUrl,
                },
            };

        } catch (error) {
            this.logger.error(`exportPointsTable failed for match ${quickMatchId}:`, error);
            throw error;
        }
    }

    /**
     * Get existing points table for a match
     */
    async getPointsTable(
        quickMatchId: string,
        userId: string
    ): Promise<QuickPointsTableCache | null> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Check Redis cache first
            const cachedId = await redis.get(`quickMatch:${quickMatchId}:pointsTable`);
            if (cachedId) {
                const cached = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${cachedId}`);
                if (cached) {
                    // Refresh signed URL on every read to avoid expired links in app.
                    if (cached.tableImageUrl) {
                        try {
                            const originalImageUrl = (cached.csvData as any)?.original_image_url;
                            const sourceUrl = originalImageUrl || cached.tableImageUrl;
                            const r2Key = this.extractR2KeyFromUrl(sourceUrl);
                            const signedUrlData = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });
                            cached.tableImageUrl = signedUrlData.signedUrl;
                            if (cached.csvData && typeof cached.csvData === 'object') {
                                (cached.csvData as any).signed_url_expires_at = signedUrlData.expiresAt.toISOString();
                            }
                            await redis.hsetObject(`quickPointsTable:${cachedId}`, cached, this.EXPORT_CACHE_TTL);
                        } catch (error) {
                            this.logger.warn('Failed to refresh signed URL from cache entry, returning cached value', {
                                pointsTableId: cachedId,
                                tableImageUrl: cached.tableImageUrl
                            });
                        }
                    }
                    return cached;
                }
            }

            // 3. Fallback to database
            const dbPointsTable = await this.db.quickPointsTable.findFirst({
                where: { quickMatchId },
                orderBy: { createdAt: 'desc' } // Get latest
            });

            if (!dbPointsTable) {
                return null;
            }

            // 4. Convert to cache format
            let tableImageUrl = dbPointsTable.tableImageUrl || undefined;

            // Always provide a signed URL to the app when possible.
            if (tableImageUrl) {
                try {
                    const r2Key = this.extractR2KeyFromUrl(tableImageUrl);
                    const signedUrlData = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });
                    tableImageUrl = signedUrlData.signedUrl;
                } catch (error) {
                    this.logger.warn('Failed to sign points table image URL, returning original URL', {
                        pointsTableId: dbPointsTable.id,
                        imageUrl: tableImageUrl
                    });
                }
            }

            const pointsTable: QuickPointsTableCache = {
                id: dbPointsTable.id,
                quickMatchId: dbPointsTable.quickMatchId,
                tableImageUrl,
                csvData: dbPointsTable.csvData,
                pngGeneratedAt: dbPointsTable.pngGeneratedAt?.toISOString(),
                generationTimeMs: dbPointsTable.generationTimeMs || undefined,
                template: dbPointsTable.template,
                expiresAt: dbPointsTable.expiresAt?.toISOString(),
                createdAt: dbPointsTable.createdAt.toISOString(),
                updatedAt: dbPointsTable.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // 5. Cache it
            await redis.hsetObject(`quickPointsTable:${pointsTable.id}`, pointsTable, this.EXPORT_CACHE_TTL);

            return pointsTable;

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
            const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
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
            const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
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