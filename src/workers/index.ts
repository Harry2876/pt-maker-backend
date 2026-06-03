import logger from '../utils/logger';
import { OTPWorker } from './otpWorker';
import { UserSyncWorker } from './userSyncWorker';
import { DatabaseSyncWorker } from './databaseSyncWorker';
import { ResultProcessingWorker } from './resultProcessingWorker';
import { ScalableAdvancedEngineWorker } from './scalableAdvancedEngineWorker';
import { BatchProcessingWorker } from './batchProcessingWorker';
import { LeaderboardBatchWorker } from './leaderboardBatchWorker';
import { QuickPTWorker } from './quickPTWorker';
// import { ScreenshotWorker } from './screenshotWorker'; // TODO: Create later
// import { EmailWorker } from './emailWorker'; // TODO: Create later

export class WorkersManager {
    private workers: Map<string, any> = new Map();
    private workerCount = 0;

    async startAllWorkers(): Promise<void> {
        logger.info('🚀 Starting Queue Workers Manager...');

        try {
            // Start OTP worker
            await this.startWorker('OTP', () => new OTPWorker());
            await this.startWorker('User Sync', () => new UserSyncWorker());
            await this.startWorker('Database Sync', () => new DatabaseSyncWorker());
            await this.startWorker('ResultProcessing', () => new ResultProcessingWorker());

            // Start scalable workers
            await this.startWorker('Scalable Advanced Engine', () => new ScalableAdvancedEngineWorker());
            await this.startWorker('Batch Processing', () => new BatchProcessingWorker());
            await this.startWorker('Leaderboard Batch', () => new LeaderboardBatchWorker());
            await this.startWorker('Quick-PT Sync', () => new QuickPTWorker());

            // TODO: Add other workers when ready
            // await this.startWorker('Screenshot', () => new ScreenshotWorker());
            // await this.startWorker('Email', () => new EmailWorker());

            logger.info(`✅ All queue workers started successfully! Total active workers: ${this.workerCount}`);
            this.logWorkerStatus();

        } catch (error) {
            logger.error('❌ Failed to start some workers:', error);
            throw error;
        }
    }

    private async startWorker(name: string, workerFactory: () => any): Promise<void> {
        try {
            logger.info(`🔄 Creating ${name} worker...`);

            const worker = workerFactory();
            this.workers.set(name, worker);
            this.workerCount++;

            logger.info(`✅ ${name} worker created successfully! Worker ID: ${this.workerCount}`);
            logger.info(`📊 Total active workers: ${this.workerCount}`);

        } catch (error) {
            logger.error(`❌ Failed to create ${name} worker:`, error);
            throw error;
        }
    }

    private logWorkerStatus(): void {
        const workerNames = Array.from(this.workers.keys());
        logger.info('📋 Active Workers Summary:', {
            totalWorkers: this.workerCount,
            workerTypes: workerNames,
            status: 'All workers running successfully'
        });
    }

    async stopAllWorkers(): Promise<void> {
        logger.info('🛑 Stopping all queue workers...');

        const stopPromises = Array.from(this.workers.entries()).map(async ([name, worker]) => {
            try {
                logger.info(`⏹️ Stopping ${name} worker...`);
                await worker.close();
                logger.info(`✅ ${name} worker stopped successfully`);
            } catch (error) {
                logger.error(`❌ Error stopping ${name} worker:`, error);
            }
        });

        await Promise.all(stopPromises);

        this.workers.clear();
        this.workerCount = 0;

        logger.info('⏹️ All queue workers stopped successfully');
    }

    getWorkerStatus(): object {
        return {
            totalWorkers: this.workerCount,
            activeWorkers: Array.from(this.workers.keys()),
            status: this.workerCount > 0 ? 'running' : 'stopped'
        };
    }
}