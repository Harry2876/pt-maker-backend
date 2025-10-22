import { BaseService } from './baseService';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { 
    BotState, 
    StateChangeReason 
} from '../types/botState';

export class BotStateService extends BaseService {

    /**
     * Track when bot is installed to a guild - queues for database sync
     */
    async trackBotInstallation(guildId: string, installedBy?: string): Promise<{
        id: string;
        guildId: string;
        state: BotState;
        reason: StateChangeReason;
        changedBy: string | null;
    }> {
        try {
            const stateId = randomUUID();
            
            // Check if there's existing state
            const existingState = await this.getBotState(guildId);
            const isReinstallation = existingState && existingState.state === 'REMOVED';
            
            const botStateData = {
                id: stateId,
                guildId,
                state: isReinstallation ? 'REINSTALLED' as BotState : 'ACTIVE' as BotState,
                previousState: existingState?.state || null,
                reason: 'BOT_INVITED' as StateChangeReason,
                changedAt: new Date().toISOString(),
                changedBy: installedBy || null,
                                metadata: {
                    installationCount: isReinstallation ? (
                        existingState.metadata && 
                        typeof existingState.metadata === 'object' && 
                        existingState.metadata !== null && 
                        'installationCount' in existingState.metadata 
                            ? ((existingState.metadata as any).installationCount || 0) + 1 
                            : 1
                    ) : 1,
                    lastActiveAt: new Date().toISOString()
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Queue for immediate database sync
            await QueueService.syncImmediately('BOT_STATE', stateId, botStateData, installedBy || 'system');
            
            this.logger.info(`Bot installation tracked for guild ${guildId}`, {
                guildId,
                state: botStateData.state,
                isReinstallation,
                installedBy
            });

            return {
                id: botStateData.id,
                guildId: botStateData.guildId,
                state: botStateData.state,
                reason: botStateData.reason,
                changedBy: botStateData.changedBy
            };

        } catch (error) {
            this.handleError(error, 'Track Bot Installation');
            throw error;
        }
    }

    /**
     * Track when bot is removed/kicked from guild - queues for database sync
     */
    async trackBotRemoval(guildId: string, removedBy?: string, reason: StateChangeReason = 'BOT_KICKED'): Promise<{
        id: string;
        guildId: string;
        state: BotState;
        reason: StateChangeReason;
        changedBy: string | null;
    }> {
        try {
            const existingState = await this.getBotState(guildId);
            
            if (!existingState) {
                throw new Error(`No bot state found for guild ${guildId}`);
            }

            const updateData = {
                state: 'REMOVED' as BotState,
                previousState: existingState.state,
                reason,
                changedAt: new Date().toISOString(),
                changedBy: removedBy || null,
                                metadata: {
                    ...(existingState.metadata && typeof existingState.metadata === 'object' && existingState.metadata !== null ? existingState.metadata as any : {}),
                    lastActiveAt: (
                        existingState.metadata && 
                        typeof existingState.metadata === 'object' && 
                        existingState.metadata !== null && 
                        'lastActiveAt' in existingState.metadata 
                            ? (existingState.metadata as any).lastActiveAt 
                            : null
                    ) || new Date().toISOString(),
                    removalReason: reason
                },
                updatedAt: new Date().toISOString()
            };

            // Queue for immediate database sync
            await QueueService.syncImmediately('BOT_STATE', existingState.id, updateData, removedBy || 'system');

            this.logger.info(`Bot removal tracked for guild ${guildId}`, {
                guildId,
                previousState: existingState.state,
                reason,
                removedBy
            });

            return {
                id: existingState.id,
                guildId: existingState.guildId,
                state: updateData.state,
                reason: updateData.reason,
                changedBy: updateData.changedBy
            };

        } catch (error) {
            this.handleError(error, 'Track Bot Removal');
            throw error;
        }
    }

    /**
     * Get current bot state for a guild - direct database query
     */
    async getBotState(guildId: string) {
        try {
            const botState = await this.db.botState.findFirst({
                where: { guildId },
                orderBy: { createdAt: 'desc' }
            });

            return botState;

        } catch (error) {
            this.handleError(error, 'Get Bot State');
            throw error;
        }
    }

    /**
     * Get bot state history for a guild - direct database query
     */
    async getBotStateHistory(guildId: string, limit: number = 10) {
        try {
            const history = await this.db.botState.findMany({
                where: { guildId },
                orderBy: { createdAt: 'desc' },
                take: limit
            });

            return history;

        } catch (error) {
            this.handleError(error, 'Get Bot State History');
            throw error;
        }
    }

    /**
     * Update bot state (for manual state changes) - queues for database sync
     */
    async updateBotState(
        guildId: string, 
        newState: BotState, 
        reason: StateChangeReason,
        updatedBy: string,
        metadata?: any
    ): Promise<{
        id: string;
        guildId: string;
        state: BotState;
        reason: StateChangeReason;
        changedBy: string;
    }> {
        try {
            const existingState = await this.getBotState(guildId);
            
            if (!existingState) {
                throw new Error(`No bot state found for guild ${guildId}`);
            }

            const updateData = {
                state: newState,
                previousState: existingState.state,
                reason,
                changedAt: new Date().toISOString(),
                changedBy: updatedBy,
                                metadata: {
                    ...(existingState.metadata && typeof existingState.metadata === 'object' && existingState.metadata !== null ? existingState.metadata as any : {}),
                    ...metadata
                },
                updatedAt: new Date().toISOString()
            };

            // Queue for immediate database sync
            await QueueService.syncImmediately('BOT_STATE', existingState.id, updateData, updatedBy);

            this.logger.info(`Bot state updated for guild ${guildId}`, {
                guildId,
                fromState: existingState.state,
                toState: newState,
                reason,
                updatedBy
            });

            return {
                id: existingState.id,
                guildId: existingState.guildId,
                state: updateData.state,
                reason: updateData.reason,
                changedBy: updateData.changedBy
            };

        } catch (error) {
            this.handleError(error, 'Update Bot State');
            throw error;
        }
    }

    /**
     * Bulk create bot states (for migration/initialization) - queues all for sync
     */
    async bulkCreateBotStates(
        botStates: Array<{
            guildId: string;
            state: BotState;
            reason: StateChangeReason;
            changedBy?: string;
            metadata?: any;
        }>,
        createdBy: string
    ): Promise<typeof botStates> {
        try {
            const createdStates = [];

            for (const botStateData of botStates) {
                const stateId = randomUUID();
                
                // Add timestamps for EACH individual state
                const stateDataWithTimestamps = {
                    id: stateId,
                    guildId: botStateData.guildId,
                    state: botStateData.state,
                    previousState: null,
                    reason: botStateData.reason,
                    changedAt: new Date().toISOString(),
                    changedBy: botStateData.changedBy || createdBy,
                    metadata: botStateData.metadata || {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                // Queue each state for database sync
                await QueueService.syncImmediately('BOT_STATE', stateId, stateDataWithTimestamps, createdBy);
                createdStates.push(botStateData);
            }

            this.logger.info(`Queued ${createdStates.length} bot states for database creation`);
            return createdStates;

        } catch (error) {
            this.handleError(error, 'Bulk Create Bot States');
            throw error;
        }
    }

    /**
     * Get bot state count for analytics
     */
    async getBotStateCount(state?: BotState): Promise<number> {
        try {
            const count = await this.db.botState.count({
                where: state ? { state } : {}
            });

            return count;
        } catch (error) {
            this.handleError(error, 'Get Bot State Count');
            return 0;
        }
    }

    /**
     * Check if bot is active in guild
     */
    async isBotActiveInGuild(guildId: string): Promise<boolean> {
        try {
            const activeState = await this.db.botState.findFirst({
                where: {
                    guildId,
                    state: 'ACTIVE'
                },
                orderBy: { createdAt: 'desc' }
            });

            return !!activeState;
        } catch (error) {
            this.handleError(error, 'Check Bot Active Status');
            return false;
        }
    }

    /**
     * Get guilds by bot state
     */
    async getGuildsByBotState(state: BotState) {
        try {
            const states = await this.db.botState.findMany({
                where: { state },
                select: { 
                    guildId: true,
                    changedAt: true,
                    changedBy: true 
                },
                orderBy: { changedAt: 'desc' }
            });

            return states;
        } catch (error) {
            this.handleError(error, 'Get Guilds By Bot State');
            throw error;
        }
    }
}

// Export singleton instance (following your pattern)
export const botStateService = new BotStateService();