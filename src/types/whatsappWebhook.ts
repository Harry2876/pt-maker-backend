export interface WhatsAppWebhookStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    errors?: Array<{
        code: number;
        title: string;
        message: string;
    }>;
    conversation?: {
        id: string;
        expiration_timestamp?: string;
        origin?: {
            type: string;
        };
    };
}

export interface WhatsAppWebhookMessage {
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'audio' | 'video' | 'document';
    text?: {
        body: string;
    };
}

export interface WhatsAppWebhookValue {
    messaging_product: 'whatsapp';
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    statuses?: WhatsAppWebhookStatus[];
    messages?: WhatsAppWebhookMessage[];
}

export interface WhatsAppWebhookPayload {
    object: 'whatsapp_business_account';
    entry: Array<{
        id: string;
        changes: Array<{
            value: WhatsAppWebhookValue;
            field: 'messages';
        }>;
    }>;
}

export interface WhatsAppWebhookVerification {
    'hub.mode': string;
    'hub.challenge': string;
    'hub.verify_token': string;
}