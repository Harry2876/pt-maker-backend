import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { pythonAIService } from './pythonAIService';
import { tieBreakingService } from './tieBreakingService';
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
    template?: string; // 'default', 'minimal', 'detailed', etc.
}

export interface ExportPointsTableResponse {
    success: boolean;
    pointsTableId: string;
    pngUrl: string;
    csvData: any;
    generationTimeMs: number;
    tieBreakingApplied: boolean;
    conflictsResolved: number;
    manualResolutionsApplied: number;
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

        try {
            const { quickMatchId, userId, template = this.DEFAULT_TEMPLATE } = request;

            this.logger.info(`Starting points table export for Quick Match ${quickMatchId}`);

            // 1. Verify match exists and is completed
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            if (quickMatch.status !== 'COMPLETED') {
                throw new Error(`Cannot export points table. Match status: ${quickMatch.status}. Please complete result processing first.`);
            }

            // 2. Get match results
            const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
            
            if (results.length === 0) {
                throw new Error('No results found for this match. Please process results first.');
            }

            // 3. Detect and resolve tie-breaking conflicts
            const conflictDetection = await tieBreakingService.detectMatchConflicts(results);
            let finalResults = results;
            let tieBreakingApplied = false;
            let conflictsResolved = 0;
            let manualResolutionsApplied = 0;

            if (conflictDetection.hasConflicts) {
                this.logger.info(`Conflicts detected: ${conflictDetection.conflictGroups.length} groups, ${conflictDetection.totalConflictedTeams} teams`);
                
                // Get tie-breaking configuration
                const tieBreakingConfig = await tieBreakingService.getTieBreakingConfig(quickMatchId, 'match');
                
                if (tieBreakingConfig && tieBreakingConfig.autoResolveEnabled) {
                    const tieBreakingResult = await tieBreakingService.applyAutomaticTieBreaking(
                        conflictDetection.conflictGroups,
                        tieBreakingConfig.rules
                    );
                    
                    finalResults = tieBreakingResult.resolvedResults;
                    tieBreakingApplied = true;
                    conflictsResolved = tieBreakingResult.summary.autoResolved;
                    manualResolutionsApplied = tieBreakingResult.summary.manuallyResolved;
                    
                    this.logger.info(`Tie-breaking applied: ${conflictsResolved} auto-resolved, ${manualResolutionsApplied} manual`);
                }
            }

            // 4. Generate enhanced results for Python AI
            const enhancedResults = tieBreakingApplied ? 
                await tieBreakingService.generateEnhancedResults(results, {
                    originalResults: results,
                    resolvedResults: finalResults,
                    appliedRules: [],
                    manualResolutions: [],
                    summary: { totalTeams: finalResults.length, conflictsDetected: conflictDetection.conflictGroups.length, autoResolved: conflictsResolved, manuallyResolved: manualResolutionsApplied, remainingConflicts: 0 }
                }) : null;

            const matchResults = enhancedResults ? enhancedResults.map(result => ({
                slot_number: result.slotNumber,
                team_name: result.teamName,
                position: result.finalPosition,
                original_position: result.originalPosition,
                total_kills: result.totalKills,
                position_points: result.positionPoints,
                kill_points: result.killPoints,
                total_points: result.totalPoints,
                tie_breaking_applied: result.tieBreakingApplied,
                tie_breaking_method: result.tieBreakingMethod || null
            })) : finalResults.map(result => ({
                slot_number: result.slotNumber,
                team_name: result.teamName,
                position: result.position,
                total_kills: result.totalKills,
                position_points: result.positionPoints,
                kill_points: result.killPoints,
                total_points: result.totalPoints
            }));

            // 4. Call Python AI to generate points table
            this.logger.info(`Calling Python AI to generate points table with ${results.length} teams`);
            
            const aiResponse = await pythonAIService.generatePointsTable(
                matchResults,
                quickMatch.matchName,
                template
            );

            // 5. Create points table record
            const pointsTableId = randomUUID();
            const pointsTable: QuickPointsTableCache = {
                id: pointsTableId,
                quickMatchId,
                tableImageUrl: aiResponse.data.png_url,
                csvData: aiResponse.data.csv_data,
                pngGeneratedAt: new Date().toISOString(),
                generationTimeMs: aiResponse.metadata?.generation_time_ms,
                template,
                expiresAt: this.calculateExpiryDate(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED' // Direct DB write, so it's synced
            };

            const generationTimeMs = Date.now() - startTime;

            // 6. Store directly in database (no queue needed)
            await this.db.quickPointsTable.create({
                data: {
                    id: pointsTableId,
                    quickMatchId: quickMatchId,
                    tableImageUrl: aiResponse.data.png_url,
                    csvData: aiResponse.data.csv_data,
                    pngGeneratedAt: new Date(),
                    generationTimeMs: generationTimeMs,
                    template: 'default',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // 7. Cache the result for quick access
            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, pointsTable, this.EXPORT_CACHE_TTL);
            await redis.set(`quickMatch:${quickMatchId}:pointsTable`, pointsTableId, this.EXPORT_CACHE_TTL);

            this.logger.info(`Points table exported successfully: ${pointsTableId} (${generationTimeMs}ms, tie-breaking: ${tieBreakingApplied})`);

            return {
                success: true,
                pointsTableId,
                pngUrl: aiResponse.data.png_url,
                csvData: aiResponse.data.csv_data,
                generationTimeMs,
                tieBreakingApplied,
                conflictsResolved,
                manualResolutionsApplied
            };

        } catch (error) {
            this.handleError(error, 'Export Points Table');
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
            const pointsTable: QuickPointsTableCache = {
                id: dbPointsTable.id,
                quickMatchId: dbPointsTable.quickMatchId,
                tableImageUrl: dbPointsTable.tableImageUrl || undefined,
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
        template?: string
    ): Promise<ExportPointsTableResponse> {
        try {
            this.logger.info(`Regenerating points table for Quick Match ${quickMatchId}`);

            // Simply call export again (it will generate a new one)
            return await this.exportPointsTable({
                quickMatchId,
                userId,
                template
            });

        } catch (error) {
            this.handleError(error, 'Regenerate Points Table');
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