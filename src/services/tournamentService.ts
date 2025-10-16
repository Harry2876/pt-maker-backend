import { BaseService } from "./baseService";
import { TournamentStatus } from "@prisma/client";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";

interface TournamentCache {
    id: string;
    name: string;
    game: string;
    status: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: string;
}




export class TournamentService extends BaseService {
    private CACHE_TTL = 300; // 5 mins

    //create tournament with hybrid sync
    async createTournament(userId: string, data: {
        name: string,
        game: string,
        tournamentType?: 'TOURNAMENT',
        maxTeams?: number,
        entryFee?: number,
        prizePool?: number,
        status?: TournamentStatus;
    }) {
        try {
            //generate tournament id
            const tournamentId = randomUUID();

            //create the tournament object
            const tournament = {
                id: tournamentId,
                name: data.name,
                game: data.game,
                tournamentType: data.tournamentType || 'TOURNAMENT',
                maxTeams: data.maxTeams,
                entryFee: data.entryFee,
                prizePool: data.prizePool,
                status: data.status || 'UPCOMING',
                userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            //store in redis immediately
            await redis.hsetObject(`tournament:${tournamentId}`, tournament);

            //add to user tournament list
            await redis.sadd(`user:${userId}:tournaments`, tournamentId);

            //update cached tournament list intelligently
            await this.updateTournamentListCache(userId, tournament, 'ADD');

            //add to queue for db sync
            await QueueService.syncImmediately('TOURNAMENT', tournamentId, tournament, userId);

            this.logger.info(`Tournament ${tournamentId} created and queued for sync successfully`);

            return tournament;
        } catch (error) {
            this.handleError(error, 'Create tournament');
            return null;
        }
    }

    //get user tournaments
    async getUserTournaments(userId: string) {
        try {
            //check data in redis cahce first
            const cacheKey = `user:${userId}:tournaments:list`;
            const cachedTournaments = await redis.getObject<any[]>(cacheKey);

            if (cachedTournaments) {
                this.logger.info(`Fetched ${cachedTournaments.length} tournaments from cache for user ${userId}`);
                return cachedTournaments;
            }

            //get tournament IDs from set
            const tournamentIDs = await redis.smembers(`user:${userId}:tournaments`);

            if (tournamentIDs.length === 0) {
                //fallback to database if the redis is empty
                const dbTournaments = await this.db.tournament.findMany({
                    where: { userId },
                    include: {
                        _count: {
                            select: {
                                matches: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                //populate redis cache from database
                if (dbTournaments.length > 0) {
                    await this.populateCache(userId, dbTournaments);
                }

                return dbTournaments;
            }

            //get tournament details from redis
            const tournaments = await Promise.all(
                tournamentIDs.map(async (id) => {
                    const tournament = await redis.hgetObject(`tournament:${id}`);
                    return tournament;
                }));

            //Filter out null results and cache the list
            const validTournaments = tournaments.filter(t => t !== null);
            await redis.setObject(cacheKey, validTournaments, this.CACHE_TTL);

            return validTournaments;
        } catch (error) {
            this.handleError(error, 'Get user tournaments');
            return null;
        }
    }

    //get a tournament by id with caching
    async getTournamentById(tournamentId: string, userId: string) {
        try {
            //check redis cache first
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (tournament) {
                //verify the user ownership
                if (tournament.userId !== userId) {
                    this.logger.warn(`User ${userId} attempted to access tournament ${tournamentId} without permission`);
                    throw new Error(`Unauthorized access to tournament ${tournamentId}`);
                }
                this.logger.info(`Fetched tournament ${tournamentId} from cache`);
                return tournament;
            }

            //fallback to db if tournament not found
            const dbTournament = await this.db.tournament.findFirst({
                where: {
                    id: tournamentId,
                    userId
                },
                include: {
                    matches: {
                        select: {
                            id: true,
                            matchNumber: true,
                            status: true,
                            createdAt: true
                        },
                        orderBy: {
                            matchNumber: 'asc'
                        },
                    },
                    _count: {
                        select: {
                            matches: true
                        }
                    }
                }
            });

            if (!dbTournament) {
                this.logger.warn(`Tournament ${tournamentId} not found for user ${userId}`);
                throw new Error(`Tournament ${tournamentId} not found`);
            }

            //cache the result
            await redis.hsetObject(`tournament:${tournamentId}`, {
                ...dbTournament,
                dbStatus: 'SYNCED'
            });

            return dbTournament;
        } catch (error) {
            this.handleError(error, 'Get tournament by ID');
            return null;
        }
    }


    // Update tournament with hybrid sync
    async updateTournament(tournamentId: string, userId: string, updateData: {
        name?: string;
        game?: string;
        status?: TournamentStatus;
    }) {
        try {
            // 1. Get current tournament
            const currentTournament = await this.getTournamentById(tournamentId, userId);
            if (!currentTournament) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Create updated tournament object
            const updatedTournament = {
                ...currentTournament,
                ...updateData,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis immediately
            await redis.hsetObject(`tournament:${tournamentId}`, updatedTournament);

            // 4. Queue immediate database sync
            await QueueService.queueDatabaseSync({
                type: 'TOURNAMENT_UPDATE',
                entityId: tournamentId,
                data: updateData,
                userId,
                priority: 'HIGH', // Updates are higher priority
                timestamp: new Date().toISOString()
            });

            //update related caches
            const cacheCompatibleTournament: TournamentCache = {
                ...updatedTournament,
                createdAt: typeof updatedTournament.createdAt === 'string'
                    ? updatedTournament.createdAt
                    : updatedTournament.createdAt.toISOString(),
                updatedAt: updatedTournament.updatedAt
            };
            await this.updateTournamentListCache(userId, cacheCompatibleTournament, 'UPDATE');

            this.logger.info(`Tournament ${tournamentId} updated and queued for sync`);
            return updatedTournament;

        } catch (error) {
            this.handleError(error, 'Update tournament');
            return null;
        }
    }

    // Delete tournament with hybrid sync
    async deleteTournament(tournamentId: string, userId: string) {
        try {
            // 1. Verify ownership
            const tournament = await this.getTournamentById(tournamentId, userId);
            if (!tournament) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Remove from Redis immediately
            await redis.delete(`tournament:${tournamentId}`);
            await redis.srem(`user:${userId}:tournaments`, tournamentId);

            // 3. Queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'TOURNAMENT_DELETE',
                entityId: tournamentId,
                data: { id: tournamentId },
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

                       // 4. Update caches
            const cacheCompatibleTournament: TournamentCache = {
                id: tournament.id,
                name: tournament.name,
                game: tournament.game,
                status: tournament.status,
                userId: tournament.userId,
                createdAt: typeof tournament.createdAt === 'string' 
                    ? tournament.createdAt 
                    : tournament.createdAt.toISOString(),
                updatedAt: typeof tournament.updatedAt === 'string'
                    ? tournament.updatedAt
                    : tournament.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };
            await this.updateTournamentListCache(userId, cacheCompatibleTournament, 'DELETE');

            this.logger.info(`Tournament ${tournamentId} deleted and queued for database cleanup`);
            return { success: true, message: 'Tournament deleted successfully' };

        } catch (error) {
            this.handleError(error, 'Delete tournament');
            return null;
        }
    }

    private async updateTournamentListCache(userId: string, tournament: TournamentCache, operation: 'ADD' | 'UPDATE' | 'DELETE'): Promise<void> {
        try {
            const cacheKey = `user:${userId}:tournaments:list`;
            const cachedList = await redis.getObject<TournamentCache[]>(cacheKey);

            if (cachedList) {
                let updatedList = [...cachedList];

                switch (operation) {
                    case 'ADD':
                        updatedList.push(tournament);
                        break;
                    case 'UPDATE':
                        const updateIndex = updatedList.findIndex(t => t.id === tournament.id);
                        if (updateIndex !== -1) {
                            updatedList[updateIndex] = tournament;
                        }
                        break;
                    case 'DELETE':
                        updatedList = updatedList.filter(t => t.id !== tournament.id);
                        break;
                }

                //update cache with new list
                await redis.setObject(cacheKey, updatedList, this.CACHE_TTL);
                this.logger.info(`✅ Cache updated for user ${userId}, operation: ${operation}, tournament: ${tournament.id}`);
            } else {
                this.logger.debug(`No cached list found for user ${userId}, will be populated on next GET request`);
            }
        } catch (error) {
            this.logger.warn(`Failed to update tournament list cache for the user ${userId}`, error);
        }
    }

    // Helper method to populate cache from database
    private async populateCache(userId: string, tournaments: any[]) {
        try {
            // Store individual tournaments
            const promises = tournaments.map(async (tournament) => {
                await redis.hsetObject(`tournament:${tournament.id}`, {
                    ...tournament,
                    dbStatus: 'SYNCED'
                });
                await redis.sadd(`user:${userId}:tournaments`, tournament.id);
            });

            await Promise.all(promises);

            // Cache the list
            await redis.setObject(`user:${userId}:tournaments:list`, tournaments, this.CACHE_TTL);

            this.logger.info(`Populated cache for user ${userId} with ${tournaments.length} tournaments`);

        } catch (error) {
            this.logger.error('Failed to populate tournament cache:', error);
        }
    }
}

export const tournamentService = new TournamentService();

