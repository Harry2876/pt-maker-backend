import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { CreateMatchData, UpdateMatchData, MatchCache } from '../types/match';
import { TournamentCache } from '../types/tournament';
import { GroupCache } from '@/types/group';

export class MatchService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create match with hybrid sync
    async createMatch(tournamentId: string, userId: string, data: CreateMatchData) {
        try {
            // 1. Verify tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. If groupId provided, verify group exists and belongs to tournament
            if (data.groupId) {
                const group = await redis.hgetObject<GroupCache>(`group:${data.groupId}`);
                if (!group || group.tournamentId !== tournamentId) {
                    throw new Error('Invalid group for this tournament');
                }
            }

            // 3. Generate match ID
            const matchId = randomUUID();

            // 4. Create match object
            const match: MatchCache = {
                id: matchId,
                matchNumber: data.matchNumber,
                matchDate: data.matchDate ? data.matchDate.toISOString() : new Date().toISOString(),
                status: 'PENDING_PROCESSING',
                tournamentId,
                groupId: data.groupId, // Add this line
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Store in Redis immediately
            await redis.hsetObject(`match:${matchId}`, match);

            // 6. Add to tournament's match list
            await redis.sadd(`tournament:${tournamentId}:matches`, matchId);

            // 7. Add to group's match list if group specified
            if (data.groupId) {
                await redis.sadd(`group:${data.groupId}:matches`, matchId);
            }

            // 8. Queue immediate database sync
            await QueueService.syncImmediately('MATCH', matchId, match, userId);

            this.logger.info(`Match ${matchId} created for tournament ${tournamentId}${data.groupId ? ` in group ${data.groupId}` : ''}`);
            return match;

        } catch (error) {
            this.handleError(error, 'Create match');
            return null;
        }
    }

    // Get tournament matches with Redis-first approach
    async getTournamentMatches(tournamentId: string, userId: string) {
        try {
            // 1. Verify tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Check cache first
            const cacheKey = `tournament:${tournamentId}:matches:list`;
            const cachedMatches = await redis.getObject<MatchCache[]>(cacheKey);

            if (cachedMatches) {
                this.logger.info(`Cache hit for tournament ${tournamentId} matches`);
                return cachedMatches;
            }

            // 3. Get match IDs from set
            const matchIds = await redis.smembers(`tournament:${tournamentId}:matches`);

            if (matchIds.length === 0) {
                // 4. Fallback to database
                const dbMatches = await this.db.match.findMany({
                    where: { tournamentId },
                    include: {
                        _count: {
                            select: { screenshots: true }
                        }
                    },
                    orderBy: { matchNumber: 'asc' }
                });

                // 5. Populate cache from database
                if (dbMatches.length > 0) {
                    await this.populateMatchCache(tournamentId, dbMatches);
                }

                return dbMatches;
            }

            // 6. Get match details from Redis
            const matches = await Promise.all(
                matchIds.map(async (id) => {
                    const match = await redis.hgetObject<MatchCache>(`match:${id}`);
                    return match;
                })
            );

            // 7. Filter and cache
            const validMatches = matches.filter(m => m !== null);
            await redis.setObject(cacheKey, validMatches, this.CACHE_TTL);

            return validMatches;

        } catch (error) {
            this.handleError(error, 'Get tournament matches');
            return null;
        }
    }

    // Get match by ID with caching
    async getMatchById(matchId: string, userId: string) {
        try {
            // 1. Get match from cache
            const match = await redis.hgetObject<MatchCache>(`match:${matchId}`);

            if (match) {
                // 2. Verify tournament ownership
                const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
                if (!tournament || tournament.userId !== userId) {
                    throw new Error('Match not found or access denied');
                }

                return match;
            }

            // 3. Fallback to database
            const dbMatch = await this.db.match.findFirst({
                where: {
                    id: matchId,
                    tournament: { userId }
                },
                include: {
                    screenshots: {
                        orderBy: { uploadedAt: 'desc' }
                    },
                    tournament: {
                        select: { id: true, name: true, userId: true }
                    }
                }
            });

            if (!dbMatch) {
                throw new Error('Match not found or access denied');
            }

            // 4. Cache the result
            await redis.hsetObject(`match:${matchId}`, {
                ...dbMatch,
                matchDate: dbMatch.matchDate.toISOString(),
                createdAt: dbMatch.createdAt.toISOString(),
                updatedAt: dbMatch.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            });

            return dbMatch;

        } catch (error) {
            this.handleError(error, 'Get match by ID');
            return null;
        }
    }

    // Update match with hybrid sync
    async updateMatch(matchId: string, userId: string, updateData: UpdateMatchData) {
        try {
            // 1. Get current match and verify ownership
            const currentMatch = await this.getMatchById(matchId, userId);
            if (!currentMatch) {
                throw new Error('Match not found or access denied');
            }

            // 2. Create updated match object
            const updatedMatch = {
                ...currentMatch,
                ...updateData,
                matchDate: updateData.matchDate ? updateData.matchDate.toISOString() : currentMatch.matchDate,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis immediately
            await redis.hsetObject(`match:${matchId}`, updatedMatch);

            // 4. Queue database sync
            await QueueService.queueDatabaseSync({
                type: 'MATCH_UPDATE',
                entityId: matchId,
                data: updateData,
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // 5. Invalidate related caches
            await redis.delete(`tournament:${currentMatch.tournamentId}:matches:list`);

            this.logger.info(`Match ${matchId} updated`);
            return updatedMatch;

        } catch (error) {
            this.handleError(error, 'Update match');
            return null;
        }
    }

    // Delete match with hybrid sync
    async deleteMatch(matchId: string, userId: string) {
        try {
            // 1. Get match and verify ownership
            const match = await this.getMatchById(matchId, userId);
            if (!match) {
                throw new Error('Match not found or access denied');
            }

            // 2. Remove from Redis
            await redis.delete(`match:${matchId}`);
            await redis.srem(`tournament:${match.tournamentId}:matches`, matchId);

            // 3. Queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'MATCH_DELETE',
                entityId: matchId,
                data: { id: matchId },
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // 4. Invalidate caches
            await redis.delete(`tournament:${match.tournamentId}:matches:list`);

            this.logger.info(`Match ${matchId} deleted`);
            return { success: true, message: 'Match deleted successfully' };

        } catch (error) {
            this.handleError(error, 'Delete match');
            return null;
        }
    }

    // Helper method to populate cache
    private async populateMatchCache(tournamentId: string, matches: any[]) {
        try {
            const promises = matches.map(async (match) => {
                const cacheMatch: MatchCache = {
                    ...match,
                    matchDate: match.matchDate.toISOString(),
                    createdAt: match.createdAt.toISOString(),
                    updatedAt: match.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`match:${match.id}`, cacheMatch);
                await redis.sadd(`tournament:${tournamentId}:matches`, match.id);
            });

            await Promise.all(promises);
            await redis.setObject(`tournament:${tournamentId}:matches:list`, matches, this.CACHE_TTL);

            this.logger.info(`Populated match cache for tournament ${tournamentId}`);

        } catch (error) {
            this.logger.error('Failed to populate match cache:', error);
        }
    }
}

export const matchService = new MatchService();