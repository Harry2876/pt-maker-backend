import { otpQueue,screenshotQueue,emailQueue } from "../config/queues";
import { OTPSendingJob,ScreenshotProcessingJob,EmailNotificationJob } from "../types/queue";
import logger from "../utils/logger";

export class QueueService {
    //add otp sending job to thew queue
    static async sendOTP(data:OTPSendingJob):Promise<void> {
        try {
            await otpQueue.add('send-otp', data, {
                priority: 1, //High priority for otp
                delay:0, //send immediately
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
}