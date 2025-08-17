import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { GroupCache, CreateGroupData, UpdateGroupData } from '../types/group';
import { TournamentCache } from '../types/tournament';

export class GroupService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create group with hybrid sync
    async createGroup(tournamentId: string, userId: string, data: CreateGroupData) {
        try {
            // 1. Verify tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Generate group ID
            const groupId = randomUUID();

            // 3. Create group object
            const group: GroupCache = {
                id: groupId,
                name: data.name,
                maxTeams: data.maxTeams || 24,
                qualificationSpots: data.qualificationSpots || 8,
                tournamentId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis immediately
            await redis.hsetObject(`group:${groupId}`, group);
            await redis.sadd(`tournament:${tournamentId}:groups`, groupId);

            // 5. Queue database sync
            await QueueService.syncImmediately('GROUP', groupId, group, userId);

            this.logger.info(`Group ${groupId} created for tournament ${tournamentId}`);
            return group;

        } catch (error) {
            this.handleError(error, 'Create group');
            return null;
        }
    }

    // Get tournament groups
    async getTournamentGroups(tournamentId: string, userId: string) {
        try {
            // 1. Verify tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Check cache first
            const cacheKey = `tournament:${tournamentId}:groups:list`;
            const cachedGroups = await redis.getObject<GroupCache[]>(cacheKey);

            if (cachedGroups) {
                this.logger.info(`Cache hit for tournament ${tournamentId} groups`);
                return cachedGroups;
            }

            // 3. Get group IDs from set
            const groupIds = await redis.smembers(`tournament:${tournamentId}:groups`);

            if (groupIds.length === 0) {
                // 4. Fallback to database
                const dbGroups = await this.db.group.findMany({
                    where: { tournamentId },
                    include: {
                        _count: {
                            select: { teamRegistrations: true, matches: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });

                if (dbGroups.length > 0) {
                    await this.populateGroupCache(tournamentId, dbGroups);
                }

                return dbGroups;
            }

            // 5. Get group details from Redis
            const groups = await Promise.all(
                groupIds.map(async (id) => {
                    const group = await redis.hgetObject<GroupCache>(`group:${id}`);
                    return group;
                })
            );

            const validGroups = groups.filter(g => g !== null);
            await redis.setObject(cacheKey, validGroups, this.CACHE_TTL);

            return validGroups;

        } catch (error) {
            this.handleError(error, 'Get tournament groups');
            return null;
        }
    }

    // Get group by ID
    async getGroupById(groupId: string, userId: string) {
        try {
            // 1. Get group from cache
            const group = await redis.hgetObject<GroupCache>(`group:${groupId}`);
            
            if (group) {
                // 2. Verify tournament ownership
                const tournament = await redis.hgetObject<TournamentCache>(`tournament:${group.tournamentId}`);
                if (!tournament || tournament.userId !== userId) {
                    throw new Error('Group not found or access denied');
                }
                
                return group;
            }

            // 3. Fallback to database
            const dbGroup = await this.db.group.findFirst({
                where: { 
                    id: groupId,
                    tournament: { userId }
                },
                include: {
                    teamRegistrations: {
                        orderBy: { totalPoints: 'desc' }
                    },
                    matches: {
                        orderBy: { matchNumber: 'asc' }
                    },
                    tournament: {
                        select: { id: true, name: true, userId: true }
                    }
                }
            });

            if (!dbGroup) {
                throw new Error('Group not found or access denied');
            }

            // 4. Cache the result
            await redis.hsetObject(`group:${groupId}`, {
                ...dbGroup,
                createdAt: dbGroup.createdAt.toISOString(),
                updatedAt: dbGroup.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            });

            return dbGroup;

        } catch (error) {
            this.handleError(error, 'Get group by ID');
            return null;
        }
    }

    // Update group with hybrid sync
    async updateGroup(groupId: string, userId: string, updateData: UpdateGroupData) {
        try {
            // 1. Get current group and verify ownership
            const currentGroup = await this.getGroupById(groupId, userId);
            if (!currentGroup) {
                throw new Error('Group not found or access denied');
            }

            // 2. Create updated group object
            const updatedGroup = {
                ...currentGroup,
                ...updateData,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis immediately
            await redis.hsetObject(`group:${groupId}`, updatedGroup);

            // 4. Queue database sync
            await QueueService.queueDatabaseSync({
                type: 'GROUP_UPDATE',
                entityId: groupId,
                data: updateData,
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // 5. Invalidate related caches
            await redis.delete(`tournament:${currentGroup.tournamentId}:groups:list`);

            this.logger.info(`Group ${groupId} updated`);
            return updatedGroup;

        } catch (error) {
            this.handleError(error, 'Update group');
            return null;
        }
    }

    // Delete group with hybrid sync
    async deleteGroup(groupId: string, userId: string) {
        try {
            // 1. Get group and verify ownership
            const group = await this.getGroupById(groupId, userId);
            if (!group) {
                throw new Error('Group not found or access denied');
            }

            // 2. Remove from Redis
            await redis.delete(`group:${groupId}`);
            await redis.srem(`tournament:${group.tournamentId}:groups`, groupId);

            // 3. Queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'GROUP_DELETE',
                entityId: groupId,
                data: { id: groupId },
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // 4. Invalidate caches
            await redis.delete(`tournament:${group.tournamentId}:groups:list`);

            this.logger.info(`Group ${groupId} deleted`);
            return { success: true, message: 'Group deleted successfully' };

        } catch (error) {
            this.handleError(error, 'Delete group');
            return null;
        }
    }

    // Helper method to populate cache
    private async populateGroupCache(tournamentId: string, groups: any[]) {
        try {
            const promises = groups.map(async (group) => {
                const cacheGroup: GroupCache = {
                    ...group,
                    createdAt: group.createdAt.toISOString(),
                    updatedAt: group.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`group:${group.id}`, cacheGroup);
                await redis.sadd(`tournament:${tournamentId}:groups`, group.id);
            });

            await Promise.all(promises);
            await redis.setObject(`tournament:${tournamentId}:groups:list`, groups, this.CACHE_TTL);

            this.logger.info(`Populated group cache for tournament ${tournamentId}`);

        } catch (error) {
            this.logger.error('Failed to populate group cache:', error);
        }
    }
}

export const groupService = new GroupService();