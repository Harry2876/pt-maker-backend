import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { PointsCalculator } from '../utils/pointsCalculator';
import { QuickMatchResultCache, CreateQuickMatchResultData } from '../types/quickResult';
import { QuickMatchCache } from '../types/quickMatch';
import { QuickSlotCache } from '../types/quickSlot';
import {
    CreateManualResultData,
    UpdateManualResultData,
    ValidationResult,
    ValidationError,
    ValidationWarning,
    PointsBreakdown,
    BulkResultCreationData,
    BulkOperationResult
} from '../types/manualResult';

export class QuickResultService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Create a manual result entry
     */
    async createManualResult(
        quickMatchId: string,
        userId: string,
        data: CreateManualResultData
    ): Promise<QuickMatchResultCache> {
        try {
            // 1. Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Validate the result data
            const validation = await this.validateResultConstraints(quickMatchId, data);
            if (!validation.isValid) {
                throw new Error(`Validation failed: ${validation.errors[0]?.message}`);
            }

            // 3. Calculate points using the match's scoring configuration
            const pointsBreakdown = await this.recalculatePoints(data, quickMatch);

            // 4. Create the result with calculated points
            const resultId = randomUUID();
            const result: QuickMatchResultCache = {
                id: resultId,
                quickMatchId,
                slotNumber: data.slotNumber,
                teamName: data.teamName,
                detectedTeamName: data.teamName, // Same for manual entry
                position: data.position,
                rank: data.rank,
                totalKills: data.totalKills,
                positionPoints: pointsBreakdown.positionPoints,
                killPoints: pointsBreakdown.killPoints,
                totalPoints: pointsBreakdown.totalPoints,
                playerResults: data.playerResults,
                status: 'MANUAL_ENTRY',
                warningType: undefined,
                needsReview: false,
                aiConfidence: undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Store in Redis cache
            await redis.hsetObject(`quickResult:${resultId}`, result, this.CACHE_TTL);
            await redis.sadd(`quickMatch:${quickMatchId}:results`, resultId);

            // 6. Queue database sync
            await this.queueDatabaseSync('CREATE', resultId, result, userId);

            // 7. Update match status to COMPLETED for manual workflow
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'COMPLETED'
            });

            this.logger.info(`Manual result created for slot ${data.slotNumber} in match ${quickMatchId}`);
            return result;

        } catch (error) {
            this.handleError(error, 'Create Manual Result');
            throw error;
        }
    }

    /**
     * Update an existing result
     */
    async updateManualResult(
        resultId: string,
        userId: string,
        data: UpdateManualResultData
    ): Promise<QuickMatchResultCache | null> {
        try {
            // 1. Get existing result
            const existing = await redis.hgetObject<QuickMatchResultCache>(`quickResult:${resultId}`);
            if (!existing) {
                throw new Error('Result not found');
            }

            // 2. Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(existing.quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 3. Validate updates
            const validation = await this.validateResultConstraints(
                existing.quickMatchId, 
                { ...existing, ...data },
                resultId
            );
            if (!validation.isValid) {
                throw new Error(`Validation failed: ${validation.errors[0]?.message}`);
            }

            // 4. Recalculate points if position or kills changed
            let pointsBreakdown = {
                positionPoints: existing.positionPoints,
                killPoints: existing.killPoints,
                totalPoints: existing.totalPoints,
                calculation: {
                    position: existing.position,
                    positionValue: existing.positionPoints,
                    totalKills: existing.totalKills,
                    killValue: existing.killPoints
                }
            };

            if (data.position !== undefined || data.totalKills !== undefined) {
                const updatedData = { ...existing, ...data };
                pointsBreakdown = await this.recalculatePoints(updatedData, quickMatch);
            }

            // 5. Create updated result
            const updated: QuickMatchResultCache = {
                ...existing,
                ...data,
                positionPoints: pointsBreakdown.positionPoints,
                killPoints: pointsBreakdown.killPoints,
                totalPoints: pointsBreakdown.totalPoints,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 6. Update Redis cache
            await redis.hsetObject(`quickResult:${resultId}`, updated, this.CACHE_TTL);

            // 7. Queue database sync
            await this.queueDatabaseSync('UPDATE', resultId, updated, userId);

            this.logger.info(`Manual result ${resultId} updated in match ${existing.quickMatchId}`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update Manual Result');
            throw error;
        }
    }

    /**
     * Delete a result
     */
    async deleteResult(resultId: string, userId: string): Promise<void> {
        try {
            // 1. Get existing result
            const existing = await redis.hgetObject<QuickMatchResultCache>(`quickResult:${resultId}`);
            if (!existing) {
                throw new Error('Result not found');
            }

            // 2. Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(existing.quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 3. Delete from Redis
            await redis.delete(`quickResult:${resultId}`);
            await redis.srem(`quickMatch:${existing.quickMatchId}:results`, resultId);

            // 4. Queue database deletion
            await this.queueDatabaseSync('DELETE', resultId, { id: resultId }, userId);

            this.logger.info(`Manual result ${resultId} deleted from match ${existing.quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete Manual Result');
            throw error;
        }
    }

    /**
     * Get all results for a match
     */
    async getMatchResults(quickMatchId: string, userId: string): Promise<QuickMatchResultCache[]> {
        try {
            // Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // Get result IDs from Redis
            const resultIds = await redis.smembers(`quickMatch:${quickMatchId}:results`);

            if (resultIds.length === 0) {
                // Fallback to database
                const dbResults = await this.db.quickMatchResult.findMany({
                    where: { quickMatchId },
                    orderBy: [
                        { position: 'asc' },
                        { totalPoints: 'desc' }
                    ]
                });

                // Convert and cache
                const results = dbResults.map(this.convertDbToCache);
                for (const result of results) {
                    await redis.hsetObject(`quickResult:${result.id}`, result, this.CACHE_TTL);
                    await redis.sadd(`quickMatch:${quickMatchId}:results`, result.id);
                }

                return results;
            }

            // Get results from Redis
            const results = await Promise.all(
                resultIds.map(async (id) => {
                    return await redis.hgetObject<QuickMatchResultCache>(`quickResult:${id}`);
                })
            );

            return results.filter(r => r !== null).sort((a, b) => {
                if (a.position !== b.position) return a.position - b.position;
                return b.totalPoints - a.totalPoints;
            });

        } catch (error) {
            this.handleError(error, 'Get Match Results');
            return [];
        }
    }
    /**
     * Create multiple manual results in bulk
     */
    async createBulkManualResults(
        quickMatchId: string,
        userId: string,
        data: BulkResultCreationData
    ): Promise<BulkOperationResult> {
        try {
            // 1. Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            const result: BulkOperationResult = {
                success: true,
                created: [],
                updated: [],
                errors: [],
                summary: {
                    total: data.results.length,
                    successful: 0,
                    failed: 0
                }
            };

            // 2. Replace existing results if requested
            if (data.replaceExisting) {
                const existingResults = await this.getMatchResults(quickMatchId, userId);
                for (const existing of existingResults) {
                    await this.deleteResult(existing.id, userId);
                }
            }

            // 3. Process each result
            for (const resultData of data.results) {
                try {
                    // 4. Validate if requested
                    if (data.validateConstraints) {
                        const validation = await this.validateResultConstraints(quickMatchId, resultData);
                        if (!validation.isValid) {
                            result.errors.push(...validation.errors);
                            result.summary.failed++;
                            continue;
                        }
                    }

                    // 5. Create the result
                    const createdResult = await this.createManualResult(quickMatchId, userId, {
                        ...resultData,
                        source: 'MANUAL_ENTRY',
                        entryMethod: 'BULK',
                        enteredBy: userId
                    });

                    result.created.push(createdResult);
                    result.summary.successful++;

                } catch (error) {
                    result.errors.push({
                        field: 'general',
                        code: 'CREATION_ERROR',
                        message: `Failed to create result for slot ${resultData.slotNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        value: resultData.slotNumber
                    });
                    result.summary.failed++;
                }
            }

            // 6. Determine overall success
            if (result.errors.length > 0 && result.created.length === 0) {
                result.success = false;
            }

            // 7. Update match status to COMPLETED if any results were created
            if (result.created.length > 0) {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'COMPLETED'
                });
            }

            this.logger.info(`Bulk result creation completed: ${result.summary.successful}/${result.summary.total} successful`);
            return result;

        } catch (error) {
            this.handleError(error, 'Bulk Create Manual Results');
            return {
                success: false,
                created: [],
                updated: [],
                errors: [{
                    field: 'general',
                    code: 'BULK_OPERATION_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown bulk operation error'
                }],
                summary: {
                    total: data.results.length,
                    successful: 0,
                    failed: data.results.length
                }
            };
        }
    }

    /**
     * Update multiple results in bulk
     */
    async updateBulkManualResults(
        quickMatchId: string,
        userId: string,
        updates: Array<{resultId: string, data: UpdateManualResultData}>
    ): Promise<BulkOperationResult> {
        try {
            const result: BulkOperationResult = {
                success: true,
                created: [],
                updated: [],
                errors: [],
                summary: {
                    total: updates.length,
                    successful: 0,
                    failed: 0
                }
            };

            // Process each update
            for (const updateItem of updates) {
                try {
                    const updatedResult = await this.updateManualResult(updateItem.resultId, userId, {
                        ...updateItem.data,
                        modifiedBy: userId
                    });

                    if (updatedResult) {
                        result.updated.push(updatedResult);
                        result.summary.successful++;
                    } else {
                        result.errors.push({
                            field: 'resultId',
                            code: 'UPDATE_ERROR',
                            message: `Failed to update result ${updateItem.resultId}: Result not found`,
                            value: updateItem.resultId
                        });
                        result.summary.failed++;
                    }

                } catch (error) {
                    result.errors.push({
                        field: 'resultId',
                        code: 'UPDATE_ERROR',
                        message: `Failed to update result ${updateItem.resultId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        value: updateItem.resultId
                    });
                    result.summary.failed++;
                }
            }

            // Determine overall success
            if (result.errors.length > 0 && result.updated.length === 0) {
                result.success = false;
            }

            this.logger.info(`Bulk result update completed: ${result.summary.successful}/${result.summary.total} successful`);
            return result;

        } catch (error) {
            this.handleError(error, 'Bulk Update Manual Results');
            return {
                success: false,
                created: [],
                updated: [],
                errors: [{
                    field: 'general',
                    code: 'BULK_UPDATE_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown bulk update error'
                }],
                summary: {
                    total: updates.length,
                    successful: 0,
                    failed: updates.length
                }
            };
        }
    }

    /**
     * Delete multiple results in bulk
     */
    async deleteBulkManualResults(
        quickMatchId: string,
        userId: string,
        resultIds: string[]
    ): Promise<BulkOperationResult> {
        try {
            const result: BulkOperationResult = {
                success: true,
                created: [],
                updated: [],
                errors: [],
                summary: {
                    total: resultIds.length,
                    successful: 0,
                    failed: 0
                }
            };

            // Process each deletion
            for (const resultId of resultIds) {
                try {
                    await this.deleteResult(resultId, userId);
                    result.summary.successful++;

                } catch (error) {
                    result.errors.push({
                        field: 'resultId',
                        code: 'DELETE_ERROR',
                        message: `Failed to delete result ${resultId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        value: resultId
                    });
                    result.summary.failed++;
                }
            }

            // Determine overall success
            result.success = result.summary.successful > 0;

            this.logger.info(`Bulk result deletion completed: ${result.summary.successful}/${result.summary.total} successful`);
            return result;

        } catch (error) {
            this.handleError(error, 'Bulk Delete Manual Results');
            return {
                success: false,
                created: [],
                updated: [],
                errors: [{
                    field: 'general',
                    code: 'BULK_DELETE_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown bulk delete error'
                }],
                summary: {
                    total: resultIds.length,
                    successful: 0,
                    failed: resultIds.length
                }
            };
        }
    }
        /**
     * Validate result constraints and business rules
     */
    async validateResultConstraints(
        quickMatchId: string,
        data: CreateManualResultData | UpdateManualResultData,
        excludeResultId?: string
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        try {
            // 1. Check if slot exists
            if ('slotNumber' in data && data.slotNumber !== undefined) {
                const slot = await quickSlotService.getSlotByNumber(quickMatchId, data.slotNumber);
                if (!slot) {
                    errors.push({
                        field: 'slotNumber',
                        code: 'SLOT_NOT_FOUND',
                        message: `Slot ${data.slotNumber} does not exist for this match`,
                        value: data.slotNumber
                    });
                }
            }

            // 2. Check position uniqueness
            const existingResults = await this.db.quickMatchResult.findMany({
                where: { 
                    quickMatchId,
                    id: excludeResultId ? { not: excludeResultId } : undefined
                },
                select: { id: true, position: true, slotNumber: true, teamName: true }
            });

            // Check position conflicts
            if ('position' in data && data.position !== undefined) {
                const positionConflict = existingResults.find(r => r.position === data.position);
                if (positionConflict) {
                    errors.push({
                        field: 'position',
                        code: 'DUPLICATE_POSITION',
                        message: `Position ${data.position} is already taken by ${positionConflict.teamName}`,
                        value: data.position
                    });
                }
            }

            // Check slot conflicts
            if ('slotNumber' in data && data.slotNumber !== undefined) {
                const slotConflict = existingResults.find(r => r.slotNumber === data.slotNumber);
                if (slotConflict) {
                    errors.push({
                        field: 'slotNumber',
                        code: 'DUPLICATE_SLOT',
                        message: `Slot ${data.slotNumber} already has a result`,
                        value: data.slotNumber
                    });
                }
            }

            // 3. Validate player results if provided
            if (data.playerResults && data.playerResults.length > 0) {
                const totalPlayerKills = data.playerResults.reduce((sum, p) => sum + p.kills, 0);
                if (totalPlayerKills !== data.totalKills) {
                    warnings.push({
                        type: 'KILLS_MISMATCH',
                        message: `Individual player kills (${totalPlayerKills}) don't match total kills (${data.totalKills})`
                    });
                }
            }

            return {
                isValid: errors.length === 0,
                errors,
                warnings
            };

        } catch (error) {
            errors.push({
                field: 'general',
                code: 'VALIDATION_ERROR',
                message: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });

            return {
                isValid: false,
                errors,
                warnings
            };
        }
    }

    /**
     * Calculate points using match scoring configuration
     */
    async recalculatePoints(
        result: CreateManualResultData | UpdateManualResultData,
        match: QuickMatchCache
    ): Promise<PointsBreakdown> {
        try {
            // Extract scoring configuration
            const positionPointsConfig = match.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0];
            const killPointsValue = match.killPointsValue || 1;

            // Get position and totalKills with defaults
            const position = result.position ?? 25; // Default to last place
            const totalKills = result.totalKills ?? 0; // Default to 0 kills

            // Calculate position points (position is 1-based, array is 0-based)
            const positionIndex = Math.min(Math.max(position - 1, 0), positionPointsConfig.length - 1);
            const positionPoints = positionPointsConfig[positionIndex] || 0;

            // Calculate kill points
            const killPoints = totalKills * killPointsValue;

            // Calculate total
            const totalPoints = positionPoints + killPoints;

            return {
                positionPoints,
                killPoints,
                totalPoints,
                calculation: {
                    position,
                    positionValue: positionPoints,
                    totalKills,
                    killValue: killPointsValue
                }
            };

        } catch (error) {
            this.logger.error('Points calculation failed:', error);
            throw new Error('Failed to calculate points');
        }
    }

    /**
     * Check for position conflicts
     */
    async checkPositionConflicts(
        quickMatchId: string, 
        position: number, 
        excludeResultId?: string
    ): Promise<boolean> {
        try {
            const existingResult = await this.db.quickMatchResult.findFirst({
                where: {
                    quickMatchId,
                    position,
                    id: excludeResultId ? { not: excludeResultId } : undefined
                }
            });

            return existingResult !== null;
        } catch (error) {
            this.logger.error('Error checking position conflicts:', error);
            return false;
        }
    }

    /**
     * Queue database sync operation
     */
    private async queueDatabaseSync(
        operation: 'CREATE' | 'UPDATE' | 'DELETE',
        entityId: string,
        data: any,
        userId: string
    ): Promise<void> {
        try {
            // Import QueueService dynamically to avoid circular dependency
            const { QueueService } = await import('./queueService');
            
            await QueueService.syncQuickPtImmediately(
                'QUICK_RESULT',
                operation as 'CREATE' | 'UPDATE',
                entityId,
                data,
                userId
            );
        } catch (error) {
            this.logger.error('Failed to queue database sync:', error);
            // Don't throw - let the operation continue with cache-only storage
        }
    }

    /**
     * Convert database result to cache format
     */
    private convertDbToCache = (dbResult: any): QuickMatchResultCache => {
        return {
            id: dbResult.id,
            quickMatchId: dbResult.quickMatchId,
            slotNumber: dbResult.slotNumber,
            teamName: dbResult.teamName,
            detectedTeamName: dbResult.detectedTeamName,
            position: dbResult.position,
            rank: dbResult.rank,
            totalKills: dbResult.totalKills,
            positionPoints: dbResult.positionPoints,
            killPoints: dbResult.killPoints,
            totalPoints: dbResult.totalPoints,
            playerResults: dbResult.playerResults 
                ? JSON.parse(JSON.stringify(dbResult.playerResults))
                : undefined,
            status: dbResult.status,
            warningType: dbResult.warningType,
            needsReview: dbResult.needsReview,
            aiConfidence: dbResult.aiConfidence,
            createdAt: dbResult.createdAt.toISOString(),
            updatedAt: dbResult.updatedAt.toISOString(),
            dbStatus: 'SYNCED'
        };
    }
}


export const quickResultService = new QuickResultService();
