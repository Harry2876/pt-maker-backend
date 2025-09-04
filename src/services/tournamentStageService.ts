import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    TournamentStageCache,
    CreateStageData,
    UpdateStageData,
    TournamentCache
} from '../types/tournament';

export class TournamentStageService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create tournament stage with hybrid sync
    async createStage(data: CreateStageData & { tournamentId: string }, createdBy: string) {
        try {
            // 1. Validate tournament exists (following your pattern)
            const tournament = await redis.hgetObject(`tournament:${data.tournamentId}`);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            // 2. Generate stage ID
            const stageId = randomUUID();

            // 3. Create stage object (following your tournament cache pattern)
            const stage: TournamentStageCache = {
                id: stageId,
                name: data.name,
                stageNumber: data.stageNumber,
                totalGroups: data.totalGroups || 1,
                qualificationSpots: data.qualificationSpots || 1,
                stageFormat: data.stageFormat || 'ELIMINATION',
                isActive: true,
                isCompleted: false,
                tournamentId: data.tournamentId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis immediately (following your pattern)
            await redis.hsetObject(`stage:${stageId}`, stage);

            // 5. Add to tournament stages list
            await redis.sadd(`tournament:${data.tournamentId}:stages`, stageId);

            // 6. Queue database sync (following your pattern)
            await QueueService.syncImmediately('TOURNAMENT_STAGE', stageId, stage, createdBy);

            this.logger.info(`Tournament stage ${stageId} created for tournament ${data.tournamentId}`);
            return stage;

        } catch (error) {
            this.handleError(error, 'Create tournament stage');
            return null;
        }
    }

    // Get tournament stages
    async getTournamentStages(tournamentId: string, userId: string): Promise<TournamentStageCache[]> {
        try {
            // 1. Verify user has access to tournament
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Tournament not found or access denied');
            }

            // 2. Get stage IDs from Redis
            const stageIds = await redis.smembers(`tournament:${tournamentId}:stages`);
            
            if (stageIds.length === 0) {
                return [];
            }

            // 3. Get stage details
            const stages: TournamentStageCache[] = [];
            for (const stageId of stageIds) {
                const stage = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
                if (stage) {
                    stages.push(stage);
                }
            }

            // 4. Sort by stage number
            stages.sort((a, b) => a.stageNumber - b.stageNumber);

            return stages;

        } catch (error) {
            this.handleError(error, 'Get tournament stages');
            return [];
        }
    }

    // Get stage by ID
    async getStageById(stageId: string, userId: string): Promise<TournamentStageCache | null> {
        try {
            // 1. Get stage from Redis
            const stage = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
            if (!stage) {
                return null;
            }

            // 2. Verify user has access to tournament
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${stage.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Access denied');
            }

            return stage;

        } catch (error) {
            this.handleError(error, 'Get stage by ID');
            return null;
        }
    }

    // Update stage
    async updateStage(stageId: string, updateData: UpdateStageData, updatedBy: string) {
        try {
            // 1. Get existing stage
            const existing = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
            if (!existing) {
                throw new Error('Stage not found');
            }

            // 2. Verify user has access
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${existing.tournamentId}`);
            if (!tournament || tournament.userId !== updatedBy) {
                throw new Error('Access denied');
            }

            // 3. Update stage object
            const updated: TournamentStageCache = {
                ...existing,
                name: updateData.name || existing.name,
                totalGroups: updateData.totalGroups !== undefined ? updateData.totalGroups : existing.totalGroups,
                qualificationSpots: updateData.qualificationSpots !== undefined ? updateData.qualificationSpots : existing.qualificationSpots,
                stageFormat: updateData.stageFormat || existing.stageFormat,
                isActive: updateData.isActive !== undefined ? updateData.isActive : existing.isActive,
                isCompleted: updateData.isCompleted !== undefined ? updateData.isCompleted : existing.isCompleted,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis
            await redis.hsetObject(`stage:${stageId}`, updated);

            // 5. Queue database sync
            await QueueService.syncImmediately('TOURNAMENT_STAGE', stageId, updated, updatedBy);

            this.logger.info(`Tournament stage ${stageId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update tournament stage');
            return null;
        }
    }

    // Delete stage
    async deleteStage(stageId: string, deletedBy: string): Promise<boolean> {
        try {
            // 1. Get existing stage
            const existing = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
            if (!existing) {
                return false;
            }

            // 2. Verify user has access
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${existing.tournamentId}`);
            if (!tournament || tournament.userId !== deletedBy) {
                throw new Error('Access denied');
            }

            // 3. Remove from Redis
            await redis.delete(`stage:${stageId}`);
            await redis.srem(`tournament:${existing.tournamentId}:stages`, stageId);

            // 4. Queue database deletion
            await QueueService.syncImmediately('DELETE_TOURNAMENT_STAGE', stageId, { id: stageId }, deletedBy);

            this.logger.info(`Tournament stage ${stageId} deleted`);
            return true;

        } catch (error) {
            this.handleError(error, 'Delete tournament stage');
            return false;
        }
    }

    // Advance to next stage
    async advanceStage(stageId: string, advancedBy: string) {
        try {
            // 1. Get current stage
            const currentStage = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
            if (!currentStage) {
                throw new Error('Stage not found');
            }

            // 2. Verify user has access
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${currentStage.tournamentId}`);
            if (!tournament || tournament.userId !== advancedBy) {
                throw new Error('Access denied');
            }

            // 3. Mark current stage as completed
            const completedStage = {
                ...currentStage,
                isActive: false,
                isCompleted: true,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            await redis.hsetObject(`stage:${stageId}`, completedStage);

            // 4. Find and activate next stage
            const allStages = await this.getTournamentStages(currentStage.tournamentId, advancedBy);
            const nextStage = allStages.find(stage => 
                stage.stageNumber === currentStage.stageNumber + 1
            );

            if (nextStage) {
                const activatedNextStage = {
                    ...nextStage,
                    isActive: true,
                    updatedAt: new Date().toISOString(),
                    dbStatus: 'PENDING_SYNC'
                };

                await redis.hsetObject(`stage:${nextStage.id}`, activatedNextStage);
                await QueueService.syncImmediately('TOURNAMENT_STAGE', nextStage.id, activatedNextStage, advancedBy);
            }

            // 5. Queue current stage sync
            await QueueService.syncImmediately('TOURNAMENT_STAGE', stageId, completedStage, advancedBy);

            this.logger.info(`Stage ${stageId} advanced. Next stage: ${nextStage?.id || 'none'}`);
            
            return {
                completedStage,
                nextStage: nextStage || null,
                tournamentCompleted: !nextStage
            };

        } catch (error) {
            this.handleError(error, 'Advance tournament stage');
            return null;
        }
    }
}

export const tournamentStageService = new TournamentStageService();