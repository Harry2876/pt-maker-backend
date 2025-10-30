import { otpQueue, screenshotQueue, emailQueue, userSyncQueue, databaseSyncQueue, batchSyncQueue, advancedEngineQueue, discordSyncQueue } from "../config/queues";
import { OTPSendingJob, ScreenshotProcessingJob, EmailNotificationJob, DatabaseSyncJob, EntityType, AdvancedEngineJob, DiscordSyncJob } from "../types/queue";
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
    static async processAdvancedEngine(data: AdvancedEngineJob): Promise<string> {
        try {
            const job = await advancedEngineQueue.add('PROCESS_SCREENSHOTS', data, {
                priority: this.getPriorityValue(data.priority),
                delay: 0,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                }
            });

            logger.info(`Advanced Engine job added to queue for match ${data.matchId} by user ${data.userId}`, {
                jobId: job.id,
                priority: data.priority,
                processingType: data.request.processingType
            });

            return job.id as string;
        } catch (error) {
            logger.error(`Failed to add Advanced Engine job to queue for match ${data.matchId}:`, error);
            throw error;
        }
    }

    // Get Advanced Engine Job Status
    static async getAdvancedEngineJobStatus(jobId: string): Promise<any> {
        try {
            const job = await advancedEngineQueue.getJob(jobId);
            if (!job) {
                return {
                    status: 'NOT_FOUND',
                    message: 'Job not found'
                };
            }

            return {
                id: job.id,
                status: await job.getState(),
                progress: job.progress,
                data: job.data,
                failedReason: job.failedReason,
                processedOn: job.processedOn,
                finishedOn: job.finishedOn,
                createdAt: job.timestamp
            };
        } catch (error) {
            logger.error(`Failed to get Advanced Engine job status for ${jobId}:`, error);
            throw error;
        }
    }

    // Get Match Processing Status
    static async getMatchProcessingStatus(matchId: string): Promise<any> {
        try {
            // Get jobs for this match
            const jobs = await advancedEngineQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
            const matchJobs = jobs.filter(job => job.data.matchId === matchId);

            if (matchJobs.length === 0) {
                return {
                    status: 'NO_JOBS',
                    message: 'No processing jobs found for this match'
                };
            }

            // Return the latest job
            const latestJob = matchJobs.sort((a, b) => b.timestamp - a.timestamp)[0];
            return await this.getAdvancedEngineJobStatus(latestJob.id as string);
        } catch (error) {
            logger.error(`Failed to get match processing status for ${matchId}:`, error);
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

    static async syncImmediately(entityType: EntityType, entityId: string, data: any, userId: string): Promise<void> {
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
    static async syncDiscordImmediately(
    entityType: 'DISCORD_GUILD' | 'DISCORD_USER' | 'DISCORD_GUILD_MEMBER' | 'BOT_STATE' | 'TEAM_ENROLLMENT' | 'USER_RATE_LIMIT' | 'TEAM_NAME_CHANGE' | 'TEAM_ACTIVITY_LOG' | 'REGISTRATION_SESSION' | 'REGISTRATION_QUEUE' | 'TEAM_MERIT' | 'REGISTRATION_DELAY' | 'REGISTRATION_TOGGLE' | 'TEAM_BAN', 
    entityId: string, 
    data: any, 
    userId: string
): Promise<void> {
    try {
        await discordSyncQueue.add('discord-sync-to-db', {
            type: `${entityType}_CREATE`,
            entityId,
            data,
            userId,
            priority: 'NORMAL',
            timestamp: new Date().toISOString()
        }, {
            priority: 2,
            delay: 0,
        });

        logger.info(`Immediate Discord sync queued for ${entityType} ${entityId}`);
    } catch (error) {
        logger.error(`Failed to queue immediate Discord sync for ${entityType} ${entityId}:`, error);
        throw error;
    }
}
    static async queueDiscordSync(data: DiscordSyncJob): Promise<void> {
        try {
            await discordSyncQueue.add('discord-sync-to-db', data, {
                priority: this.getPriorityValue(data.priority),
                delay: data.priority === 'CRITICAL' ? 0 : 2000, // Immediate for critical
            });
            logger.info(`Discord sync job added to queue for entity ${data.entityId} with priority ${data.priority}`);
        } catch (error) {
            logger.error(`Failed to add Discord sync job to queue for entity ${data.entityId} with priority ${data.priority}`, error);
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
