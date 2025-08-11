import { Worker,Job, WorkerOptions, Queue } from "bullmq";
import {redis} from '../config/redis';
import logger from "@/utils/logger";

export abstract class BaseWorker<T = any> {
    protected worker:Worker;
        private workerName: string;
    private jobsProcessed = 0;

    constructor (
        queueName: string,
        options: Partial<WorkerOptions> = {}
    ) {

        this.workerName = `${queueName}-Worker`;
        
        const workerOptions: WorkerOptions = {
            connection: redis.getQueueConnection(),
            concurrency:3,
            ...options,
        };

         logger.info(`🔧 Initializing ${this.workerName} with concurrency: ${workerOptions.concurrency}`);


        this.worker = new Worker(queueName, this.processJob.bind(this),workerOptions);
        this.setupEventHandlers();

         logger.info(`✅ ${this.workerName} initialized and ready to process jobs`);
    }

    //abstract method - each worker must implement this
    protected abstract processJob(job: Job<T>): Promise<any>;

    private setupEventHandlers(): void {
        this.worker.on('completed',(job)=>{
            if(job){
              logger.info(`🟢 ${this.workerName} is ready and waiting for jobs`);
        }
    });

        this.worker.on('failed', (job, error) => {
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
        });

        this.worker.on('error', (error) => {
            logger.error(`💥 ${this.workerName} encountered a critical error:`, {
                error: error.message,
                stack: error.stack
            });
        });

        this.worker.on('stalled', (jobId) => {
            logger.warn(`⚠️ ${this.workerName} job ${jobId} has stalled`);
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