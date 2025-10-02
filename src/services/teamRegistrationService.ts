import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { TeamRegistrationCache, CreateTeamRegistrationData, UpdateTeamRegistrationData } from '../types/teamRegistration';
import { PaginationParams, PaginatedResponse, PaginationHelper } from '../types/pagination';
import { TournamentCache } from '../types/tournament';
import { GroupCache } from '../types/group';

export class TeamRegistrationService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create team registration with hybrid sync
    async createTeamRegistration(tournamentId: string, userId: string, data: CreateTeamRegistrationData) {
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

            // 3. Generate registration ID
            const registrationId = randomUUID();

            // 4. Create registration object
            const registration: TeamRegistrationCache = {
                id: registrationId,
                teamName: data.teamName,
                contactInfo: data.contactInfo,
                registrationStatus: 'PENDING',
                totalPoints: 0,
                tournamentId,
                groupId: data.groupId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Store in Redis immediately
            await redis.hsetObject(`teamRegistration:${registrationId}`, registration);
            await redis.sadd(`tournament:${tournamentId}:teamRegistrations`, registrationId);

            if (data.groupId) {
                await redis.sadd(`group:${data.groupId}:teamRegistrations`, registrationId);
            }

            // 6. Queue database sync
            await QueueService.syncImmediately('TEAM_REGISTRATION', registrationId, registration, userId);

            this.logger.info(`Team registration ${registrationId} created for tournament ${tournamentId}`);
            return registration;

        } catch (error) {
            this.handleError(error, 'Create team registration');
            return null;
        }
    }

    // Get tournament team registrations
    async getTournamentTeamRegistrations(tournamentId: string, userId: string) {
        try {
            // 1. Verify tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Check cache first
            const cacheKey = `tournament:${tournamentId}:teamRegistrations:list`;
            const cachedRegistrations = await redis.getObject<TeamRegistrationCache[]>(cacheKey);

            if (cachedRegistrations) {
                this.logger.info(`Cache hit for tournament ${tournamentId} team registrations`);
                return cachedRegistrations;
            }

            // 3. Get registration IDs from set
            const registrationIds = await redis.smembers(`tournament:${tournamentId}:teamRegistrations`);

            if (registrationIds.length === 0) {
                // 4. Fallback to database
                const dbRegistrations = await this.db.teamRegistration.findMany({
                    where: { tournamentId },
                    include: {
                        group: {
                            select: { id: true, name: true }
                        }
                    },
                    orderBy: { totalPoints: 'desc' }
                });

                if (dbRegistrations.length > 0) {
                    await this.populateTeamRegistrationCache(tournamentId, dbRegistrations);
                }

                return dbRegistrations;
            }

            // 5. Get registration details from Redis
            const registrations = await Promise.all(
                registrationIds.map(async (id) => {
                    const registration = await redis.hgetObject<TeamRegistrationCache>(`teamRegistration:${id}`);
                    return registration;
                })
            );

            const validRegistrations = registrations.filter(r => r !== null);
            await redis.setObject(cacheKey, validRegistrations, this.CACHE_TTL);

            return validRegistrations;

        } catch (error) {
            this.handleError(error, 'Get tournament team registrations');
            return null;
        }
    }

    // Get group team registrations
    async getGroupTeamRegistrations(groupId: string, userId: string) {
        try {
            // 1. Verify group ownership
            const group = await redis.hgetObject<GroupCache>(`group:${groupId}`);
            if (!group) {
                throw new Error('Group not found');
            }

            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${group.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Group not found or access denied');
            }

            // 2. Check cache first
            const cacheKey = `group:${groupId}:teamRegistrations:list`;
            const cachedRegistrations = await redis.getObject<TeamRegistrationCache[]>(cacheKey);

            if (cachedRegistrations) {
                this.logger.info(`Cache hit for group ${groupId} team registrations`);
                return cachedRegistrations;
            }

            // 3. Get registration IDs from set
            const registrationIds = await redis.smembers(`group:${groupId}:teamRegistrations`);

            if (registrationIds.length === 0) {
                // 4. Fallback to database
                const dbRegistrations = await this.db.teamRegistration.findMany({
                    where: { groupId },
                    orderBy: { totalPoints: 'desc' }
                });

                if (dbRegistrations.length > 0) {
                    await this.populateGroupTeamRegistrationCache(groupId, dbRegistrations);
                }

                return dbRegistrations;
            }

            // 5. Get registration details from Redis
            const registrations = await Promise.all(
                registrationIds.map(async (id) => {
                    const registration = await redis.hgetObject<TeamRegistrationCache>(`teamRegistration:${id}`);
                    return registration;
                })
            );

            const validRegistrations = registrations.filter(r => r !== null);
            await redis.setObject(cacheKey, validRegistrations, this.CACHE_TTL);

            return validRegistrations;

        } catch (error) {
            this.handleError(error, 'Get group team registrations');
            return null;
        }
    }

    // Update team registration with hybrid sync
    async updateTeamRegistration(registrationId: string, userId: string, updateData: UpdateTeamRegistrationData) {
        try {
            // 1. Get current registration and verify ownership
            const currentRegistration = await this.getTeamRegistrationById(registrationId, userId);
            if (!currentRegistration) {
                throw new Error('Team registration not found or access denied');
            }

            // 2. Create updated registration object
            const updatedRegistration = {
                ...currentRegistration,
                ...updateData,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis immediately
            await redis.hsetObject(`teamRegistration:${registrationId}`, updatedRegistration);

            // 4. Queue database sync
            await QueueService.queueDatabaseSync({
                type: 'TEAM_REGISTRATION_UPDATE',
                entityId: registrationId,
                data: updateData,
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // 5. Invalidate related caches
            await redis.delete(`tournament:${currentRegistration.tournamentId}:teamRegistrations:list`);
            if (currentRegistration.groupId) {
                await redis.delete(`group:${currentRegistration.groupId}:teamRegistrations:list`);
            }

            this.logger.info(`Team registration ${registrationId} updated`);
            return updatedRegistration;

        } catch (error) {
            this.handleError(error, 'Update team registration');
            return null;
        }
    }

    // Get team registration by ID
    async getTeamRegistrationById(registrationId: string, userId: string) {
        try {
            // 1. Get registration from cache
            const registration = await redis.hgetObject<TeamRegistrationCache>(`teamRegistration:${registrationId}`);

            if (registration) {
                // 2. Verify tournament ownership
                const tournament = await redis.hgetObject<TournamentCache>(`tournament:${registration.tournamentId}`);
                if (!tournament || tournament.userId !== userId) {
                    throw new Error('Team registration not found or access denied');
                }

                return registration;
            }

            // 3. Fallback to database
            const dbRegistration = await this.db.teamRegistration.findFirst({
                where: {
                    id: registrationId,
                    tournament: { userId }
                },
                include: {
                    tournament: {
                        select: { id: true, name: true, userId: true }
                    },
                    group: {
                        select: { id: true, name: true }
                    }
                }
            });

            if (!dbRegistration) {
                throw new Error('Team registration not found or access denied');
            }

            // 4. Cache the result
            await redis.hsetObject(`teamRegistration:${registrationId}`, {
                ...dbRegistration,
                createdAt: dbRegistration.createdAt.toISOString(),
                updatedAt: dbRegistration.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            });

            return dbRegistration;

        } catch (error) {
            this.handleError(error, 'Get team registration by ID');
            return null;
        }
    }

    // Helper methods
    private async populateTeamRegistrationCache(tournamentId: string, registrations: any[]) {
        try {
            const promises = registrations.map(async (registration) => {
                const cacheRegistration: TeamRegistrationCache = {
                    ...registration,
                    createdAt: registration.createdAt.toISOString(),
                    updatedAt: registration.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`teamRegistration:${registration.id}`, cacheRegistration);
                await redis.sadd(`tournament:${tournamentId}:teamRegistrations`, registration.id);

                if (registration.groupId) {
                    await redis.sadd(`group:${registration.groupId}:teamRegistrations`, registration.id);
                }
            });

            await Promise.all(promises);
            await redis.setObject(`tournament:${tournamentId}:teamRegistrations:list`, registrations, this.CACHE_TTL);

            this.logger.info(`Populated team registration cache for tournament ${tournamentId}`);

        } catch (error) {
            this.logger.error('Failed to populate team registration cache:', error);
        }
    }

    private async populateGroupTeamRegistrationCache(groupId: string, registrations: any[]) {
        try {
            const promises = registrations.map(async (registration) => {
                const cacheRegistration: TeamRegistrationCache = {
                    ...registration,
                    createdAt: registration.createdAt.toISOString(),
                    updatedAt: registration.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`teamRegistration:${registration.id}`, cacheRegistration);
                await redis.sadd(`group:${groupId}:teamRegistrations`, registration.id);
            });

            await Promise.all(promises);
            await redis.setObject(`group:${groupId}:teamRegistrations:list`, registrations, this.CACHE_TTL);

            this.logger.info(`Populated team registration cache for group ${groupId}`);

        } catch (error) {
            this.logger.error('Failed to populate group team registration cache:', error);
        }
    }

    async getTournamentTeamRegistrationsPaginated(
        tournamentId: string,
        userId: string,
        paginationParams: PaginationParams = {}
    ): Promise<PaginatedResponse<any> | null> {
        try {
            const { page, limit, skip, sortBy, sortOrder } =
                PaginationHelper.validateParams(paginationParams);

            // Check if tournament is large (>1000 teams) to decide caching strategy
            const totalCount = await this.db.teamRegistration.count({
                where: { tournamentId }
            });

            // For large tournaments, skip cache and go directly to database with pagination
            if (totalCount > 1000) {
                const registrations = await this.db.teamRegistration.findMany({
                    where: { tournamentId },
                    include: {
                        group: {
                            select: { id: true, name: true }
                        }
                    },
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: limit
                });

                const meta = PaginationHelper.createMeta(page, limit, totalCount);

                return {
                    data: registrations,
                    meta
                };
            }

            // For smaller tournaments, use existing cache logic
            const allRegistrations = await this.getTournamentTeamRegistrations(tournamentId, userId);

            if (!allRegistrations) {
                return null;
            }

            // Apply pagination to cached data
            const startIndex = skip;
            const endIndex = skip + limit;
            const paginatedData = allRegistrations.slice(startIndex, endIndex);

            const meta = PaginationHelper.createMeta(page, limit, allRegistrations.length);

            return {
                data: paginatedData,
                meta
            };

        } catch (error) {
            this.handleError(error, 'Get tournament team registrations paginated');
            return null;
        }
    }

    /**
     * Get group team registrations with pagination
     */
    async getGroupTeamRegistrationsPaginated(
        groupId: string,
        userId,
        paginationParams: PaginationParams = {}
    ): Promise<PaginatedResponse<any> | null> {
        try {
            const { page, limit, skip, sortBy, sortOrder } =
                PaginationHelper.validateParams(paginationParams);

            const totalCount = await this.db.teamRegistration.count({
                where: { groupId }
            });

            const registrations = await this.db.teamRegistration.findMany({
                where: { groupId },
                orderBy: { [sortBy]: sortOrder },
                skip,
                take: limit
            });

            const meta = PaginationHelper.createMeta(page, limit, totalCount);

            return {
                data: registrations,
                meta
            };

        } catch (error) {
            this.handleError(error, 'Get group team registrations paginated');
            return null;
        }
    }

    /**
     * Search team registrations across tournaments with pagination
     * Purpose: Enable efficient searching across large datasets
     */
    async searchTeamRegistrations(
        searchParams: {
            tournamentId?: string;
            teamName?: string;
            status?: string;
            minPoints?: number;
            maxPoints?: number;
        },
        paginationParams: PaginationParams = {}
    ): Promise<PaginatedResponse<any> | null> {
        try {
            const { page, limit, skip, sortBy, sortOrder } =
                PaginationHelper.validateParams(paginationParams);

            // Build where clause
            const where: any = {};

            if (searchParams.tournamentId) {
                where.tournamentId = searchParams.tournamentId;
            }

            if (searchParams.teamName) {
                where.teamName = {
                    contains: searchParams.teamName,
                    mode: 'insensitive'
                };
            }

            if (searchParams.status) {
                where.registrationStatus = searchParams.status;
            }

            if (searchParams.minPoints !== undefined || searchParams.maxPoints !== undefined) {
                where.totalPoints = {};
                if (searchParams.minPoints !== undefined) {
                    where.totalPoints.gte = searchParams.minPoints;
                }
                if (searchParams.maxPoints !== undefined) {
                    where.totalPoints.lte = searchParams.maxPoints;
                }
            }

            const [registrations, totalCount] = await Promise.all([
                this.db.teamRegistration.findMany({
                    where,
                    include: {
                        group: {
                            select: { id: true, name: true }
                        },
                        tournament: {
                            select: { id: true, name: true }
                        }
                    },
                    orderBy: { [sortBy]: sortOrder },
                    skip,
                    take: limit
                }),
                this.db.teamRegistration.count({ where })
            ]);

            const meta = PaginationHelper.createMeta(page, limit, totalCount);

            return {
                data: registrations,
                meta
            };

        } catch (error) {
            this.handleError(error, 'Search team registrations');
            return null;
        }
    }
}

export const teamRegistrationService = new TeamRegistrationService();