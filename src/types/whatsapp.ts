// WhatsApp API Response interfaces
export interface WhatsAppSendResponse {
    messaging_product: string;
    contacts: Array<{
        input: string;
        wa_id: string;
    }>;
    messages: Array<{
        id: string;
        message_status: string;
    }>;
}

export interface WhatsAppErrorResponse {
    error: {
        message: string;
        type: string;
        code: number;
        error_subcode?: number;
        fbtrace_id: string;
    };
}

export interface WhatsAppTemplateRequest {
    messaging_product: 'whatsapp';
    to: string;
    type: 'template';
    template: {
        name: string;
        language: {
            code: string;
        };
        components: Array<{
            type: string;
            sub_type?: string; 
            index?: string;     
            parameters: Array<{
                type: 'text';
                text: string;
            }>;
        }>;
    };
}