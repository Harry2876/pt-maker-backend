import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { ScalableQueues } from "../config/scalableQueues";
import { AdvancedEngineScalableJob, TournamentScaleDetector } from "../types/scalableQueue";
import { advancedEngineService } from "../services/advancedEngineService";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class ScalableAdvancedEngineWorker extends BaseWorker<AdvancedEngineScalableJob> {

    private db = db;
    constructor() {
        // Dynamic concurrency based on system load
        super(ScalableQueues.ADVANCED_ENGINE_SCALABLE, { 
            concurrency: 8 // Will be adjusted based on concurrent tournaments
        });
    }

    protected async processJob(job: Job<AdvancedEngineScalableJob>): Promise<any> {
        const { 
            tournamentId, 
            tournamentScale, 
            teamCount, // Total teams in tournament
            screenshotData, 
            matchId,
            stageId,
            groupId,
            processingStrategy 
        } = job.data;

        const startTime = Date.now();
        
        logger.info(`🔥 Processing screenshot for tournament ${tournamentId}`, {
            scale: tournamentScale,
            totalTournamentTeams: teamCount,
            matchId,
            groupId,
            strategy: processingStrategy,
            jobId: job.id,
            screenshotType: screenshotData.type
        });

        try {
            // Check concurrent tournament load
            const concurrentLoad = await this.checkConcurrentTournamentLoad();
            await this.adjustWorkerForLoad(concurrentLoad);

            // Process single screenshot (max 25 teams per screenshot)
            const result = await this.processSingleScreenshot(job.data);

            // If this completes a group/stage, trigger aggregation
            await this.checkAndTriggerAggregation(job.data, result);

            const processingTime = Date.now() - startTime;
            
            logger.info(`✅ Screenshot processed successfully`, {
                tournamentId,
                matchId,
                groupId,
                processingTime: `${processingTime}ms`,
                teamsInScreenshot: result.teamsProcessed || 25,
                totalTournamentTeams: teamCount
            });

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error(`❌ Screenshot processing failed`, {
                tournamentId,
                matchId,
                groupId,
                                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime}ms`
            });

            throw error;
        }
    }

    /**
     * Process a single screenshot (max 25 teams)
     */
    private async processSingleScreenshot(jobData: AdvancedEngineScalableJob): Promise<any> {
        logger.info(`🔄 Processing single screenshot for group ${jobData.groupId}`);
        
        // Use existing advanced engine service for single screenshot
        const result = await advancedEngineService.processScreenshots(
            {
                matchId: jobData.matchId,
                screenshots: jobData.screenshotData.screenshots,
                processingType: jobData.screenshotData.processingType,
                manualSlots: jobData.screenshotData.manualSlots
            },
            jobData.screenshotData.userId
        );

        // Store result in cache for aggregation
        await this.cacheGroupResult(jobData.tournamentId, jobData.groupId, result);

        return result;
    }

    /**
     * Check if group/stage is complete and trigger leaderboard aggregation
     */
    private async checkAndTriggerAggregation(
        jobData: AdvancedEngineScalableJob, 
        result: any
    ): Promise<void> {
        const { tournamentId, stageId, groupId } = jobData;

        // Check if all groups in stage are complete
        if (stageId) {
            const stageComplete = await this.checkStageCompletion(tournamentId, stageId);
            if (stageComplete) {
                logger.info(`🎯 Stage ${stageId} complete, triggering aggregation`);
                await this.triggerStageAggregation(tournamentId, stageId);
            }
        }

        // Check if tournament is complete
        const tournamentComplete = await this.checkTournamentCompletion(tournamentId);
        if (tournamentComplete) {
            logger.info(`🏆 Tournament ${tournamentId} complete, triggering final aggregation`);
            await this.triggerTournamentAggregation(tournamentId);
        }
    }

    /**
     * Check concurrent tournament processing load
     */
    private async checkConcurrentTournamentLoad(): Promise<number> {
        const activeTournaments = await redis.keys('processing:tournament:*');
        const concurrentLoad = activeTournaments.length;
        
        logger.info(`📊 Current concurrent tournament load: ${concurrentLoad}`);
        return concurrentLoad;
    }

    /**
     * Adjust worker concurrency based on system load
     */
    private async adjustWorkerForLoad(concurrentLoad: number): Promise<void> {
        let targetConcurrency = 8; // Default

        if (concurrentLoad > 20) {
            targetConcurrency = 20; // High load - more workers
        } else if (concurrentLoad > 10) {
            targetConcurrency = 15; // Medium load
        } else if (concurrentLoad > 5) {
            targetConcurrency = 10; // Light load
        }

        // Log adjustment (actual concurrency change would require worker restart)
        if (this.worker.opts.concurrency !== targetConcurrency) {
            logger.info(`🔧 Optimal concurrency for current load: ${targetConcurrency} (current: ${this.worker.opts.concurrency})`);
        }
    }

    /**
     * Cache group result for later aggregation
     */
    private async cacheGroupResult(
        tournamentId: string, 
        groupId: string | undefined, 
        result: any
    ): Promise<void> {
        if (!groupId) return;

        const cacheKey = `group:result:${tournamentId}:${groupId}`;
        await redis.setObject(cacheKey, {
            ...result,
            processedAt: new Date().toISOString(),
            groupId
        }, 3600); // 1 hour TTL

        logger.info(`💾 Cached group result: ${cacheKey}`);
    }

    /**
     * Check if all groups in a stage are complete
     */
    private async checkStageCompletion(
        tournamentId: string, 
        stageId: string
    ): Promise<boolean> {
        // Get all groups in stage
        const stageGroups = await this.db.group.findMany({
            where: { 
                tournamentId,
                stageId 
            },
            select: { id: true }
        });

        // Check if all groups have cached results
        const completedGroups = await Promise.all(
            stageGroups.map(async (group) => {
                const result = await redis.getObject(`group:result:${tournamentId}:${group.id}`);
                return result !== null;
            })
        );

        const isComplete = completedGroups.every(completed => completed);
        logger.info(`🔍 Stage ${stageId} completion check: ${completedGroups.filter(c => c).length}/${stageGroups.length} groups complete`);

        return isComplete;
    }

    /**
     * Check if entire tournament is complete
     */
    private async checkTournamentCompletion(tournamentId: string): Promise<boolean> {
        // Get all matches in tournament
        const totalMatches = await this.db.match.count({
            where: { tournamentId }
        });

        const processedMatches = await this.db.match.count({
            where: { 
                tournamentId,
                status: 'PROCESSED'
            }
        });

        const isComplete = totalMatches === processedMatches;
        logger.info(`🔍 Tournament ${tournamentId} completion: ${processedMatches}/${totalMatches} matches processed`);

        return isComplete;
    }

    /**
     * Trigger stage-level aggregation
     */
    private async triggerStageAggregation(
        tournamentId: string, 
        stageId: string
    ): Promise<void> {
        // Queue leaderboard calculation for stage
        const { ScalableQueueService } = await import('../services/scalableQueueService');
        
        await ScalableQueueService.queueLeaderboardBatchProcessing({
            tournamentId,
            teamCount: 0, // Will be calculated during processing
            forceRefresh: true,
            stageId: stageId
        });

        logger.info(`🚀 Queued stage aggregation for stage ${stageId}`);
    }

    /**
     * Trigger tournament-level aggregation
     */
    private async triggerTournamentAggregation(tournamentId: string): Promise<void> {
        const { ScalableQueueService } = await import('../services/scalableQueueService');
        
        await ScalableQueueService.queueLeaderboardBatchProcessing({
            tournamentId,
            teamCount: 0, // Will be calculated during processing
            calculateGlobal: true,
            forceRefresh: true
        });

        // Mark tournament processing as complete
        await redis.delete(`processing:tournament:${tournamentId}`);
        
        logger.info(`🏆 Queued final tournament aggregation for ${tournamentId}`);
    }
}