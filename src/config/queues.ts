import { Queue, Worker, QueueOptions, WorkerOptions } from "bullmq";
import { redis } from './redis';
import logger from '../utils/logger';

//Queue connection config
const queueConnection = redis.getQueueConnection();


//queue options
const defaultQueueOptions: QueueOptions = {
    connection: queueConnection,
    defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3, // Retry failed jobs up to 3 times
        backoff: {
            type: 'exponential',
            delay: 1000, // Initial delay of 1 second
        },
    },
}

//worker options
const defaultWorkerOptions: WorkerOptions = {
    connection: queueConnection,
    concurrency: 5, //process 5 jobs currently
}

//define all queues for the application
export const Queues = {
    SCREENSHOT_PROCESSING: 'screenshot-processing',
    OTP_SENDING: 'otp-sending',
    EMAIL_NOTIFICATIONS: 'email-notifications',
    IMAGE_PROCESSING: 'image-processing',
    REPORT_GENERATION: 'report-generation',
    CLEANUP_TASKS: 'cleanup-tasks',
    PAYMENT_PROCESSING: 'payment-processing',
    USER_SYNC: 'user-sync',
    DATABASE_SYNC: 'database-sync',
    BATCH_SYNC: 'batch-sync',
    CACHE_CLEANUP: 'cache-cleanup',
    ADVANCED_ENGINE: 'advanced-engine',
    QUICK_PT_SYNC: 'quick-pt-sync',
} as const;

export const screenshotQueue = new Queue(Queues.SCREENSHOT_PROCESSING, defaultQueueOptions);
export const otpQueue = new Queue(Queues.OTP_SENDING, defaultQueueOptions);
export const emailQueue = new Queue(Queues.EMAIL_NOTIFICATIONS, defaultQueueOptions);
export const imageQueue = new Queue(Queues.IMAGE_PROCESSING, defaultQueueOptions);
export const reportQueue = new Queue(Queues.REPORT_GENERATION , defaultQueueOptions);
export const cleanupQueue = new Queue(Queues.CLEANUP_TASKS, defaultQueueOptions);
export const paymentQueue = new Queue(Queues.PAYMENT_PROCESSING, defaultQueueOptions);
export const userSyncQueue = new Queue(Queues.USER_SYNC, defaultQueueOptions);
export const cacheCleanupQueue = new Queue(Queues.CACHE_CLEANUP, defaultQueueOptions);
export const databaseSyncQueue = new Queue(Queues.DATABASE_SYNC, {
    ...defaultQueueOptions,
    defaultJobOptions: {
        ...defaultQueueOptions.defaultJobOptions,
        priority: 5,
        delay: 5000,
        removeOnComplete: 100,
        removeOnFail: 20,
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000,
        }
    }
});

export const batchSyncQueue = new Queue(Queues.BATCH_SYNC, {
    ...defaultQueueOptions,
    defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        }
    }
});

export const advancedEngineQueue = new Queue(Queues.ADVANCED_ENGINE, {
    ...defaultQueueOptions,
    defaultJobOptions: {
        ...defaultQueueOptions.defaultJobOptions,
        priority:2, //high priority for AI Proceessing
        removeOnComplete: 50,
        removeOnFail:20,
        attempts:3,
        backoff: {
            type:'exponential',
            delay:5000, //5 seconds initial delay
        }
    }
});

export const quickPtSyncQueue = new Queue(Queues.QUICK_PT_SYNC, {
    ...defaultQueueOptions,
    defaultJobOptions: {
        priority: 3,  // Medium-high priority (same as database sync)
        delay: 2000,   // 2 second delay for batching
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            count: 100,  // Keep last 100 completed jobs
        },
        removeOnFail: {
            count: 50,   // Keep last 50 failed jobs
        }
    }
});
