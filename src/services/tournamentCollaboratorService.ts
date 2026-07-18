import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    TournamentCollaboratorCache,
    CreateCollaboratorData,
    UpdateCollaboratorData,
    getUserPermissions
} from '../types/collaboration';
import { TournamentPermissions } from '../types/tournament';

export class TournamentCollaboratorService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create collaborator with hybrid sync
    async createCollaborator(data: CreateCollaboratorData) {
        try {
            // 1. Generate collaborator ID
            const collaboratorId = randomUUID();

            // 2. Create collaborator object (matching actual schema)
            const collaborator: TournamentCollaboratorCache = {
                id: collaboratorId,
                tournamentId: data.tournamentId,
                userId: data.userId,
                role: data.role,
                status: 'PENDING',
                invitedBy: data.invitedBy,
                invitedAt: new Date().toISOString(),
                acceptedAt: undefined, // Use acceptedAt not joinedAt
                user: {
                    id: data.userId,
                    username: '', // Will be populated from DB sync
                    phoneNumber: '' // Will be populated from DB sync
                },
                tournament: {
                    id: data.tournamentId,
                    name: '', // Will be populated from DB sync
                    ownerId: data.invitedBy
                },
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Store in Redis immediately
            await redis.hsetObject(`collaborator:${collaboratorId}`, collaborator);
            await redis.sadd(`tournament:${data.tournamentId}:collaborators`, collaboratorId);
            await redis.sadd(`user:${data.userId}:collaborations`, collaboratorId);

            // 4. Queue database sync
            await QueueService.syncImmediately('COLLABORATOR', collaboratorId, collaborator, data.invitedBy);

            this.logger.info(`Collaborator ${collaboratorId} created for tournament ${data.tournamentId}`);
            return collaborator;

        } catch (error) {
            this.handleError(error, 'Create collaborator');
            return null;
        }
    }

    // Get tournament collaborators
    async getTournamentCollaborators(tournamentId: string) {
        try {
            // Get collaborator IDs from Redis set
            const collaboratorIds = await redis.smembers(`tournament:${tournamentId}:collaborators`);

            if (collaboratorIds.length === 0) {
                // Fallback to database if Redis is empty
                const dbCollaborators = await this.db.tournamentCollaborator.findMany({
                    where: { tournamentId },
                    include: {
                        user: { select: { id: true, username: true, phoneNumber: true } }, // Use phoneNumber not email
                        tournament: { select: { id: true, name: true, userId: true } } // userId is the owner
                    }
                });

                // Convert to cache format and store in Redis
                const collaborators = dbCollaborators.map(collab => ({
                    id: collab.id,
                    tournamentId: collab.tournamentId,
                    userId: collab.userId,
                    role: collab.role,
                    status: collab.status,
                    invitedBy: collab.invitedBy,
                    invitedAt: collab.invitedAt.toISOString(),
                    acceptedAt: collab.acceptedAt?.toISOString(), // Use acceptedAt
                    user: {
                        id: collab.user.id,
                        username: collab.user.username,
                        phoneNumber: collab.user.phoneNumber
                    },
                    tournament: {
                        id: collab.tournament.id,
                        name: collab.tournament.name,
                        ownerId: collab.tournament.userId // Tournament owner is userId
                    },
                    dbStatus: 'SYNCED' as const
                }));

                // Store in Redis for future requests
                for (const collaborator of collaborators) {
                    await redis.hsetObject(`collaborator:${collaborator.id}`, collaborator);
                    await redis.sadd(`tournament:${tournamentId}:collaborators`, collaborator.id);
                }

                return collaborators;
            }

            // Get collaborators from Redis
            const collaborators = [];
            for (const id of collaboratorIds) {
                const collaborator = await redis.hgetObject<TournamentCollaboratorCache>(`collaborator:${id}`);
                if (collaborator) {
                    collaborators.push(collaborator);
                }
            }

            return collaborators;

        } catch (error) {
            this.handleError(error, 'Get tournament collaborators');
            return [];
        }
    }

    // Get collaborator by ID
    async getCollaboratorById(collaboratorId: string) {
        try {
            const collaborator = await redis.hgetObject<TournamentCollaboratorCache>(`collaborator:${collaboratorId}`);
            if (collaborator) {
                return collaborator;
            }

            const dbCollaborator = await this.db.tournamentCollaborator.findUnique({
                where: { id: collaboratorId },
                include: {
                    user: { select: { id: true, username: true, phoneNumber: true } },
                    tournament: { select: { id: true, name: true, userId: true } }
                }
            });

            if (!dbCollaborator) {
                return null;
            }

            const cached: TournamentCollaboratorCache = {
                id: dbCollaborator.id,
                tournamentId: dbCollaborator.tournamentId,
                userId: dbCollaborator.userId,
                role: dbCollaborator.role,
                status: dbCollaborator.status,
                invitedBy: dbCollaborator.invitedBy,
                invitedAt: dbCollaborator.invitedAt.toISOString(),
                acceptedAt: dbCollaborator.acceptedAt?.toISOString(),
                user: {
                    id: dbCollaborator.user.id,
                    username: dbCollaborator.user.username,
                    phoneNumber: dbCollaborator.user.phoneNumber
                },
                tournament: {
                    id: dbCollaborator.tournament.id,
                    name: dbCollaborator.tournament.name,
                    ownerId: dbCollaborator.tournament.userId
                },
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`collaborator:${collaboratorId}`, cached);
            return cached;
        } catch (error) {
            this.handleError(error, 'Get collaborator by ID');
            return null;
        }
    }

    // Update collaborator
    async updateCollaborator(collaboratorId: string, data: UpdateCollaboratorData, updatedBy: string) {
        try {
            // Get existing collaborator
            const existing = await redis.hgetObject<TournamentCollaboratorCache>(`collaborator:${collaboratorId}`);
            if (!existing) {
                throw new Error('Collaborator not found');
            }

            // Update the collaborator object
            const updated: TournamentCollaboratorCache = {
                ...existing,
                role: data.role || existing.role,
                status: data.status || existing.status,
                acceptedAt: data.status === 'ACTIVE' && !existing.acceptedAt ? new Date().toISOString() : existing.acceptedAt,
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`collaborator:${collaboratorId}`, updated);

            // Queue database sync
            await QueueService.queueDatabaseSync({
                type: 'COLLABORATOR_UPDATE',
                entityId: collaboratorId,
                data: {
                    role: updated.role,
                    status: updated.status,
                    acceptedAt: updated.acceptedAt
                },
                userId: updatedBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Collaborator ${collaboratorId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update collaborator');
            return null;
        }
    }

    // Delete collaborator
    async deleteCollaborator(collaboratorId: string, deletedBy: string) {
        try {
            // Get collaborator to get tournament ID
            const collaborator = await redis.hgetObject<TournamentCollaboratorCache>(`collaborator:${collaboratorId}`);
            if (!collaborator) {
                throw new Error('Collaborator not found');
            }

            // Remove from Redis
            await redis.delete(`collaborator:${collaboratorId}`);
            await redis.srem(`tournament:${collaborator.tournamentId}:collaborators`, collaboratorId);
            await redis.srem(`user:${collaborator.userId}:collaborations`, collaboratorId);

            // Queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'DELETE_COLLABORATOR',
                entityId: collaboratorId,
                data: { id: collaboratorId },
                userId: deletedBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Collaborator ${collaboratorId} deleted`);
            return true;

        } catch (error) {
            this.handleError(error, 'Delete collaborator');
            return false;
        }
    }

    // Get user permissions for tournament
    async getUserPermissions(tournamentId: string, userId: string): Promise<TournamentPermissions> {
        try {
            // Check if user is tournament owner
            const tournament = await redis.hgetObject<any>(`tournament:${tournamentId}`);
            if (tournament && tournament.userId === userId) {
                // Return full owner permissions using the helper function
                const ownerPermissions = getUserPermissions('OWNER');
                return {
                    canViewTournament: true,
                    canEditTournament: ownerPermissions.canEditTournament,
                    canDeleteTournament: ownerPermissions.canDeleteTournament,
                    canManageStages: ownerPermissions.canManageStages,        // ← ADD THIS LINE
                    canManageSlots: ownerPermissions.canManageSlots,          // ← ADD THIS LINE
                    canProcessResults: ownerPermissions.canProcessResults,    // ← ADD THIS LINE
                    canVerifyResults: ownerPermissions.canVerifyResults,      // ← ADD THIS LINE
                    canManageGroups: ownerPermissions.canManageGroups,
                    canManageMatches: true,
                    canViewResults: true,
                    canEditResults: true,
                    canPublishResults: true,
                    canManageCollaborators: ownerPermissions.canManageCollaborators,
                    canInviteUsers: true,
                    canRemoveUsers: true,
                    canChangeUserRoles: true,
                    canViewAnalytics: ownerPermissions.canViewAnalytics,
                    canExportData: true,
                    canManageSettings: true
                };
            }

            // Get user's collaboration
            const collaborationIds = await redis.smembers(`user:${userId}:collaborations`);
            for (const collabId of collaborationIds) {
                const collab = await redis.hgetObject<TournamentCollaboratorCache>(`collaborator:${collabId}`);
                if (collab && collab.tournamentId === tournamentId && collab.status === 'ACTIVE') {
                    // Get permissions from role using the helper function
                    const rolePermissions = getUserPermissions(collab.role);
                    return {
                        canViewTournament: true,
                        canEditTournament: rolePermissions.canEditTournament,
                        canDeleteTournament: rolePermissions.canDeleteTournament,
                        canManageStages: rolePermissions.canManageStages,
                        canManageSlots: rolePermissions.canManageSlots,
                        canProcessResults: rolePermissions.canProcessResults,
                        canVerifyResults: rolePermissions.canVerifyResults,
                        canManageGroups: rolePermissions.canManageGroups,
                        canManageMatches: true,
                        canViewResults: true,
                        canEditResults: rolePermissions.canVerifyResults,
                        canPublishResults: rolePermissions.canVerifyResults,
                        canManageCollaborators: rolePermissions.canManageCollaborators,
                        canInviteUsers: false,
                        canRemoveUsers: false,
                        canChangeUserRoles: false,
                        canViewAnalytics: rolePermissions.canViewAnalytics,
                        canExportData: false,
                        canManageSettings: false
                    };
                }
            }

            // No permissions found - return viewer permissions
            return {
                canViewTournament: true,
                canEditTournament: false,
                canDeleteTournament: false,
                canManageStages: false,
                canManageSlots: false,
                canProcessResults: false,
                canVerifyResults: false,
                canManageGroups: false,
                canManageMatches: false,
                canViewResults: true,
                canEditResults: false,
                canPublishResults: false,
                canManageCollaborators: false,
                canInviteUsers: false,
                canRemoveUsers: false,
                canChangeUserRoles: false,
                canViewAnalytics: false,
                canExportData: false,
                canManageSettings: false
            };

        } catch (error) {
            this.handleError(error, 'Get user permissions');
            return {} as TournamentPermissions;
        }
    }
}

export const tournamentCollaboratorService = new TournamentCollaboratorService();