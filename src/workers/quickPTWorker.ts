import { BaseWorker } from "./baseWorker";
import { Job } from "bullmq";
import { Queues } from "../config/queues";
import { DatabaseSyncJob } from "../types/queue";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class QuickPTWorker extends BaseWorker<DatabaseSyncJob> {
    constructor() {
        super(Queues.QUICK_PT_SYNC, { concurrency: 3 });
    }

    protected async processJob(job: Job<DatabaseSyncJob>): Promise<any> {
        const { type, entityId, data, userId } = job.data;

        logger.info(`Processing Quick-PT sync job: ${type} for entity: ${entityId}`);

        try {
            switch (type) {
                // Quick Match operations
                case 'QUICK_MATCH_CREATE':
                    return await this.syncQuickMatchCreate(data);
                case 'QUICK_MATCH_UPDATE':
                    return await this.syncQuickMatchUpdate(entityId, data);
                case 'QUICK_MATCH_DELETE':
                    return await this.syncQuickMatchDelete(entityId);

                // Quick Slot operations
                case 'QUICK_SLOT_CREATE':
                    return await this.syncQuickSlotCreate(data);
                case 'QUICK_SLOT_UPDATE':
                    return await this.syncQuickSlotUpdate(entityId, data);
                case 'QUICK_SLOT_DELETE':
                    return await this.syncQuickSlotDelete(entityId);

                // Quick Screenshot operations
                case 'QUICK_SCREENSHOT_CREATE':
                    return await this.syncQuickScreenshotCreate(data);
                case 'QUICK_SCREENSHOT_DELETE':
                    return await this.syncQuickScreenshotDelete(entityId);

                // Quick Result operations
                case 'QUICK_RESULT_CREATE':
                    return await this.syncQuickResultCreate(data);
                case 'QUICK_RESULT_UPDATE':
                    return await this.syncQuickResultUpdate(entityId, data);
                case 'QUICK_RESULT_DELETE':
                    return await this.syncQuickResultDelete(entityId);

                // Quick Points Table operations
                case 'QUICK_POINTS_TABLE_CREATE':
                    return await this.syncQuickPointsTableCreate(data);
                case 'QUICK_POINTS_TABLE_UPDATE':
                    return await this.syncQuickPointsTableUpdate(entityId, data);
                case 'QUICK_POINTS_TABLE_DELETE':
                    return await this.syncQuickPointsTableDelete(entityId);

                case 'QUICK_SERIES_CREATE':
                    return await this.syncQuickSeriesCreate(data);
                case 'QUICK_SERIES_UPDATE':
                    return await this.syncQuickSeriesUpdate(entityId, data);
                case 'QUICK_SERIES_MATCH_CREATE':
                    return await this.syncQuickSeriesMatchCreate(data);
                case 'QUICK_SERIES_LEADERBOARD_UPDATE':
                    return await this.syncQuickSeriesLeaderboardUpdate(entityId, data);

                default:
                    // Not a Quick-PT job, ignore
                    return;
            }
        } catch (error) {
            logger.error(`Error processing Quick-PT sync job: ${type}:`, error);

            // Update redis with error status
            await redis.hset(`sync:error:${entityId}`, {
                error: (error as any).message,
                timestamp: new Date().toISOString(),
                retryCount: job.attemptsMade.toString()
            });

            throw error;
        }
    }

    // ========================================
    // QUICK MATCH SYNC METHODS
    // ========================================

    private async syncQuickMatchCreate(matchData: any): Promise<void> {
        try {
            const quickMatch = await db.quickMatch.create({
                data: {
                    id: matchData.id,
                    matchName: matchData.matchName,
                    game: matchData.game || 'BGMI',
                    map: matchData.map,
                    status: matchData.status,
                    processingStep: matchData.processingStep,
                    aiProcessingId: matchData.aiProcessingId,
                    teamsDetected: matchData.teamsDetected || 0,
                    warningsCount: matchData.warningsCount || 0,
                    positionPointsConfig: matchData.positionPointsConfig || null,
                    killPointsValue: matchData.killPointsValue || 1,
                    scoringDescription: matchData.scoringDescription,
                    userId: matchData.userId,
                    createdAt: new Date(matchData.createdAt),
                    updatedAt: new Date(matchData.updatedAt || matchData.createdAt)
                }
            });

            await redis.hset(`quickMatch:${quickMatch.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`quickMatch:${quickMatch.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Quick Match ${quickMatch.id} created and synced to database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Match ${matchData.id} already exists in database`);
                await redis.hset(`quickMatch:${matchData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Match ${matchData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickMatchUpdate(matchId: string, updateData: any): Promise<void> {
        try {
            // Extract only updatable fields (exclude id, userId, createdAt, dbStatus, dbSyncedAt)
            const { id, userId, createdAt, dbStatus, dbSyncedAt, ...updatableFields } = updateData;

            await db.quickMatch.update({
                where: { id: matchId },
                data: {
                    ...updatableFields,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`quickMatch:${matchId}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Match ${matchId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Match ${matchId}:`, error);
            throw error;
        }
    }

    private async syncQuickMatchDelete(matchId: string): Promise<void> {
        try {
            // Cascade delete will handle related records (slots, screenshots, results, points tables)
            await db.quickMatch.delete({
                where: { id: matchId }
            });

            // Cleanup Redis cache
            await redis.delete(`quickMatch:${matchId}`);
            await redis.delete(`quickMatch:${matchId}:slots`);
            await redis.delete(`quickMatch:${matchId}:screenshots`);
            await redis.delete(`quickMatch:${matchId}:results`);

            logger.info(`Quick Match ${matchId} deleted from database`);
        } catch (error) {
            logger.error(`Error deleting Quick Match ${matchId}:`, error);
            throw error;
        }
    }

    // ========================================
    // QUICK SLOT SYNC METHODS
    // ========================================

    private async syncQuickSlotCreate(slotData: any): Promise<void> {
        try {
            const slot = await db.quickSlotAssignment.create({
                data: {
                    id: slotData.id,
                    quickMatchId: slotData.quickMatchId,
                    slotNumber: slotData.slotNumber,
                    teamName: slotData.teamName,
                    playerNames: slotData.playerNames || [],
                    status: slotData.status || 'PENDING',
                    detectedInAttendance: slotData.detectedInAttendance || false,
                    createdAt: new Date(slotData.createdAt),
                    updatedAt: new Date(slotData.updatedAt || slotData.createdAt)
                }
            });

            await redis.hset(`quickSlot:${slot.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Slot ${slot.id} created in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Slot ${slotData.id} already exists in database`);
                await redis.hset(`quickSlot:${slotData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Slot ${slotData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickSlotUpdate(slotId: string, updateData: any): Promise<void> {
        try {
            // Extract only updatable fields (exclude id, quickMatchId, createdAt, dbStatus, dbSyncedAt)
            const { id, quickMatchId, createdAt, dbStatus, dbSyncedAt, ...updatableFields } = updateData;

            await db.quickSlotAssignment.update({
                where: { id: slotId },
                data: {
                    ...updatableFields,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`quickSlot:${slotId}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Slot ${slotId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Slot ${slotId}:`, error);
            throw error;
        }
    }

    private async syncQuickSlotDelete(slotId: string): Promise<void> {
        try {
            await db.quickSlotAssignment.delete({
                where: { id: slotId }
            });

            await redis.delete(`quickSlot:${slotId}`);
            logger.info(`Quick Slot ${slotId} deleted from database`);
        } catch (error) {
            logger.error(`Error deleting Quick Slot ${slotId}:`, error);
            throw error;
        }
    }

    // ========================================
    // QUICK SCREENSHOT SYNC METHODS
    // ========================================

    private async syncQuickScreenshotCreate(screenshotData: any): Promise<void> {
        try {
            const screenshot = await db.quickScreenshot.create({
                data: {
                    id: screenshotData.id,
                    quickMatchId: screenshotData.quickMatchId,
                    originalName: screenshotData.originalName,
                    fileName: screenshotData.fileName,
                    storageUrl: screenshotData.storageUrl,
                    type: screenshotData.type,
                    pageNumber: screenshotData.pageNumber,
                    isProcessed: screenshotData.isProcessed || false,
                    uploadedAt: new Date(screenshotData.uploadedAt)
                }
            });

            await redis.hset(`quickScreenshot:${screenshot.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Screenshot ${screenshot.id} created in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Screenshot ${screenshotData.id} already exists in database`);
                await redis.hset(`quickScreenshot:${screenshotData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Screenshot ${screenshotData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickScreenshotDelete(screenshotId: string): Promise<void> {
        try {
            await db.quickScreenshot.delete({
                where: { id: screenshotId }
            });

            await redis.delete(`quickScreenshot:${screenshotId}`);
            logger.info(`Quick Screenshot ${screenshotId} deleted from database`);
        } catch (error) {
            logger.error(`Error deleting Quick Screenshot ${screenshotId}:`, error);
            throw error;
        }
    }

    // ========================================
    // QUICK RESULT SYNC METHODS
    // ========================================

    private async syncQuickResultCreate(resultData: any): Promise<void> {
        try {
            const result = await db.quickMatchResult.create({
                data: {
                    id: resultData.id,
                    quickMatchId: resultData.quickMatchId,
                    slotNumber: resultData.slotNumber,
                    teamName: resultData.teamName,
                    detectedTeamName: resultData.detectedTeamName,
                    position: resultData.position,
                    rank: resultData.rank || resultData.position, // Use position as rank if rank is not provided
                    totalKills: resultData.totalKills,
                    positionPoints: resultData.positionPoints,
                    killPoints: resultData.killPoints,
                    totalPoints: resultData.totalPoints,
                    playerResults: resultData.playerResults || [],
                    status: resultData.status || 'PENDING',
                    warningType: resultData.warningType,
                    needsReview: resultData.needsReview || false,
                    aiConfidence: resultData.aiConfidence,
                    createdAt: new Date(resultData.createdAt),
                    updatedAt: new Date(resultData.updatedAt || resultData.createdAt)
                }
            });

            await redis.hset(`quickResult:${result.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Result ${result.id} created in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Result ${resultData.id} already exists in database`);
                await redis.hset(`quickResult:${resultData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Result ${resultData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickResultUpdate(resultId: string, updateData: any): Promise<void> {
        try {
            // Extract only updatable fields (exclude id, quickMatchId, createdAt, dbStatus, dbSyncedAt)
            const { id, quickMatchId, createdAt, dbStatus, dbSyncedAt, ...updatableFields } = updateData;

            await db.quickMatchResult.update({
                where: { id: resultId },
                data: {
                    ...updatableFields,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`quickResult:${resultId}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Result ${resultId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Result ${resultId}:`, error);
            throw error;
        }
    }

    private async syncQuickResultDelete(resultId: string): Promise<void> {
        try {
            await db.quickMatchResult.delete({
                where: { id: resultId }
            });

            await redis.delete(`quickResult:${resultId}`);
            logger.info(`Quick Result ${resultId} deleted from database`);
        } catch (error) {
            logger.error(`Error deleting Quick Result ${resultId}:`, error);
            throw error;
        }
    }

    private async syncQuickPointsTableCreate(tableData: any): Promise<void> {
        try {
            const table = await db.quickPointsTable.create({
                data: {
                    id: tableData.id,
                    quickMatchId: tableData.quickMatchId,
                    tableImageUrl: tableData.tableImageUrl,
                    csvData: tableData.csvData,
                    pngGeneratedAt: tableData.pngGeneratedAt ? new Date(tableData.pngGeneratedAt) : null,
                    generationTimeMs: tableData.generationTimeMs,
                    template: tableData.template || 'default',
                    expiresAt: tableData.expiresAt ? new Date(tableData.expiresAt) : null,
                    createdAt: new Date(tableData.createdAt),
                    updatedAt: new Date(tableData.updatedAt || tableData.createdAt)
                }
            });

            await redis.hset(`quickPointsTable:${table.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Points Table ${table.id} created in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Points Table ${tableData.id} already exists in database`);
                await redis.hset(`quickPointsTable:${tableData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Points Table ${tableData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickPointsTableUpdate(tableId: string, updateData: any): Promise<void> {
        try {
            // Extract only updatable fields (exclude id, quickMatchId, userId, createdAt, dbStatus, dbSyncedAt)
            const { id, quickMatchId, userId, createdAt, dbStatus, dbSyncedAt, ...updatableFields } = updateData;

            await db.quickPointsTable.update({
                where: { id: tableId },
                data: {
                    ...updatableFields,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`quickPointsTable:${tableId}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Points Table ${tableId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Points Table ${tableId}:`, error);
            throw error;
        }
    }

    private async syncQuickPointsTableDelete(tableId: string): Promise<void> {
        try {
            await db.quickPointsTable.delete({
                where: { id: tableId }
            });

            await redis.delete(`quickPointsTable:${tableId}`);
            logger.info(`Quick Points Table ${tableId} deleted from database`);
        } catch (error) {
            logger.error(`Error deleting Quick Points Table ${tableId}:`, error);
            throw error;
        }
    }

    private async syncQuickSeriesCreate(seriesData: any): Promise<void> {
        try {
            const series = await db.quickTournamentSeries.create({
                data: {
                    id: seriesData.id,
                    seriesName: seriesData.seriesName,
                    game: seriesData.game || 'BGMI',
                    totalMatches: seriesData.totalMatches,
                    matchesCompleted: seriesData.matchesCompleted || 0,
                    status: seriesData.status,
                    currentMatchNumber: seriesData.currentMatchNumber || 1,
                    isFinished: seriesData.isFinished || false,
                    winnerTeamName: seriesData.winnerTeamName,
                    finalStandings: seriesData.finalStandings || null,
                    userId: seriesData.userId,
                    createdAt: new Date(seriesData.createdAt),
                    updatedAt: new Date(seriesData.updatedAt || seriesData.createdAt)
                }
            });

            await redis.hset(`quick_series:${series.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`quick_series:${series.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Quick Series ${series.id} created and synced to database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Series ${seriesData.id} already exists in database`);
                await redis.hset(`quick_series:${seriesData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Series ${seriesData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickSeriesUpdate(seriesId: string, updateData: any): Promise<void> {
        try {
            const {
                id,
                userId,
                createdAt,
                dbStatus,
                dbSyncedAt,
                positionPointsConfig: _positionPointsConfig,
                killPointsValue: _killPointsValue,
                scoringDescription: _scoringDescription,
                ...updatableFields
            } = updateData;

            await db.quickTournamentSeries.update({
                where: { id: seriesId },
                data: {
                    ...updatableFields,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`quick_series:${seriesId}`, 'dbStatus', 'SYNCED');
            logger.info(`Quick Series ${seriesId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Series ${seriesId}:`, error);
            throw error;
        }
    }

    private async syncQuickSeriesMatchCreate(matchData: any): Promise<void> {
        try {
            const seriesMatch = await db.quickSeriesMatch.create({
                data: {
                    id: matchData.id,
                    seriesId: matchData.seriesId,
                    quickMatchId: matchData.quickMatchId,
                    matchOrder: matchData.matchOrder,
                    isCompleted: matchData.isCompleted || false,
                    completedAt: matchData.completedAt ? new Date(matchData.completedAt) : null,
                    matchWeight: matchData.matchWeight || 1.0,
                    bonusPoints: matchData.bonusPoints || 0,
                    createdAt: new Date(matchData.createdAt),
                    updatedAt: new Date(matchData.updatedAt || matchData.createdAt)
                }
            });

            await redis.hset(`quick_series_match:${seriesMatch.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`quick_series_match:${seriesMatch.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Quick Series Match ${seriesMatch.id} created and synced to database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Quick Series Match ${matchData.id} already exists in database`);
                await redis.hset(`quick_series_match:${matchData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating Quick Series Match ${matchData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncQuickSeriesLeaderboardUpdate(seriesId: string, leaderboardData: any): Promise<void> {
        try {
            const leaderboard = await db.quickSeriesLeaderboard.upsert({
                where: { seriesId: seriesId },
                update: {
                    leaderboardData: leaderboardData.leaderboardData,
                    lastUpdatedMatch: leaderboardData.lastUpdatedMatch,
                    generatedAt: new Date(leaderboardData.generatedAt),
                    updatedAt: new Date()
                },
                create: {
                    id: leaderboardData.id,
                    seriesId: seriesId,
                    leaderboardData: leaderboardData.leaderboardData,
                    lastUpdatedMatch: leaderboardData.lastUpdatedMatch,
                    generatedAt: new Date(leaderboardData.generatedAt),
                    updatedAt: new Date(leaderboardData.updatedAt || leaderboardData.generatedAt)
                }
            });

            await redis.hset(`quick_series_leaderboard:${seriesId}`, 'dbStatus', 'SYNCED');
            await redis.hset(`quick_series_leaderboard:${seriesId}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Quick Series Leaderboard for series ${seriesId} updated in database`);
        } catch (error) {
            logger.error(`Error updating Quick Series Leaderboard for series ${seriesId}:`, error);
            throw error;
        }
    }
}