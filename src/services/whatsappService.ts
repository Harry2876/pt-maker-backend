import axios from 'axios';
import { BaseService } from './baseService';
import { env } from '../config/env';
import { PhoneUtils } from '../utils/phoneUtils';
import {
    WhatsAppSendResponse,
    WhatsAppErrorResponse,
    WhatsAppTemplateRequest
} from '../types/whatsapp';

export class WhatsAppService extends BaseService {
    private axiosInstance: any;
    private accessToken: string;
    private phoneNumberId: string;
    private apiVersion: string;
    private baseUrl: string;

    constructor() {
        super();
        this.accessToken = env.WHATSAPP_ACCESS_TOKEN;
        this.phoneNumberId = env.WHATSAPP_BUSINESS_PHONE_NUMBER_ID;
        this.apiVersion = env.WHATSAPP_API_VERSION;
        this.baseUrl = env.WHATSAPP_API_BASE_URL;

        // Create axios instance following your pythonAIService pattern
        this.axiosInstance = axios.create({
            baseURL: `${this.baseUrl}/${this.apiVersion}`,
            timeout: 30000, // 30 seconds timeout
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Add request interceptor for logging (following your pattern)
        this.axiosInstance.interceptors.request.use(
            (config: any) => {
                this.logger.info(`WhatsApp API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error: any) => {
                this.logger.error('WhatsApp API Request Error:', error);
                return Promise.reject(error);
            }
        );

        // Add response interceptor for logging (following your pattern)
        this.axiosInstance.interceptors.response.use(
            (response: any) => {
                this.logger.info(`WhatsApp API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error: any) => {
                this.logger.error('WhatsApp API Response Error:', {
                    status: error.response?.status,
                    url: error.config?.url,
                    message: error.message
                });
                return Promise.reject(error);
            }
        );
    }


    async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
        try {
            // remove + prefix
            const formattedPhone = PhoneUtils.normalize(phoneNumber).replace('+', '');

            this.logger.info(`Sending WhatsApp OTP to ${formattedPhone}`);

            const templateRequest: WhatsAppTemplateRequest = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template: {
                    name: 'otp', 
                    language: {
                        code: 'en'
                    },
                    components: [
                        {
                            type: 'body',
                            parameters: [
                                {
                                    type: 'text',
                                    text: otp 
                                }
                            ]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [
                                {
                                    type: 'text',
                                    text: otp 
                                }
                            ]
                        }
                    ]
                }
            };

            const response = await this.axiosInstance.post(
                `/${this.phoneNumberId}/messages`,
                templateRequest
            );

            if (response.data?.messages?.[0]?.id) {
                this.logger.info(`WhatsApp OTP sent successfully to ${formattedPhone}. Message ID: ${response.data.messages[0].id}`);
                return true;
            }

            this.logger.warn('WhatsApp API returned unexpected response format:', response.data);
            return false;

        } catch (error) {
            this.handleError(error, 'Send WhatsApp OTP');
            return false;
        }
    }

    /**
     * Generic template message sender (for future use)
     */
    async sendTemplateMessage(
        to: string,
        templateName: string,
        parameters: Array<{ type: 'text'; text: string }>
    ): Promise<boolean> {
        try {
            const formattedPhone = PhoneUtils.normalize(to).replace('+', '');

            const templateRequest: WhatsAppTemplateRequest = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'template',
                template: {
                    name: templateName,
                    language: { code: 'en' },
                    components: [{
                        type: 'body',
                        parameters
                    }]
                }
            };

            const response = await this.axiosInstance.post(
                `/${this.phoneNumberId}/messages`,
                templateRequest
            );

            return !!response.data?.messages?.[0]?.id;

        } catch (error) {
            this.handleError(error, 'Send WhatsApp Template Message');
            return false;
        }
    }

    /**
     * Health check for WhatsApp API
     */
    async healthCheck(): Promise<{ healthy: boolean; message: string }> {
        try {
            // Check if we can access the phone number info
            const response = await this.axiosInstance.get(`/${this.phoneNumberId}`, {
                timeout: 5000
            });

            return {
                healthy: response.status === 200,
                message: response.status === 200 ? 'WhatsApp API is healthy' : 'WhatsApp API health check failed'
            };
        } catch (error) {
            this.logger.warn('WhatsApp API health check failed:', error);
            return {
                healthy: false,
                message: error instanceof Error ? error.message : 'Health check failed'
            };
        }
    }

    /**
     * Format error for better debugging (following your pattern)
     */
    private formatError(error: unknown): Error {
        if (error && typeof error === 'object' && ('response' in error || 'request' in error)) {
            const axiosError = error as any;

            if (axiosError.code === 'ECONNABORTED') {
                return new Error(`WhatsApp API timeout after 30 seconds`);
            }

            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data as any;
                return new Error(
                    `WhatsApp API error (${status}): ${data?.error?.message || 'Unknown error'}`
                );
            }

            return new Error(`WhatsApp API error: ${axiosError.message}`);
        }

        if (error instanceof Error) {
            return error;
        }

        return new Error('Unknown error occurred while communicating with WhatsApp API');
    }

    /**
     * Get API configuration (following your pattern)
     */
    getConfig(): {
        phoneNumberId: string;
        apiVersion: string;
        baseUrl: string;
        hasAccessToken: boolean;
    } {
        return {
            phoneNumberId: this.phoneNumberId,
            apiVersion: this.apiVersion,
            baseUrl: this.baseUrl,
            hasAccessToken: !!this.accessToken
        };
    }
}

export const whatsappService = new WhatsAppService();