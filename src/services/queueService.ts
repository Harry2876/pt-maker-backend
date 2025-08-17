import { otpQueue, screenshotQueue, emailQueue, userSyncQueue, databaseSyncQueue, batchSyncQueue } from "../config/queues";
import { OTPSendingJob, ScreenshotProcessingJob, EmailNotificationJob, DatabaseSyncJob } from "../types/queue";
import logger from "../utils/logger";

export class QueueService {
    //add otp sending job to thew queue
    static async sendOTP(data: OTPSendingJob): Promise<void> {
        try {
            await otpQueue.add('send-otp', data, {
                priority: 1, //High priority for otp
                delay: 0, //send immediately
            });
            logger.info(`OTP job added to queue for user ${data.userId} with phone ${data.phoneNumber}`);
        } catch (error) {
            logger.error(`Failed to add OTP job to queue for user ${data.userId} with phone ${data.phoneNumber}`, error);
            throw error;
        }
    }

    //add screenshot processing job
    static async processScreenshot(data: ScreenshotProcessingJob): Promise<void> {
        try {
            await screenshotQueue.add('process-screenshot', data, {
                priority: 2, // Medium priority for screenshots
                delay: 0, // Send immediately
            });
            logger.info(`Screenshot job added to queue for user ${data.userId} with screenshot ${data.screenshotUrls.length}`);
        } catch (error) {
            logger.error(`Failed to add screenshot job to queue for user ${data.userId} with screenshot ${data.screenshotUrls.length}`, error);
            throw error;
        }
    }

    //add email notification job
    static async sendEmailNotification(data: EmailNotificationJob): Promise<void> {
        try {
            await emailQueue.add('send-email', data, {
                priority: 3, // Low priority for emails
                delay: 0, // Send immediately
            });
            logger.info(`Email job added to queue for user ${data.userId} with email ${data.email}`);
        } catch (error) {
            logger.error(`Failed to add email job to queue for user ${data.userId} with email ${data.email}`, error);
            throw error;
        }
    }
    static async scheduleUserSync(): Promise<void> {
        try {
            await userSyncQueue.add('sync-users-to-db', {}, {
                repeat: {
                    every: 90000 // Every 60 seconds
                },
                priority: 5 // Low priority
            });
            logger.info('User sync job scheduled to run every 60 seconds');
        } catch (error) {
            logger.error('Failed to schedule user sync job:', error);
            throw error;
        }
    }
    static async queueDatabaseSync(data: DatabaseSyncJob): Promise<void> {
        try {
            await databaseSyncQueue.add('sync-to-db', data, {
                priority: this.getPriorityValue(data.priority),
                delay: data.priority === 'CRITICAL' ? 0 : 5000, //Immediate for critical
            });
            logger.info(`Database sync job added to queue for entity ${data.entityId} with priority ${data.priority}`);
        } catch (error) {
            logger.error(`Failed to add database sync job to queue for entity ${data.entityId} with priority ${data.priority}`, error);
            throw error;
        }
    }

    static async scheduleBatchSync(): Promise<void> {
        try {
            await batchSyncQueue.add('batch-sync-all', {
                type: 'ALL',
                batchSize: 100
            }, {
                repeat: {
                    every: 600000 // Every 60 minutes
                },
                priority: 10 // Low priority
            });
            logger.info('Batch sync job scheduled to run every 60 minutes');
        } catch (error) {
            logger.error('Failed to schedule batch sync job:', error);
            throw error;
        }
    }

    static async syncImmediately(entityType: "TOURNAMENT" | "MATCH" | "SCREENSHOT" | "GROUP" | "TEAM_REGISTRATION", entityId: string, data: any, userId: string): Promise<void> {
        try {
            await databaseSyncQueue.add('sync-to-db', {
                type: `${entityType}_CREATE`,
                entityId,
                data,
                userId,
                priority: 'NORMAL',
                timestamp: new Date().toISOString()
            }, {
                priority: 2, // High priority for immediate sync
                delay: 0, // No delay
            });

            logger.info(`Immediate sync queued for ${entityType} ${entityId}`);
        } catch (error) {
            logger.error(`Failed to queue immediate sync for ${entityType} ${entityId}:`, error);
            throw error;
        }
    }

    private static getPriorityValue(priority: string): number {
        switch (priority) {
            case 'CRITICAL':
                return 1;
            case 'HIGH':
                return 2;
            case 'NORMAL':
                return 3;
            case 'LOW':
                return 4;
            default:
                return 3;
        }
    }
}
