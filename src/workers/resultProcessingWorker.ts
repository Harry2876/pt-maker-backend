import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { Queues } from "../config/queues";
import { AdvancedEngineJob } from "../types/queue";
import { advancedEngineService } from "../services/advancedEngineService";
import { MatchCache, Screenshot } from "../types/match";
import { TournamentCache } from "../types/tournament";
import logger from "../utils/logger";
import { redis } from "../config/redis";
import { QueueService } from "../services/queueService";

export class ResultProcessingWorker extends BaseWorker<AdvancedEngineJob> {
    constructor() {
        super(Queues.ADVANCED_ENGINE, {
            concurrency: 2, // Limit AI processing concurrency
            stalledInterval: 60000, // 1 minute for AI processing
            maxStalledCount: 2
        });
    }

    protected async processJob(job: Job<AdvancedEngineJob>): Promise<any> {
        const { type, matchId, userId, request, priority } = job.data;

        logger.info(`Processing advanced engine job: ${type} for match ${matchId}`, {
            jobId: job.id,
            userId,
            priority,
            processingType: request.processingType
        });

        try {
            switch (type) {
                case 'PROCESS_SCREENSHOTS':
                    return await this.processScreenshots(matchId, userId, request, job.id!);
                default:
                    throw new Error(`Unknown advanced engine job type: ${type}`);
            }
        } catch (error) {
            logger.error(`Error processing advanced engine job: ${type}:`, {
                error: (error as any).message,
                matchId,
                userId,
                jobId: job.id,
                stack: (error as any).stack
            });

            // Update job status in Redis for tracking
            await this.updateJobStatus(job.id!, matchId, 'FAILED', (error as any).message);
            throw error;
        }
    }

    private async processScreenshots(
        matchId: string,
        userId: string,
        request: any,
        jobId: string
    ): Promise<any> {
        try {
            // Update job status to processing
            await this.updateJobStatus(jobId, matchId, 'PROCESSING');

            logger.info(`Starting screenshot processing for match ${matchId}`, {
                jobId,
                userId,
                screenshotCount: request.screenshots.slotScreenshots.length + request.screenshots.resultScreenshots.length
            });

            // Validate match ownership
            if (!await this.validateMatchOwnership(matchId, userId)) {
                throw new Error('User does not own this match');
            }

            // Process screenshots with Advanced Engine
            const result = await advancedEngineService.processScreenshots(request, 'system');

            if (!result.success) {
                throw new Error(`Screenshot processing failed: ${result.errors?.join(', ')}`);
            }

            // Update match with processed results
            await this.updateMatchWithResults(matchId, result, jobId);

            // Update screenshots as processed
            await this.markScreenshotsAsProcessed(matchId, result.processingId);

            // Update job status to completed
            await this.updateJobStatus(jobId, matchId, 'COMPLETED', undefined, {
                processingId: result.processingId,
                confidence: result.confidence.overall,
                teamMappings: result.extractedData.teamMappings.length,
                processingTime: result.processingTime
            });

            logger.info(`Screenshot processing completed successfully for match ${matchId}`, {
                jobId,
                processingId: result.processingId,
                confidence: result.confidence.overall,
                teamMappings: result.extractedData.teamMappings.length,
                processingTime: result.processingTime
            });

            return {
                success: true,
                processingId: result.processingId,
                confidence: result.confidence.overall,
                teamMappingsCount: result.extractedData.teamMappings.length,
                processingTime: result.processingTime
            };

        } catch (error) {
            logger.error(`Failed to process screenshots for match ${matchId}:`, {
                error: (error as any).message,
                jobId,
                userId
            });

            // Update job status to failed
            await this.updateJobStatus(jobId, matchId, 'FAILED', (error as any).message);
            throw error;
        }
    }

    private async validateMatchOwnership(matchId: string, userId: string): Promise<boolean> {
        try {
            // Check if match exists and user owns it
            const match = await redis.hgetObject<MatchCache>(`match:${matchId}`);
            if (!match) {
                logger.warn(`Match ${matchId} not found in cache`);
                return false;
            }

            // Get tournament to verify ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                logger.warn(`User ${userId} does not own match ${matchId}`);
                return false;
            }

            return true;
        } catch (error) {
            logger.error(`Error validating match ownership:`, error);
            return false;
        }
    }

    private async updateMatchWithResults(matchId: string, result: any, jobId: string): Promise<void> {
        try {
            // Update match cache with processed data
            const matchCacheKey = `match:${matchId}`;
            const match = await redis.hgetObject<MatchCache>(matchCacheKey);

            if (match) {
                match.status = 'PROCESSED';
                match.processedData = {
                    processingId: result.processingId,
                    teamMappings: result.extractedData.teamMappings,
                    confidence: result.confidence.overall,
                    processedAt: new Date().toISOString(),
                    jobId
                };
                match.updatedAt = new Date().toISOString();

                await redis.hsetObject(matchCacheKey, match);

                await QueueService.syncImmediately('MATCH', matchId, {
                    processedData: match.processedData,
                    status: 'PROCESSED'
                }, 'system');

                logger.info(`Updated match ${matchId} with processed results`, {
                    processingId: result.processingId,
                    teamMappings: result.extractedData.teamMappings.length
                });
            }
        } catch (error) {
            logger.error(`Failed to update match ${matchId} with results:`, error);
            // Don't throw - this is not critical for the job to succeed
        }
    }

    private async markScreenshotsAsProcessed(matchId: string, processingId: string): Promise<void> {
        try {
            // Get all screenshots for the match
            const screenshotIds = await redis.smembers(`match:${matchId}:screenshots`);

            for (const screenshotId of screenshotIds) {
                const screenshot = await redis.hgetObject<Screenshot>(`screenshot:${screenshotId}`);
                if (screenshot) {
                    screenshot.isProcessed = true;
                    screenshot.processingId = processingId;
                    screenshot.processedAt = new Date().toISOString();

                    await redis.hsetObject(`screenshot:${screenshotId}`, screenshot);
                    await QueueService.syncImmediately('SCREENSHOT', screenshotId, screenshot, 'system');
                }
            }

            logger.info(`Marked ${screenshotIds.length} screenshots as processed for match ${matchId}`);
        } catch (error) {
            logger.error(`Failed to mark screenshots as processed for match ${matchId}:`, error);
            // Don't throw - this is not critical
        }
    }

    private async updateJobStatus(
        jobId: string,
        matchId: string,
        status: 'PROCESSING' | 'COMPLETED' | 'FAILED',
        error?: string,
        result?: any
    ): Promise<void> {
        try {
            const jobStatusKey = `advanced_engine:job:${jobId}`;
            const jobStatus = {
                jobId,
                matchId,
                status,
                updatedAt: new Date().toISOString(),
                ...(error && { error }),
                ...(result && { result })
            };

            await redis.setObject(jobStatusKey, jobStatus, 3600); // 1 hour TTL

            // Also update match-specific job tracking
            const matchJobKey = `advanced_engine:match:${matchId}:job`;
            await redis.setObject(matchJobKey, jobStatus, 3600);

        } catch (error) {
            logger.error(`Failed to update job status:`, error);
            // Don't throw - this is logging/tracking only
        }
    }

    // Public method to get job status
    async getJobStatus(jobId: string): Promise<any> {
        try {
            const jobStatusKey = `advanced_engine:job:${jobId}`;
            return await redis.getObject(jobStatusKey);
        } catch (error) {
            logger.error(`Failed to get job status for ${jobId}:`, error);
            return null;
        }
    }

    // Public method to get match processing status
    async getMatchProcessingStatus(matchId: string): Promise<any> {
        try {
            const matchJobKey = `advanced_engine:match:${matchId}:job`;
            return await redis.getObject(matchJobKey);
        } catch (error) {
            logger.error(`Failed to get match processing status for ${matchId}:`, error);
            return null;
        }
    }
}