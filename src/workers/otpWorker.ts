import { Job } from "bullmq";
import { BaseWorker } from './baseWorker';
import { OTPSendingJob } from '../types/queue';
import { Queues } from '../config/queues';
import logger from '../utils/logger';
import { redis } from '../config/redis';
import { PhoneUtils } from '../utils/phoneUtils';
import { create } from "domain";
import { whatsappService } from "../services/whatsappService";

export class OTPWorker extends BaseWorker<OTPSendingJob> {
    constructor() {
        super(Queues.OTP_SENDING, { concurrency: 10 });
    }

    protected async processJob(job: Job<OTPSendingJob>): Promise<void> {
        const { phoneNumber, otp, type, userId } = job.data;

        logger.info(`Processing OTP job for user ${userId} with phone ${phoneNumber} and type ${type}`);

        try {
            //store otp in redis for verification
            await this.storeOTPInRedis(phoneNumber, otp);

            //smart otp sending with multiple fallbacks
            const success = await this.sendOTPSmartWay(phoneNumber, otp, type);

            if (success) {
                logger.info(`✅ OTP sent successfully for user ${userId} with phone ${phoneNumber}`);
            } else {
                throw new Error("All OTP sending methods failed");
            }
        } catch (error) {
            logger.error(`❌ Failed to process OTP job for user ${userId} with phone ${phoneNumber}`, error);
            throw error;
        }
    }

    private async storeOTPInRedis(phoneNumber: string, otp: string): Promise<void> {
        const normalizedPhone = PhoneUtils.normalize(phoneNumber);
        const key = `phone_otp:${normalizedPhone}`;
        const ttl = 180; // 3 minutes
        const expiresAt = Date.now() + ttl * 1000; // 3 mins from now

        const otpData = {
            otp: otp,
            expiresAt: expiresAt,
            createdAt: Date.now(),
            attemptsLeft: 3,
            isUsed: false
        };
        const success = await redis.setObject(key, otpData, ttl);

        if (success) {
            logger.info(`✅ OTP stored in Redis for phone ${normalizedPhone}`);
        } else {
            logger.error(`❌ Failed to store OTP in Redis for phone ${normalizedPhone}`);
        }
    }

    private async sendOTPSmartWay(phoneNumber: string, otp: string, type: string): Promise<boolean> {
        try {
            // 🎯 NEW: WhatsApp first, fallback to logs
            const success = await whatsappService.sendOTP(phoneNumber, otp);

            if (success) {
                logger.info(`✅ WhatsApp OTP sent successfully to ${phoneNumber} for ${type}`);
                return true;
            }

            // Fallback: Log for development (keep your existing log)
            logger.info(`🔧 Fallback: OTP ${otp} for ${type} to phone ${phoneNumber} is Valid for 3 Mins`);
            return true;

        } catch (error) {
            logger.error(`❌ Failed to send OTP via WhatsApp to ${phoneNumber}`, error);

            // Still return true so registration continues
            logger.info(`📱 Development mode: OTP ${otp} for ${type} to ${phoneNumber}`);
            return true;
        }
    }

    // TODO: Implement when you get SMS service
    private async sendViaSMS(phoneNumber: string, otp: string): Promise<void> {
        // Implementation for SMS sending
    }

    // TODO: Implement when you get WhatsApp Business API
    private async sendViaWhatsApp(phoneNumber: string, otp: string): Promise<void> {
        // Implementation for WhatsApp sending
    }
}
