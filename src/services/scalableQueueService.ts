import { 
    ScalableQueueRouter, 
    batchProcessingQueue, 
    advancedEngineScalableQueue,
    leaderboardBatchQueue,
    priorityProcessingQueue 
} from '../config/scalableQueues';
import { 
    ScalableQueueJob, 
    BatchProcessingJob, 
    AdvancedEngineScalableJob,
    LeaderboardBatchJob,
    TournamentScaleDetector 
} from '../types/scalableQueue';
import logger from '../utils/logger';

export class ScalableQueueService {

    /**
     * Queue team processing with automatic scale detection
     */
    static async queueTeamProcessing(data: {
        tournamentId: string;
        teams: any[];
        operation: 'leaderboard' | 'advancement' | 'sync';
        priority?: number;
    }): Promise<void> {
        const teamCount = data.teams.length;
        const { scale, config } = TournamentScaleDetector.getConfigForTeamCount(teamCount);
        
        logger.info(`Queueing ${data.operation} for ${teamCount} teams (scale: ${scale})`);

        // For large tournaments, use batch processing
        if (TournamentScaleDetector.shouldUseBatchProcessing(teamCount)) {
            await this.queueBatchProcessing({
                tournamentId: data.tournamentId,
                teams: data.teams,
                operation: data.operation,
                batchSize: config.batchSize
            });
        } else {
            // For small tournaments, process individually
            const queue = ScalableQueueRouter.getTeamProcessingQueue(teamCount);
            
            const jobs = data.teams.map((team, index) => ({
                name: `${data.operation}-${data.tournamentId}-${index}`,
                data: {
                    tournamentId: data.tournamentId,
                    tournamentScale: scale,
                    teamCount,
                    team,
                    operation: data.operation,
                    processingStrategy: 'individual' as const
                } as ScalableQueueJob & { team: any; operation: string }
            }));

            await queue.addBulk(jobs);
        }
    }

    /**
     * Queue batch processing for large tournaments
     */
    static async queueBatchProcessing(data: {
        tournamentId: string;
        teams: any[];
        operation: string;
        batchSize?: number;
    }): Promise<void> {
        const teamCount = data.teams.length;
        const { scale, config } = TournamentScaleDetector.getConfigForTeamCount(teamCount);
        const batchSize = data.batchSize || config.batchSize;
        
        // Split teams into batches
        const batches: any[][] = [];
        for (let i = 0; i < data.teams.length; i += batchSize) {
            batches.push(data.teams.slice(i, i + batchSize));
        }

        logger.info(`Creating ${batches.length} batches of size ${batchSize} for ${teamCount} teams`);

        // Queue each batch
        const batchJobs = batches.map((teams, batchIndex) => ({
            name: `batch-${data.operation}-${data.tournamentId}-${batchIndex}`,
            data: {
                tournamentId: data.tournamentId,
                tournamentScale: scale,
                teamCount,
                teams,
                batchIndex,
                totalBatches: batches.length,
                operation: data.operation,
                processingStrategy: 'batch' as const
            } as BatchProcessingJob & { operation: string }
        }));

        await batchProcessingQueue.addBulk(batchJobs);
    }

    /**
     * Queue Advanced Engine processing with scale awareness
     */
    static async queueAdvancedEngineProcessing(data: {
        tournamentId: string;
        screenshotData: any;
        matchId: string;
        teamCount: number;
        stageId?: string;
        groupId?: string;
        priority?: number;
    }): Promise<void> {
        const { scale, config } = TournamentScaleDetector.getConfigForTeamCount(data.teamCount);

        const jobData: AdvancedEngineScalableJob = {
            tournamentId: data.tournamentId,
            tournamentScale: scale,
            teamCount: data.teamCount,
            screenshotData: data.screenshotData,
            matchId: data.matchId,
            stageId: data.stageId,
            groupId: data.groupId,
            processingStrategy: scale === 'massive' ? 'stream' : 'individual',
            priority: data.priority || config.priority
        };

        // Use priority queue for urgent processing
        if (data.priority && data.priority >= 9) {
            await priorityProcessingQueue.add('advanced-engine-priority', jobData, {
                priority: data.priority
            });
        } else {
            await advancedEngineScalableQueue.add('advanced-engine-scalable', jobData);
        }

        logger.info(`Queued Advanced Engine processing for tournament ${data.tournamentId} (scale: ${scale})`);
    }

    /**
     * Queue leaderboard batch processing
     */
    static async queueLeaderboardBatchProcessing(data: {
        tournamentId: string;
        teamCount: number;
        groupIds?: string[];
        calculateGlobal?: boolean;
        forceRefresh?: boolean;
        stageId?: string;
    }): Promise<void> {
        const { scale, config } = TournamentScaleDetector.getConfigForTeamCount(data.teamCount);

        const jobData: LeaderboardBatchJob = {
            tournamentId: data.tournamentId,
            tournamentScale: scale,
            teamCount: data.teamCount,
            groupIds: data.groupIds,
            calculateGlobal: data.calculateGlobal || false,
            forceRefresh: data.forceRefresh || false,
            stageId: data.stageId,
            processingStrategy: data.teamCount > 10000 ? 'batch' : 'individual'
        };

        await leaderboardBatchQueue.add('leaderboard-batch', jobData);

        logger.info(`Queued leaderboard batch processing for ${data.teamCount} teams (scale: ${scale})`);
    }

    /**
     * Get queue metrics for monitoring
     */
    static async getQueueMetrics(): Promise<any> {
        const queues = [
            { name: 'Advanced Engine Scalable', queue: advancedEngineScalableQueue },
            { name: 'Batch Processing', queue: batchProcessingQueue },
            { name: 'Leaderboard Batch', queue: leaderboardBatchQueue },
            { name: 'Priority Processing', queue: priorityProcessingQueue }
        ];

        const metrics = await Promise.all(
            queues.map(async ({ name, queue }) => {
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaiting(),
                    queue.getActive(),
                    queue.getCompleted(),
                    queue.getFailed()
                ]);

                return {
                    queueName: name,
                    activeJobs: active.length,
                    waitingJobs: waiting.length,
                    completedJobs: completed.length,
                    failedJobs: failed.length
                };
            })
        );

        return metrics;
    }

    /**
     * Emergency: Clear all queues (use with caution!)
     */
    static async clearAllQueues(): Promise<void> {
        logger.warn('🚨 Clearing all scalable queues - this should only be used in emergencies!');
        
        const queues = [
            advancedEngineScalableQueue,
            batchProcessingQueue,
            leaderboardBatchQueue,
            priorityProcessingQueue
        ];

        await Promise.all(queues.map(queue => queue.obliterate()));
        
        logger.info('✅ All scalable queues cleared');
    }
}