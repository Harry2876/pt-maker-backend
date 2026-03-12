import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { whatsAppWebhookService } from '../services/whatsappWebhookService';
import { WhatsAppWebhookPayload } from '../types/whatsappWebhook';

export class WhatsAppController {

    /**
     * GET /api/v1/whatsapp/webhook
     * Verify WhatsApp webhook (Meta verification)
     */
    static verifyWebhook = asyncHandler(async (req: Request, res: Response) => {
        const mode = req.query['hub.mode'] as string;
        const token = req.query['hub.verify_token'] as string;
        const challenge = req.query['hub.challenge'] as string;

        console.log('🔐 WhatsApp Webhook Verification Request:', {
            mode,
            token: token ? `${token.slice(0, 8)}...` : 'missing',
            tokenLength: token?.length || 0,
            challenge: challenge ? 'provided' : 'missing',
            challengeLength: challenge?.length || 0,
            allQueryParams: req.query,
            envToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? `${process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.slice(0, 8)}...` : 'missing'
        });

        const verificationResult = whatsAppWebhookService.verifyWebhook(mode, token, challenge);

        if (verificationResult) {
            console.log('✅ WhatsApp webhook verification successful');
            return res.status(200).send(verificationResult);
        }

        console.log('❌ WhatsApp webhook verification failed');
        return res.status(403).json(
            ResponseHelper.error('Webhook verification failed', 'WEBHOOK_VERIFICATION_FAILED')
        );
    });

    /**
     * POST /api/v1/whatsapp/webhook
     * Handle WhatsApp webhook events
     */
    static handleWebhookEvent = asyncHandler(async (req: Request, res: Response) => {
        const payload = req.body as WhatsAppWebhookPayload;

        console.log('📥 WhatsApp Webhook Event Received:', {
            object: payload?.object,
            entriesCount: payload?.entry?.length || 0,
            timestamp: new Date().toISOString()
        });

        // Validate payload structure
        if (!payload || payload.object !== 'whatsapp_business_account') {
            console.log('❌ Invalid WhatsApp webhook payload');
            return res.status(400).json(
                ResponseHelper.error('Invalid webhook payload', 'INVALID_WEBHOOK_PAYLOAD')
            );
        }

        // Process the webhook payload
        await whatsAppWebhookService.processWebhookPayload(payload);

        console.log('✅ WhatsApp webhook processed successfully');
        
        // Meta expects 200 OK response
        return res.status(200).json(
            ResponseHelper.success('Webhook processed successfully')
        );
    });

    /**
     * GET /api/v1/whatsapp/health
     * WhatsApp service health check
     */
    static healthCheck = asyncHandler(async (req: Request, res: Response) => {
        // You can add your whatsAppService health check here if needed
        return res.json(
            ResponseHelper.success('WhatsApp webhook service is healthy', {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                webhookConfigured: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
            })
        );
    });
}