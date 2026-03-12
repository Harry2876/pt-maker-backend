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
                entriesCount: payload.entry.length,
                fullPayload: JSON.stringify(payload, null, 2)
            });

            for (const entry of payload.entry) {
                this.logger.info('🔍 Processing entry', {
                    entryId: entry.id,
                    changesCount: entry.changes.length,
                    changes: entry.changes.map(c => ({ field: c.field, hasValue: !!c.value }))
                });

                for (const change of entry.changes) {
                    this.logger.info('⚡ Processing change', {
                        field: change.field,
                        value: JSON.stringify(change.value, null, 2)
                    });

                    if (change.field === 'messages') {
                        await this.processMessageChange(change.value);
                    } else {
                        this.logger.info(`📋 Unhandled field: ${change.field}`, {
                            field: change.field,
                            value: change.value
                        });
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
        
        this.logger.info('📱 WhatsApp message change detected', {
            phoneNumber: metadata?.display_phone_number,
            phoneNumberId: metadata?.phone_number_id,
            hasStatuses: !!statuses?.length,
            hasMessages: !!messages?.length,
            statusCount: statuses?.length || 0,
            messageCount: messages?.length || 0,
            fullValue: JSON.stringify(value, null, 2)
        });

        this.logger.info('🔍 MESSAGE CHANGE DETAILED BREAKDOWN:', {
            metadata: metadata ? {
                displayPhoneNumber: metadata.display_phone_number,
                phoneNumberId: metadata.phone_number_id,
                additionalMetadata: JSON.stringify(metadata, null, 2)
            } : 'No metadata',
            statusesInfo: statuses ? {
                count: statuses.length,
                statusTypes: statuses.map((s: any) => s.status),
                statusIds: statuses.map((s: any) => s.id)
            } : 'No statuses',
            messagesInfo: messages ? {
                count: messages.length,
                messageTypes: messages.map((m: any) => m.type),
                messageIds: messages.map((m: any) => m.id)
            } : 'No messages'
        });

        // Process delivery status updates (outgoing messages)
        if (statuses && statuses.length > 0) {
            this.logger.info('📊 Processing status updates', {
                count: statuses.length,
                statuses: statuses.map((s: any) => ({
                    id: s.id,
                    status: s.status,
                    recipientId: s.recipient_id,
                    timestamp: s.timestamp,
                    hasErrors: !!s.errors?.length
                }))
            });

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
                hasErrors: !!status.errors?.length,
                fullStatus: JSON.stringify(status, null, 2)
            });

            this.logger.info('🔍 STATUS UPDATE DETAILED ANALYSIS:', {
                statusDetails: {
                    messageId: status.id,
                    currentStatus: status.status,
                    recipientId: status.recipient_id,
                    timestamp: status.timestamp,
                    errorCount: status.errors?.length || 0,
                    hasConversation: !!(status as any).conversation,
                    additionalFields: Object.keys(status).filter(key => 
                        !['id', 'status', 'recipient_id', 'timestamp', 'errors'].includes(key)
                    )
                },
                statusProgression: this.getStatusProgression(status.status),
                troubleshootingHints: this.getTroubleshootingHints(status.status, !!status.errors?.length)
            });

            // Log delivery success with detailed tracking
            if (['sent', 'delivered', 'read'].includes(status.status)) {
                this.logger.info(`✅ Message ${status.status.toUpperCase()} successfully`, {
                    messageId: status.id,
                    recipientId: status.recipient_id,
                    statusTimestamp: status.timestamp,
                    deliveryStage: status.status,
                    nextExpectedStatus: this.getNextExpectedStatus(status.status)
                });
            }

            // Log delivery failures with comprehensive error details
            if (status.status === 'failed' && status.errors) {
                this.logger.error('❌ MESSAGE DELIVERY FAILED - DETAILED ERROR ANALYSIS', {
                    messageId: status.id,
                    recipientId: status.recipient_id,
                    failureTimestamp: status.timestamp,
                    errorCount: status.errors.length,
                    fullErrorDetails: status.errors.map(error => ({
                        errorCode: error.code,
                        errorTitle: error.title,
                        errorMessage: error.message,
                        troubleshooting: this.getErrorTroubleshooting(error.code),
                        severity: this.getErrorSeverity(error.code)
                    })),
                    fullStatus: JSON.stringify(status, null, 2)
                });

                for (const error of status.errors) {
                    this.logger.error(`❌ Error Code ${error.code}: ${error.title}`, {
                        messageId: status.id,
                        recipientId: status.recipient_id,
                        errorCode: error.code,
                        errorTitle: error.title,
                        errorMessage: error.message,
                        errorCategory: this.categorizeError(error.code),
                        suggestedActions: this.getSuggestedActions(error.code),
                        documentationLink: this.getErrorDocumentationLink(error.code)
                    });
                }
            }

            // Log other status types with context
            if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) {
                this.logger.info(`📋 Unusual status received: ${status.status}`, {
                    messageId: status.id,
                    status: status.status,
                    fullStatus: JSON.stringify(status, null, 2),
                    note: 'This status type may need additional handling'
                });
            }

        } catch (error: any) {
            this.logger.error('❌ ERROR PROCESSING STATUS UPDATE', {
                error: error?.message || 'Unknown error',
                stack: error?.stack || 'No stack trace',
                statusData: JSON.stringify(status, null, 2),
                timestamp: new Date().toISOString()
            });
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
            tokenLength: token?.length || 0,
            tokenPreview: token ? `${token.slice(0, 8)}...` : 'missing',
            challengeProvided: !!challenge,
            expectedTokenConfigured: !!expectedToken,
            expectedTokenLength: expectedToken?.length || 0,
            expectedTokenPreview: expectedToken ? `${expectedToken.slice(0, 8)}...` : 'missing',
            environmentLoaded: !!process.env.NODE_ENV
        });

        if (mode === 'subscribe' && token === expectedToken) {
            this.logger.info('✅ Webhook verification successful');
            return challenge;
        }

        this.logger.warn('❌ Webhook verification failed', {
            mode,
            modeIsSubscribe: mode === 'subscribe',
            tokenMatch: token === expectedToken,
            tokenExact: token,
            expectedTokenExact: expectedToken
        });
        
        return null;
    }

    /**
     * Get status progression information
     */
    private getStatusProgression(currentStatus: string): string {
        const progressions: Record<string, string> = {
            'sent': 'Message sent from WhatsApp servers → Next: delivered',
            'delivered': 'Message delivered to recipient device → Next: read',
            'read': 'Message read by recipient → Final status',
            'failed': 'Message delivery failed → Check error details'
        };
        return progressions[currentStatus] || 'Unknown status progression';
    }

    /**
     * Get next expected status
     */
    private getNextExpectedStatus(currentStatus: string): string {
        const nextStatus: Record<string, string> = {
            'sent': 'delivered',
            'delivered': 'read',
            'read': 'none (final)',
            'failed': 'none (final)'
        };
        return nextStatus[currentStatus] || 'unknown';
    }

    /**
     * Get troubleshooting hints based on status
     */
    private getTroubleshootingHints(status: string, hasErrors: boolean): string[] {
        const hints = [];
        
        switch (status) {
            case 'sent':
                hints.push('Message sent successfully from WhatsApp servers');
                hints.push('Wait for delivery confirmation');
                break;
            case 'delivered':
                hints.push('Message delivered to recipient device');
                hints.push('Recipient may not have read it yet');
                break;
            case 'read':
                hints.push('Message successfully read by recipient');
                break;
            case 'failed':
                if (hasErrors) {
                    hints.push('Check error details for specific failure reason');
                    hints.push('Common causes: invalid number, blocked recipient, policy violation');
                } else {
                    hints.push('Message failed without specific error details');
                }
                break;
            default:
                hints.push(`Unusual status: ${status} - may need investigation`);
        }
        
        return hints;
    }

    /**
     * Get error troubleshooting information
     */
    private getErrorTroubleshooting(errorCode: number): string {
        const troubleshooting: Record<number, string> = {
            131026: 'Recipient phone number is not a WhatsApp user. Verify the number has WhatsApp installed.',
            131053: 'Media upload error. Check template format and approval status.',
            131047: '24-hour window expired. Use template messages only.',
            130497: 'Country restrictions. Check WhatsApp Business Messaging Policy.',
            131000: 'Unknown error. Try again or contact support.',
            131005: 'Access denied. Check API permissions.',
            131021: 'Sender and recipient are the same number.',
            131042: 'Payment issue. Check billing setup.',
            131049: 'Message not delivered to maintain ecosystem health.',
            131050: 'User stopped receiving marketing messages.',
            131051: 'Unsupported message type.',
            131052: 'Media download error.',
            131057: 'Account in maintenance mode.'
        };
        return troubleshooting[errorCode] || 'Check WhatsApp Business API error documentation for details.';
    }

    /**
     * Get error severity level
     */
    private getErrorSeverity(errorCode: number): string {
        const criticalErrors = [131026, 131050, 131016, 131000];
        const warningErrors = [131047, 131049, 131051];
        
        if (criticalErrors.includes(errorCode)) return 'CRITICAL';
        if (warningErrors.includes(errorCode)) return 'WARNING';
        return 'ERROR';
    }

    /**
     * Categorize error type
     */
    private categorizeError(errorCode: number): string {
        const categories: Record<number, string> = {
            131026: 'RECIPIENT_ISSUE',
            131053: 'MEDIA_ISSUE', 
            131047: 'TIMING_ISSUE',
            130497: 'POLICY_RESTRICTION',
            131000: 'SYSTEM_ERROR',
            131005: 'PERMISSION_ERROR',
            131021: 'CONFIGURATION_ERROR',
            131042: 'BILLING_ERROR',
            131049: 'PLATFORM_LIMIT',
            131050: 'USER_PREFERENCE',
            131051: 'MESSAGE_TYPE_ERROR',
            131052: 'MEDIA_ERROR',
            131057: 'MAINTENANCE_MODE'
        };
        return categories[errorCode] || 'UNKNOWN_ERROR';
    }

    /**
     * Get suggested actions for error code
     */
    private getSuggestedActions(errorCode: number): string[] {
        const actions: Record<number, string[]> = {
            131026: [
                'Verify recipient has WhatsApp installed',
                'Check phone number format (+country code)',
                'Confirm number is active and reachable'
            ],
            131053: [
                'Check OTP template approval status',
                'Verify template format is correct',
                'Ensure media files meet size requirements'
            ],
            131047: [
                'Use template messages only',
                'Check 24-hour customer service window',
                'Send template message instead of free-form text'
            ],
            130497: [
                'Check WhatsApp Business Messaging Policy',
                'Verify business category allows messaging to target country',
                'Contact support for country restrictions'
            ],
            131050: [
                'Do not retry sending to this user',
                'Remove user from marketing lists',
                'Subscribe to user_preferences webhook for future updates'
            ]
        };
        return actions[errorCode] || ['Check WhatsApp Business API documentation', 'Contact support if issue persists'];
    }

    /**
     * Get documentation link for error code
     */
    private getErrorDocumentationLink(errorCode: number): string {
        return `https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes#error-${errorCode}`;
    }
}

export const whatsAppWebhookService = new WhatsAppWebhookService();