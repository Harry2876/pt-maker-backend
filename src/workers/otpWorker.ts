import { Job } from "bullmq";
import { BaseWorker } from './baseWorker';
import { OTPSendingJob } from '../types/queue';
import { Queues } from '../config/queues';
import logger from '../utils/logger';
import {redis} from '../config/redis';

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

            if(success){
                logger.info(`✅ OTP sent successfully for user ${userId} with phone ${phoneNumber}`);
            }else {
                throw new Error("All OTP sending methods failed");
            }
        } catch (error) {
            logger.error(`❌ Failed to process OTP job for user ${userId} with phone ${phoneNumber}`, error);
            throw error;
        }
    }

    private async storeOTPInRedis(phoneNumber: string, otp: string): Promise<void> {
        const key = `phone_otp:${phoneNumber}`;
        const ttl = 300; // 5 minutes
        const success = await redis.set(key, otp, ttl);

        if(success){
            logger.info(`✅ OTP stored in Redis for phone ${phoneNumber}`);
        }else{
            logger.error(`❌ Failed to store OTP in Redis for phone ${phoneNumber}`);
        }
    }

    private async sendOTPSmartWay(phoneNumber: string, otp: string, type:string): Promise<boolean> { 
        try {
            //for dev just log the otp
            logger.info(`🔧 Sending OTP ${otp} for ${type} to phone ${phoneNumber} is Valid for 5 Mins`);
            return true;
        } catch (error){
            logger.error(`❌ Failed to send OTP ${type} for phone ${phoneNumber}`, error);
            return false;
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
