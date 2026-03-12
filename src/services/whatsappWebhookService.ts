import { BaseService } from './baseService';
import { 
    WhatsAppWebhookPayload, 
    WhatsAppWebhookStatus, 
    WhatsAppWebhookMessage 
} from '../types/whatsappWebhook';

export class WhatsAppWebhookService extends BaseService {

    /**
     * Process incoming webhook payload
     */
    async processWebhookPayload(payload: WhatsAppWebhookPayload): Promise<void> {
        try {
            this.logger.info('📥 WhatsApp Webhook payload received', { 
                object: payload.object,
                entriesCount: payload.entry.length 
            });

            for (const entry of payload.entry) {
                for (const change of entry.changes) {
                    if (change.field === 'messages') {
                        await this.processMessageChange(change.value);
                    }
                }
            }

        } catch (error) {
            this.handleError(error, 'Process Webhook Payload');
        }
    }

    /**
     * Process message-related changes
     */
    private async processMessageChange(value: any): Promise<void> {
        const { metadata, statuses, messages } = value;
        
        this.logger.info('📱 WhatsApp change detected', {
            phoneNumber: metadata.display_phone_number,
            phoneNumberId: metadata.phone_number_id,
            hasStatuses: !!statuses?.length,
            hasMessages: !!messages?.length
        });

        // Process delivery status updates (outgoing messages)
        if (statuses && statuses.length > 0) {
            for (const status of statuses) {
                await this.processStatusUpdate(status);
            }
        }

        // Process incoming messages from users
        if (messages && messages.length > 0) {
            for (const message of messages) {
                await this.processIncomingMessage(message);
            }
        }
    }

    /**
     * Process message delivery status updates
     */
    private async processStatusUpdate(status: WhatsAppWebhookStatus): Promise<void> {
        try {
            this.logger.info(`📊 Message Status Update: ${status.status.toUpperCase()}`, {
                messageId: status.id,
                status: status.status,
                recipientId: status.recipient_id,
                timestamp: status.timestamp,
                hasErrors: !!status.errors?.length
            });

            // Log delivery success
            if (['sent', 'delivered', 'read'].includes(status.status)) {
                this.logger.info(`✅ Message ${status.status} successfully`, {
                    messageId: status.id,
                    recipientId: status.recipient_id
                });
            }

            // Log delivery failures with details
            if (status.status === 'failed' && status.errors) {
                for (const error of status.errors) {
                    this.logger.error(`❌ Message delivery failed`, {
                        messageId: status.id,
                        recipientId: status.recipient_id,
                        errorCode: error.code,
                        errorTitle: error.title,
                        errorMessage: error.message
                    });
                }
            }

        } catch (error) {
            this.handleError(error, 'Process Status Update');
        }
    }

    /**
     * Process incoming messages from users
     */
    private async processIncomingMessage(message: WhatsAppWebhookMessage): Promise<void> {
        try {
            this.logger.info('📨 Incoming WhatsApp Message', {
                messageId: message.id,
                from: message.from,
                type: message.type,
                timestamp: message.timestamp,
                body: message.text?.body || `[${message.type} message]`
            });

            // Log different message types
            switch (message.type) {
                case 'text':
                    this.logger.info(`💬 Text message: "${message.text?.body}"`, {
                        from: message.from,
                        messageId: message.id
                    });
                    break;
                default:
                    this.logger.info(`📎 ${message.type.toUpperCase()} message received`, {
                        from: message.from,
                        messageId: message.id
                    });
            }

        } catch (error) {
            this.handleError(error, 'Process Incoming Message');
        }
    }

    /**
     * Verify webhook subscription (for Meta verification)
     */
    verifyWebhook(mode: string, token: string, challenge: string): string | null {
        const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        
        this.logger.info('🔐 Webhook verification attempt', {
            mode,
            tokenProvided: !!token,
            challengeProvided: !!challenge,
            expectedTokenConfigured: !!expectedToken
        });

        if (mode === 'subscribe' && token === expectedToken) {
            this.logger.info('✅ Webhook verification successful');
            return challenge;
        }

        this.logger.warn('❌ Webhook verification failed', {
            mode,
            tokenMatch: token === expectedToken
        });
        
        return null;
    }
}

export const whatsAppWebhookService = new WhatsAppWebhookService();