import { Job } from "bullmq";
import { BaseWorker } from './baseWorker';
import { OTPSendingJob } from '../types/queue';
import { Queues } from '../config/queues';
import logger from '../utils/logger';

export class OTPWorker extends BaseWorker<OTPSendingJob> {
    constructor() {
        super(Queues.OTP_SENDING, {concurrency: 10});
    }

    protected async processJob(job: Job<OTPSendingJob>): Promise<void> {
        const {phoneNumber,otp,type,userId} = job.data;

        logger.info(`Processing OTP job for user ${userId} with phone ${phoneNumber} and type ${type}`);

        try {
            //just logging the otp for now
                        logger.info(`📱 OTP for ${phoneNumber}: ${otp} (Type: ${type})`);

                        //TODO : Replace with actual OTP sending logic
                                    // await this.sendViaSMS(phoneNumber, otp);
            // await this.sendViaWhatsApp(phoneNumber, otp);

            //simulating process
            await new Promise(resolve => setTimeout(resolve, 1000));
            logger.info(`✅ OTP sent successfully for user ${userId} with phone ${phoneNumber}`);
        } catch (error) {
            logger.error(`❌ Failed to process OTP job for user ${userId} with phone ${phoneNumber}`, error);
            throw error;
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
