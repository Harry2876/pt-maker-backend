import { Worker, Job, WorkerOptions, Queue } from "bullmq";
import { redis } from '../config/redis';
import logger from "../utils/logger";

export abstract class BaseWorker<T = any> {
    protected worker: Worker;
    private workerName: string;
    private jobsProcessed = 0;
    private lastErrorTime = 0;
    private lastErrorMessage = '';
    private errorCount = 0;
    private readonly ERROR_THROTTLE_MS = 30000; // Log same error max once per 30 seconds

    constructor(
        queueName: string,
        options: Partial<WorkerOptions> = {}
    ) {

        this.workerName = `${queueName}-Worker`;

        const workerOptions: WorkerOptions = {
            connection: redis.getQueueConnection(),
            concurrency: 3,
            autorun: true,
            ...options,
        };

        logger.info(`🔧 Initializing ${this.workerName} with concurrency: ${workerOptions.concurrency}`);


        try {
    this.worker = new Worker(queueName, this.processJob.bind(this), workerOptions);
    this.setupEventHandlers();
    this.setupConnectionRetry();
    logger.info(`✅ ${this.workerName} initialized and ready to process jobs`);
} catch (error) {
    logger.error(`❌ ${this.workerName} failed to initialize:`, error);
    throw error;
}
    }

    //abstract method - each worker must implement this
    protected abstract processJob(job: Job<T>): Promise<any>;

    // Method to throttle error logging
    private shouldLogError(errorMessage: string): boolean {
        const now = Date.now();
        const isSameError = this.lastErrorMessage === errorMessage;
        const isThrottled = now - this.lastErrorTime < this.ERROR_THROTTLE_MS;

        if (isSameError && isThrottled) {
            this.errorCount++;
            return false; // Don't log the same error again within throttle period
        }

        // Log the error and reset counters
        if (this.errorCount > 0) {
            logger.warn(`🔄 ${this.workerName} - Previous error occurred ${this.errorCount} more times (throttled)`);
        }

        this.lastErrorTime = now;
        this.lastErrorMessage = errorMessage;
        this.errorCount = 0;
        return true;
    }

// Setup connection monitoring through Redis manager
private setupConnectionRetry(): void {
    // We can monitor connection through the Redis manager
    // The Redis manager already handles connection events
    
    // Monitor worker's internal connection state through worker events
    this.worker.on('closing', () => {
        logger.info(`🔌 ${this.workerName} is closing connection`);
    });
    
    this.worker.on('closed', () => {
        logger.info(`🔌 ${this.workerName} connection closed`);
    });
    
    logger.info(`🔌 ${this.workerName} connection monitoring setup complete`);
}

    private setupEventHandlers(): void {
        this.worker.on('ready', () => {
            logger.info(`🟢 ${this.workerName} is ready and waiting for jobs`);
        });

        this.worker.on('completed', (job) => {
            try {
                if (job) {
                    this.jobsProcessed++;
                    logger.info(`✅ ${this.workerName} completed job ${job.id} in queue ${job.queueName} | Total processed: ${this.jobsProcessed}`);
                }
            } catch (error) {
                logger.error(`Error in completed handler:`, error);
            }
        });

        this.worker.on('failed', (job, error) => {
            try {
                if (job) {
                    logger.error(`❌ ${this.workerName} failed job ${job.id} in queue ${job.queueName}:`, {
                        error: error.message,
                        jobData: job.data,
                        attempts: job.attemptsMade,
                        stack: error.stack
                    });
                } else {
                    logger.error(`❌ ${this.workerName} failed with unknown job:`, error);
                }
            } catch (handlerError) {
                logger.error(`Error in failed handler:`, handlerError);
            }
        });

        this.worker.on('error', (error) => {
            try {
                const errorMessage = error.message || 'Unknown error';

                // Only log if not throttled
                if (this.shouldLogError(errorMessage)) {
                    logger.error(`💥 ${this.workerName} encountered a critical error:`, {
                        error: errorMessage,
                        stack: error.stack,
                        workerName: this.workerName,
                        timestamp: new Date().toISOString()
                    });

                    // Don't let the worker die, just log the error
                    logger.info(`🔄 ${this.workerName} continuing operation after error...`);
                }
            } catch (handlerError) {
                console.error(`Critical error in error handler:`, handlerError);
            }
        });

        this.worker.on('stalled', (jobId) => {
            try {
                logger.warn(`⚠️ ${this.workerName} job ${jobId} has stalled`);
            } catch (error) {
                logger.error(`Error in stalled handler:`, error);
            }
        });
    }
    public async close(): Promise<void> {
        logger.info(`🛑 Closing ${this.workerName}...`);
        await this.worker.close();
        logger.info(`✅ ${this.workerName} closed successfully. Total jobs processed: ${this.jobsProcessed}`);
    }

    public getStats(): object {
        return {
            workerName: this.workerName,
            jobsProcessed: this.jobsProcessed,
            isRunning: !this.worker.closing
        };
    }
}