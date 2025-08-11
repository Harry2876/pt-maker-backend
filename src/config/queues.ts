import { Queue, Worker,QueueOptions,WorkerOptions } from "bullmq";
import {redis} from './redis';
import logger from '../utils/logger';

//Queue connection config
const queueConnection = redis.getQueueConnection();


//queue options
const defaultQueueOptions : QueueOptions = {
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
const defaultWorkerOptions : WorkerOptions = {
    connection: queueConnection,
    concurrency: 5, //process 5 jobs currently
}

//define all queues for the application
export const Queues = {
    SCREENSHOT_PROCESSING : 'screenshot-processing',
    OTP_SENDING : 'otp-sending',
    EMAIL_NOTIFICATIONS : 'email-notifications',
    IMAGE_PROCESSING : 'image-processing',
    REPORT_GENERATION : 'report-generation',
    CLEANUP_TASKS : 'cleanup-tasks',
    PAYMENT_PROCESSING : 'payment-processing',
} as const;

export const screenshotQueue = new Queue(Queues.SCREENSHOT_PROCESSING,defaultQueueOptions);
export const otpQueue = new Queue(Queues.OTP_SENDING,defaultQueueOptions);
export const emailQueue = new Queue(Queues.EMAIL_NOTIFICATIONS,defaultQueueOptions);
export const imageQueue = new Queue(Queues.IMAGE_PROCESSING,defaultQueueOptions);
export const reportQueue = new Queue(Queues.REPORT_GENERATION,defaultQueueOptions);
export const cleanupQueue = new Queue(Queues.CLEANUP_TASKS,defaultQueueOptions);
export const paymentQueue = new Queue(Queues.PAYMENT_PROCESSING,defaultQueueOptions);