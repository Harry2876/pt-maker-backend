import { Queue, Worker, QueueOptions, WorkerOptions } from "bullmq";
import { redis } from './redis';
import logger from '../utils/logger';
import { TournamentScaleDetector, TournamentScale } from '../types/scalableQueue';

// Base connection
const queueConnection = redis.getQueueConnection();

// Scalable Queue Names
export const ScalableQueues = {
    BATCH_PROCESSING: 'batch-processing',
    LEADERBOARD_BATCH: 'leaderboard-batch',
    TEAM_PROCESSING_SMALL: 'team-processing-small',
    TEAM_PROCESSING_MEDIUM: 'team-processing-medium', 
    TEAM_PROCESSING_LARGE: 'team-processing-large',
    TEAM_PROCESSING_MASSIVE: 'team-processing-massive',
    PRIORITY_PROCESSING: 'priority-processing',
} as const;

// Dynamic Queue Options Generator
export class ScalableQueueConfig {
    
    static createQueueOptions(scale: TournamentScale): QueueOptions {
        const config = TournamentScaleDetector.getConfig(scale);
        
        return {
            connection: queueConnection,
            defaultJobOptions: {
                removeOnComplete: scale === 'massive' ? 20 : 10,
                removeOnFail: scale === 'massive' ? 10 : 5,
                attempts: scale === 'massive' ? 5 : 3,
                priority: config.priority,
                backoff: {
                    type: 'exponential',
                    delay: scale === 'massive' ? 2000 : 1000,
                },
            },
        };
    }

    static createWorkerOptions(scale: TournamentScale): WorkerOptions {
        const config = TournamentScaleDetector.getConfig(scale);
        
        return {
            connection: queueConnection,
            concurrency: config.concurrency,
            autorun: true,
            drainDelay: 5,
            stalledInterval: scale === 'massive' ? 60000 : 30000, // 1 min vs 30 sec
            maxStalledCount: 2,
        };
    }

    static createBatchWorkerOptions(teamCount: number): WorkerOptions {
        const { scale, config } = TournamentScaleDetector.getConfigForTeamCount(teamCount);
        
        return {
            connection: queueConnection,
            concurrency: Math.min(config.concurrency * 2, 100), // Double concurrency for batch processing
            autorun: true,
            drainDelay: 1, // Faster drain for batch processing
            stalledInterval: 45000,
            maxStalledCount: 1, // Less tolerance for stalls in batch processing
        };
    }
}

// Create scalable queues
export const batchProcessingQueue = new Queue(
    ScalableQueues.BATCH_PROCESSING,
    {
        connection: queueConnection,
        defaultJobOptions: {
            removeOnComplete: 50,
            removeOnFail: 25,
            attempts: 3,
            priority: 8, // High priority for batch operations
            backoff: {
                type: 'exponential',
                delay: 1500,
            },
        },
    }
);

export const leaderboardBatchQueue = new Queue(
    ScalableQueues.LEADERBOARD_BATCH,
    {
        connection: queueConnection,
        defaultJobOptions: {
            removeOnComplete: 30,
            removeOnFail: 15,
            attempts: 2,
            priority: 6,
            backoff: {
                type: 'exponential',
                delay: 3000,
            },
        },
    }
);

// Scale-specific team processing queues
export const teamProcessingSmallQueue = new Queue(
    ScalableQueues.TEAM_PROCESSING_SMALL,
    ScalableQueueConfig.createQueueOptions('small')
);

export const teamProcessingMediumQueue = new Queue(
    ScalableQueues.TEAM_PROCESSING_MEDIUM,
    ScalableQueueConfig.createQueueOptions('medium')
);

export const teamProcessingLargeQueue = new Queue(
    ScalableQueues.TEAM_PROCESSING_LARGE,
    ScalableQueueConfig.createQueueOptions('large')
);

export const teamProcessingMassiveQueue = new Queue(
    ScalableQueues.TEAM_PROCESSING_MASSIVE,
    ScalableQueueConfig.createQueueOptions('massive')
);

// Priority queue for urgent operations
export const priorityProcessingQueue = new Queue(
    ScalableQueues.PRIORITY_PROCESSING,
    {
        connection: queueConnection,
        defaultJobOptions: {
            removeOnComplete: 20,
            removeOnFail: 10,
            attempts: 5,
            priority: 10, // Highest priority
            backoff: {
                type: 'exponential',
                delay: 500,
            },
        },
    }
);

// Queue Router - Automatically selects appropriate queue based on tournament scale
export class ScalableQueueRouter {
    
    static getTeamProcessingQueue(teamCount: number): Queue {
        const scale = TournamentScaleDetector.detectScale(teamCount);
        
        switch (scale) {
            case 'small':
                return teamProcessingSmallQueue;
            case 'medium':
                return teamProcessingMediumQueue;
            case 'large':
                return teamProcessingLargeQueue;
            case 'massive':
                return teamProcessingMassiveQueue;
            default:
                return teamProcessingMediumQueue;
        }
    }

    static getBatchQueue(teamCount: number): Queue {
        // For large tournaments, use batch processing
        if (TournamentScaleDetector.shouldUseBatchProcessing(teamCount)) {
            return batchProcessingQueue;
        }
        // For small tournaments, use regular team processing
        return this.getTeamProcessingQueue(teamCount);
    }

    static getPriorityQueue(): Queue {
        return priorityProcessingQueue;
    }

    static getLeaderboardQueue(): Queue {
        return leaderboardBatchQueue;
    }
}