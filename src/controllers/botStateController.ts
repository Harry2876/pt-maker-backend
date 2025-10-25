import { Request, Response } from "express";
import { botStateService } from "../services/botStateService";
import { guildService } from "../services/guildService";
import { asyncHandler } from "../middleware/commonMiddleware";
import { ResponseHelper } from "../utils/responseHelper";
import logger from "../utils/logger";

export class BotStateController {

    // Get current bot state for a guild
    static getBotState = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Get current bot state
            const botState = await botStateService.getBotState(guildId);

            if (!botState) {
                return res.status(404).json(ResponseHelper.notFound('No bot state found for this guild'));
            }

            return res.json(ResponseHelper.success('Bot state retrieved successfully', {
                guildId,
                botState: {
                    id: botState.id,
                    state: botState.state,
                    previousState: botState.previousState,
                    reason: botState.reason,
                    changedAt: botState.changedAt,
                    changedBy: botState.changedBy,
                    metadata: botState.metadata,
                    createdAt: botState.createdAt,
                    updatedAt: botState.updatedAt
                },
                guild: {
                    id: guild.id,
                    name: guild.name,
                    botEnabled: guild.botEnabled
                }
            }));

        } catch (error) {
            logger.error('Failed to get bot state:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve bot state'));
        }
    });

    // Get bot state history for a guild
    static getBotStateHistory = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { limit = '10' } = req.query;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Get bot state history
            const history = await botStateService.getBotStateHistory(guildId, parseInt(limit as string));

            return res.json(ResponseHelper.success('Bot state history retrieved successfully', {
                guildId,
                guild: {
                    id: guild.id,
                    name: guild.name
                },
                totalRecords: history.length,
                limit: parseInt(limit as string),
                history: history.map(state => ({
                    id: state.id,
                    state: state.state,
                    previousState: state.previousState,
                    reason: state.reason,
                    changedAt: state.changedAt,
                    changedBy: state.changedBy,
                    metadata: state.metadata,
                    createdAt: state.createdAt
                }))
            }));

        } catch (error) {
            logger.error('Failed to get bot state history:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve bot state history'));
        }
    });

    // Check if bot is active in guild (quick status check)
    static checkBotActive = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Check if bot is active
            const isActive = await botStateService.isBotActiveInGuild(guildId);

            return res.json(ResponseHelper.success('Bot active status checked successfully', {
                guildId,
                guild: {
                    id: guild.id,
                    name: guild.name,
                    botEnabled: guild.botEnabled
                },
                isActive,
                status: isActive ? 'ACTIVE' : 'INACTIVE',
                checkedAt: new Date().toISOString()
            }));

        } catch (error) {
            logger.error('Failed to check bot active status:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to check bot active status'));
        }
    });

    // Get bot state analytics
    static getBotAnalytics = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { state } = req.query;

            // Get total counts by state
            const totalCount = await botStateService.getBotStateCount();
            const activeCount = await botStateService.getBotStateCount('ACTIVE');
            const removedCount = await botStateService.getBotStateCount('REMOVED');
            const reinstalledCount = await botStateService.getBotStateCount('REINSTALLED');

            // If specific state requested, get guilds for that state
            let guildsByState = null;
            if (state) {
                guildsByState = await botStateService.getGuildsByBotState(state as any);
            }

            return res.json(ResponseHelper.success('Bot analytics retrieved successfully', {
                analytics: {
                    totalGuilds: totalCount,
                    stateDistribution: {
                        ACTIVE: activeCount,
                        REMOVED: removedCount,
                        REINSTALLED: reinstalledCount,
                        OTHER: totalCount - activeCount - removedCount - reinstalledCount
                    },
                    percentages: {
                        active: totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0,
                        removed: totalCount > 0 ? Math.round((removedCount / totalCount) * 100) : 0,
                        reinstalled: totalCount > 0 ? Math.round((reinstalledCount / totalCount) * 100) : 0
                    }
                },
                ...(guildsByState && {
                    guildsByState: {
                        state: state,
                        count: guildsByState.length,
                        guilds: guildsByState.map(item => ({
                            guildId: item.guildId,
                            changedAt: item.changedAt,
                            changedBy: item.changedBy
                        }))
                    }
                }),
                generatedAt: new Date().toISOString()
            }));

        } catch (error) {
            logger.error('Failed to get bot analytics:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve bot analytics'));
        }
    });

    // Bulk check bot states for multiple guilds
    static bulkCheckBotStates = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildIds } = req.body;

            if (!Array.isArray(guildIds) || guildIds.length === 0) {
                return res.status(400).json(ResponseHelper.validationError('Guild IDs array is required and cannot be empty'));
            }

            if (guildIds.length > 50) {
                return res.status(400).json(ResponseHelper.validationError('Maximum 50 guild IDs allowed per request'));
            }

            const results = [];

            // Process each guild ID
            for (const guildId of guildIds) {
                try {
                    // Get bot state for this guild
                    const botState = await botStateService.getBotState(guildId);
                    const isActive = await botStateService.isBotActiveInGuild(guildId);

                    results.push({
                        guildId,
                        success: true,
                        isActive,
                        currentState: botState?.state || null,
                        lastChanged: botState?.changedAt || null,
                        changedBy: botState?.changedBy || null
                    });

                } catch (error) {
                    logger.error(`Failed to check bot state for guild ${guildId}:`, error);
                    results.push({
                        guildId,
                        success: false,
                        error: 'Failed to retrieve bot state',
                        isActive: false,
                        currentState: null
                    });
                }
            }

            // Calculate summary statistics
            const summary = {
                totalChecked: results.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                active: results.filter(r => r.isActive).length,
                inactive: results.filter(r => r.success && !r.isActive).length
            };

            return res.json(ResponseHelper.success('Bulk bot state check completed', {
                summary,
                results,
                checkedAt: new Date().toISOString()
            }));

        } catch (error) {
            logger.error('Failed to perform bulk bot state check:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to perform bulk bot state check'));
        }
    });

    // Get guilds by bot state
    static getGuildsByBotState = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { state } = req.params;

            // Validate bot state
            const validStates = ['ACTIVE', 'REMOVED', 'REINSTALLED', 'PERMISSION_CHANGED', 'SUSPENDED', 'MAINTENANCE'];
            if (!validStates.includes(state.toUpperCase())) {
                return res.status(400).json(ResponseHelper.validationError(
                    `Invalid bot state. Valid states: ${validStates.join(', ')}`
                ));
            }

            // Get guilds by state
            const guilds = await botStateService.getGuildsByBotState(state.toUpperCase() as any);

            return res.json(ResponseHelper.success('Guilds by bot state retrieved successfully', {
                state: state.toUpperCase(),
                count: guilds.length,
                guilds: guilds.map(item => ({
                    guildId: item.guildId,
                    changedAt: item.changedAt,
                    changedBy: item.changedBy
                })),
                retrievedAt: new Date().toISOString()
            }));

        } catch (error) {
            logger.error('Failed to get guilds by bot state:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve guilds by bot state'));
        }
    });

    // Update bot state manually (for admin/debugging)
    static updateBotState = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { state, reason, updatedBy, metadata } = req.body;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Update bot state
            const updatedState = await botStateService.updateBotState(
                guildId,
                state,
                reason,
                updatedBy,
                metadata
            );

            return res.json(ResponseHelper.success('Bot state updated successfully', {
                guildId,
                updatedState: {
                    id: updatedState.id,
                    state: updatedState.state,
                    reason: updatedState.reason,
                    changedBy: updatedState.changedBy
                },
                updatedAt: new Date().toISOString()
            }));

        } catch (error) {
            logger.error('Failed to update bot state:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to update bot state'));
        }
    });
}