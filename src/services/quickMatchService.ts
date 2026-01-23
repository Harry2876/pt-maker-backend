import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    QuickMatchCache,
    CreateQuickMatchData,
    UpdateQuickMatchData,
    QuickMatchStatus
} from '../types/quickMatch';
import { quickMatchStateMachine } from './quickMatchStateMachine';
import { QuickMatchStateContext, StateTransitionResult } from '../types/stateMachine';

export class QuickMatchService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
 * Helper method to build state context for validation
 * This method gets counts from database for accuracy
 */
    private async buildStateContextForMatch(quickMatchId: string, userId: string): Promise<QuickMatchStateContext | null> {
        try {
            // Get the current match
            const quickMatch = await this.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                return null;
            }

            // Hybrid approach: Try Redis first, fallback to database
            let slotsCount = 0;
            let attendanceScreenshotsCount = 0;
            let resultScreenshotsCount = 0;

            try {
                // Try Redis first (current application state)
                slotsCount = await redis.scard(`quickMatch:${quickMatchId}:slots`);
                attendanceScreenshotsCount = await redis.scard(`quickMatch:${quickMatchId}:attendanceScreenshots`) || 0;
                resultScreenshotsCount = await redis.scard(`quickMatch:${quickMatchId}:resultScreenshots`) || 0;

                // If Redis has no data (system restart/maintenance), recover from database
                if (slotsCount === 0) {
                    const recoveredCounts = await this.recoverStateFromDatabase(quickMatchId);
                    slotsCount = recoveredCounts.slotsCount;
                    attendanceScreenshotsCount = recoveredCounts.attendanceScreenshotsCount;
                    resultScreenshotsCount = recoveredCounts.resultScreenshotsCount;
                }

            } catch (redisError) {
                // Redis unavailable, fallback to database completely
                this.logger.warn(`Redis unavailable for state context, using database fallback:`, redisError);
                const recoveredCounts = await this.recoverStateFromDatabase(quickMatchId);
                slotsCount = recoveredCounts.slotsCount;
                attendanceScreenshotsCount = recoveredCounts.attendanceScreenshotsCount;
                resultScreenshotsCount = recoveredCounts.resultScreenshotsCount;
            }

            return {
                id: quickMatch.id,
                currentStatus: quickMatch.status,
                slotsCount: slotsCount,
                attendanceScreenshotsCount: attendanceScreenshotsCount,
                resultScreenshotsCount: resultScreenshotsCount,
                processingStep: quickMatch.processingStep,
                teamsDetected: quickMatch.teamsDetected
            };
        } catch (error) {
            this.logger.error(`Error building state context for match ${quickMatchId}:`, error);
            return null;
        }
    }

    /**
     * Recover state from database and rebuild Redis cache
     */
    private async recoverStateFromDatabase(quickMatchId: string): Promise<{
        slotsCount: number;
        attendanceScreenshotsCount: number;
        resultScreenshotsCount: number;
    }> {
        try {
            // Get counts from database
            const dbMatch = await this.db.quickMatch.findUnique({
                where: { id: quickMatchId },
                include: {
                    slotAssignments: { select: { id: true } },
                    screenshots: { 
                        select: { id: true, type: true },
                        where: { type: { in: ['ATTENDANCE', 'RESULT'] } }
                    }
                }
            });

            if (!dbMatch) {
                return { slotsCount: 0, attendanceScreenshotsCount: 0, resultScreenshotsCount: 0 };
            }

            const slotsCount = dbMatch.slotAssignments.length;
            const attendanceScreenshots = dbMatch.screenshots.filter(s => s.type === 'ATTENDANCE');
            const resultScreenshots = dbMatch.screenshots.filter(s => s.type === 'RESULT');

            // Rebuild Redis state for future requests (fire and forget)
            this.rebuildRedisState(quickMatchId, {
                slotIds: dbMatch.slotAssignments.map(s => s.id),
                attendanceScreenshotIds: attendanceScreenshots.map(s => s.id),
                resultScreenshotIds: resultScreenshots.map(s => s.id)
            }).catch(error => {
                this.logger.warn(`Failed to rebuild Redis state for match ${quickMatchId}:`, error);
            });

            this.logger.info(`Recovered state from database for match ${quickMatchId}: ${slotsCount} slots, ${attendanceScreenshots.length} attendance, ${resultScreenshots.length} results`);

            return {
                slotsCount: slotsCount,
                attendanceScreenshotsCount: attendanceScreenshots.length,
                resultScreenshotsCount: resultScreenshots.length
            };

        } catch (error) {
            this.logger.error(`Failed to recover state from database for match ${quickMatchId}:`, error);
            return { slotsCount: 0, attendanceScreenshotsCount: 0, resultScreenshotsCount: 0 };
        }
    }

    /**
     * Rebuild Redis state from database data (async)
     */
    private async rebuildRedisState(quickMatchId: string, data: {
        slotIds: string[];
        attendanceScreenshotIds: string[];
        resultScreenshotIds: string[];
    }): Promise<void> {
        try {
            // Rebuild slot state
            if (data.slotIds.length > 0) {
                await redis.sadd(`quickMatch:${quickMatchId}:slots`, ...data.slotIds);
            }

            // Rebuild screenshot state
            if (data.attendanceScreenshotIds.length > 0) {
                await redis.sadd(`quickMatch:${quickMatchId}:attendanceScreenshots`, ...data.attendanceScreenshotIds);
            }

            if (data.resultScreenshotIds.length > 0) {
                await redis.sadd(`quickMatch:${quickMatchId}:resultScreenshots`, ...data.resultScreenshotIds);
            }

            this.logger.info(`Redis state rebuilt for match ${quickMatchId}`);
        } catch (error) {
            this.logger.error(`Failed to rebuild Redis state for match ${quickMatchId}:`, error);
        }
    }

    /**
     * Create a new Quick Match with optional scoring configuration
     */
    async createQuickMatch(userId: string, data: CreateQuickMatchData): Promise<QuickMatchCache> {
        try {
            // 1. Generate Quick Match ID
            const quickMatchId = randomUUID();

            // 2. Set default scoring if not provided
            const positionPointsConfig = data.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0];
            const killPointsValue = data.killPointsValue ?? 1;
            const scoringDescription = data.scoringDescription || 'Standard BGMI Scoring';

            // 3. Create Quick Match object
            const quickMatch: QuickMatchCache = {
                id: quickMatchId,
                matchName: data.matchName,
                game: data.game || 'BGMI',
                map: data.map,
                status: 'CREATED',
                teamsDetected: 0,
                warningsCount: 0,
                positionPointsConfig,
                killPointsValue,
                scoringDescription,
                userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis immediately
            await redis.hsetObject(`quickMatch:${quickMatchId}`, quickMatch);
            await redis.sadd(`user:${userId}:quickMatches`, quickMatchId);

            // 5. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_MATCH', 'CREATE', quickMatchId, quickMatch, userId);

            this.logger.info(`Quick Match ${quickMatchId} created by user ${userId}`);
            return quickMatch;

        } catch (error) {
            this.handleError(error, 'Create Quick Match');
            throw error; // Re-throw after logging
        }
    }

    /**
     * Get Quick Match by ID with caching
     */
    async getQuickMatchById(quickMatchId: string, userId: string): Promise<QuickMatchCache | null> {
        try {
            // 1. Check Redis cache first
            const cached = await redis.hgetObject<QuickMatchCache>(`quickMatch:${quickMatchId}`);

            if (cached) {
                // Verify ownership
                if (cached.userId !== userId) {
                    throw new Error('Access denied to this Quick Match');
                }
                return cached;
            }

            // 2. Fallback to database
            const dbQuickMatch = await this.db.quickMatch.findUnique({
                where: { id: quickMatchId },
                include: {
                    _count: {
                        select: {
                            slotAssignments: true,
                            screenshots: true,
                            results: true
                        }
                    }
                }
            });

            if (!dbQuickMatch || dbQuickMatch.userId !== userId) {
                return null;
            }

            // 3. Convert to cache format and store in Redis
            const quickMatch: QuickMatchCache = {
                id: dbQuickMatch.id,
                matchName: dbQuickMatch.matchName,
                game: dbQuickMatch.game,
                map: dbQuickMatch.map || undefined,
                status: dbQuickMatch.status as QuickMatchStatus,
                processingStep: dbQuickMatch.processingStep || undefined,
                aiProcessingId: dbQuickMatch.aiProcessingId || undefined,
                teamsDetected: dbQuickMatch.teamsDetected,
                warningsCount: dbQuickMatch.warningsCount,
                positionPointsConfig: dbQuickMatch.positionPointsConfig
                    ? JSON.parse(JSON.stringify(dbQuickMatch.positionPointsConfig))
                    : undefined,
                killPointsValue: dbQuickMatch.killPointsValue,
                scoringDescription: dbQuickMatch.scoringDescription || undefined,
                userId: dbQuickMatch.userId,
                createdAt: dbQuickMatch.createdAt.toISOString(),
                updatedAt: dbQuickMatch.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`quickMatch:${quickMatchId}`, quickMatch, this.CACHE_TTL);

            return quickMatch;

        } catch (error) {
            this.handleError(error, 'Get Quick Match by ID');
            return null;
        }
    }

    /**
     * List all Quick Matches for a user
     */
    async listUserQuickMatches(
        userId: string,
        filters?: {
            status?: QuickMatchStatus;
            page?: number;
            limit?: number;
        }
    ): Promise<{ matches: QuickMatchCache[]; total: number; page: number; limit: number }> {
        try {
            const page = filters?.page || 1;
            const limit = filters?.limit || 10;
            const skip = (page - 1) * limit;

            // Build where clause
            const where: any = { userId };
            if (filters?.status) {
                where.status = filters.status;
            }

            // Get total count
            const total = await this.db.quickMatch.count({ where });

            // Get matches from database with pagination
            const dbMatches = await this.db.quickMatch.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    _count: {
                        select: {
                            slotAssignments: true,
                            screenshots: true,
                            results: true
                        }
                    }
                }
            });

            // Convert to cache format
            const matches: QuickMatchCache[] = dbMatches.map(dbMatch => ({
                id: dbMatch.id,
                matchName: dbMatch.matchName,
                game: dbMatch.game,
                map: dbMatch.map || undefined,
                status: dbMatch.status as QuickMatchStatus,
                processingStep: dbMatch.processingStep || undefined,
                aiProcessingId: dbMatch.aiProcessingId || undefined,
                teamsDetected: dbMatch.teamsDetected,
                warningsCount: dbMatch.warningsCount,
                positionPointsConfig: dbMatch.positionPointsConfig
                    ? JSON.parse(JSON.stringify(dbMatch.positionPointsConfig))
                    : undefined,
                killPointsValue: dbMatch.killPointsValue,
                scoringDescription: dbMatch.scoringDescription || undefined,
                userId: dbMatch.userId,
                createdAt: dbMatch.createdAt.toISOString(),
                updatedAt: dbMatch.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            }));

            return { matches, total, page, limit };

        } catch (error) {
            this.handleError(error, 'List User Quick Matches');
            throw error; // Re-throw after logging
        }
    }

    /**
     * Update Quick Match
     */
    async updateQuickMatch(
        quickMatchId: string,
        userId: string,
        data: UpdateQuickMatchData
    ): Promise<QuickMatchCache> {
        try {
            // 1. Get existing Quick Match
            const existing = await this.getQuickMatchById(quickMatchId, userId);
            if (!existing) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Update Quick Match object
            const updated: QuickMatchCache = {
                ...existing,
                ...data,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis
            await redis.hsetObject(`quickMatch:${quickMatchId}`, updated);

            // 4. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_MATCH', 'UPDATE', quickMatchId, updated, userId);

            this.logger.info(`Quick Match ${quickMatchId} updated by user ${userId}`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update Quick Match');
            throw error; // Re-throw after logging
        }
    }

    /**
     * Delete Quick Match (also deletes related data)
     */
    async deleteQuickMatch(quickMatchId: string, userId: string): Promise<void> {
        try {
            // 1. Verify ownership
            const quickMatch = await this.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Delete from database (cascade will handle related data)
            await this.db.quickMatch.delete({
                where: { id: quickMatchId }
            });

            // 3. Delete from Redis using the correct method name
            await redis.delete(`quickMatch:${quickMatchId}`);
            await redis.srem(`user:${userId}:quickMatches`, quickMatchId);

            // 4. Clean up related cache keys
            await redis.delete(`quickMatch:${quickMatchId}:slots`);
            await redis.delete(`quickMatch:${quickMatchId}:screenshots`);
            await redis.delete(`quickMatch:${quickMatchId}:results`);

            this.logger.info(`Quick Match ${quickMatchId} deleted by user ${userId}`);

        } catch (error) {
            this.handleError(error, 'Delete Quick Match');
            throw error; // Re-throw after logging
        }
    }

    /**
     * Update Quick Match status with state machine validation
     */
    async updateStatus(
        quickMatchId: string,
        userId: string,
        status: QuickMatchStatus,
        processingStep?: string
    ): Promise<QuickMatchCache> {
        try {
            // 1. Get current match and build state context
            const currentMatch = await this.getQuickMatchById(quickMatchId, userId);
            if (!currentMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Skip state validation if status is not changing
            if (currentMatch.status === status) {
                this.logger.info(`Status unchanged for match ${quickMatchId}: ${status}`);
                return await this.updateQuickMatch(quickMatchId, userId, {
                    processingStep
                });
            }

            // 3. Build state context for validation
            const stateContext = await this.buildStateContextForMatch(quickMatchId, userId);
            if (!stateContext) {
                throw new Error('Failed to build state context for validation');
            }

            // 4. Validate state transition
            const transitionResult = await quickMatchStateMachine.executeTransition(
                quickMatchId,
                status,
                stateContext
            );

            if (!transitionResult.isValid) {
                this.logger.error(`State transition rejected: ${currentMatch.status} → ${status}`, {
                    matchId: quickMatchId,
                    error: transitionResult.errorMessage,
                    errorCode: transitionResult.errorCode
                });
                throw new Error(`Invalid state transition: ${transitionResult.errorMessage}`);
            }

            // 5. Execute the status update after successful validation
            const updatedMatch = await this.updateQuickMatch(quickMatchId, userId, {
                status,
                processingStep
            });

            this.logger.info(`State transition successful: ${transitionResult.previousState} → ${transitionResult.newState}`, {
                matchId: quickMatchId,
                processingStep
            });

            return updatedMatch;

        } catch (error) {
            this.handleError(error, 'Update Quick Match Status with State Machine');
            throw error; // Re-throw after logging
        }
    }
}

export const quickMatchService = new QuickMatchService();