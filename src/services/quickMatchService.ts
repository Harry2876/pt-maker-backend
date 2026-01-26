import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import {
    QuickMatchCache,
    CreateQuickMatchData,
    UpdateQuickMatchData,
    QuickMatchStatus
} from '../types/quickMatch';

export class QuickMatchService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

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
                status: 'ACTIVE',
                teamsDetected: 0,
                warningsCount: 0,
                positionPointsConfig,
                killPointsValue,
                scoringDescription,
                userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED' // Direct DB write, so it's synced
            };

            // 4. Store directly in database (no queue needed)
            await this.db.quickMatch.create({
                data: {
                    id: quickMatchId,
                    matchName: `Quick Match ${new Date().toISOString().slice(0, 10)}`,
                    game: 'BGMI',
                    userId,
                    status: 'ACTIVE',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // 5. Cache the result for quick access
            await redis.hsetObject(`quickMatch:${quickMatchId}`, quickMatch);
            await redis.sadd(`user:${userId}:quickMatches`, quickMatchId);

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
                dbStatus: 'SYNCED' // Direct DB write, so it's synced
            };

            // 3. Update directly in database (no queue needed)
            await this.db.quickMatch.update({
                where: { id: quickMatchId },
                data: {
                    status: data.status as any,
                    updatedAt: new Date()
                }
            });

            // 4. Update Redis cache
            await redis.hsetObject(`quickMatch:${quickMatchId}`, updated);

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

}

export const quickMatchService = new QuickMatchService();