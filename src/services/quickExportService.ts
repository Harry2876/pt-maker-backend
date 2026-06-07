import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { templateService } from './templateService';
import { tieBreakingService } from './tieBreakingService';
import { r2Service } from './cloudflareR2Service';
import { signedUrlUtility } from './signedUrlUtility';
import { QuickPointsTableCache } from '../types/quickResult';
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
    template?: string; // Template name (e.g., "tmplate_1")
    formatType?: string; // '24_teams', '16_teams', etc.
    outputFilename?: string; // Custom output filename
    customization?: {
        fonts?: {
            main_font_name?: string;
            bold_font_name?: string;
        };
        font_customization?: {
            global_size_multiplier?: number;
            override_all_fonts?: boolean;
            default_font_family?: string;
            default_font_weight?: string;
        };
        advanced_config?: {
            header?: {
                event_name?: {
                    enabled?: boolean;
                    text?: string;
                    font?: { size?: number; color?: string; weight?: string; family?: string };
                };
                sponsor_name?: {
                    enabled?: boolean;
                    text?: string;
                    font?: { size?: number; color?: string; weight?: string };
                };
            };
            organiser?: {
                name?: {
                    enabled?: boolean;
                    text?: string;
                    font?: { size?: number; color?: string; weight?: string; family?: string };
                };
            };
            event_details?: {
                week_info?: { enabled?: boolean; text?: string };
                day_info?: { enabled?: boolean; text?: string };
            };
            footer?: {
                live_indicator?: { enabled?: boolean };
            };
        };
    };
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
        // TODO: Re-implement with new Python API endpoint
        throw new Error('Not implemented: pending new Python API integration');
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
        quickMatchId: string,
        userId: string,
        template?: string,
        formatType?: string,
        outputFilename?: string,
        customization?: any
    ): Promise<ExportPointsTableResponse> {
        // TODO: Re-implement with new Python API endpoint
        throw new Error('Not implemented: pending new Python API integration');
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