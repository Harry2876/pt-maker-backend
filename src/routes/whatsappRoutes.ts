import express from 'express';
import { WhatsAppController } from '../controllers/whatsappController';

const whatsappRouter = express.Router();

/**
 * @swagger
 * /api/v1/whatsapp/webhook:
 *   get:
 *     tags: [WhatsApp Webhooks]
 *     summary: Verify WhatsApp webhook
 *     description: Endpoint for Meta to verify webhook subscription during setup
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *         description: Hub mode (should be 'subscribe')
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *         description: Verification token
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *         description: Challenge string to return if verification passes
 *     responses:
 *       200:
 *         description: Webhook verification successful
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               description: The hub.challenge value
 *       403:
 *         description: Webhook verification failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Webhook verification failed"
 *   post:
 *     tags: [WhatsApp Webhooks]
 *     summary: Handle WhatsApp webhook events
 *     description: Receive and process WhatsApp message status updates and incoming messages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               object:
 *                 type: string
 *                 example: "whatsapp_business_account"
 *               entry:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "102290129340398"
 *                     changes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           value:
 *                             type: object
 *                             properties:
 *                               messaging_product:
 *                                 type: string
 *                                 example: "whatsapp"
 *                               metadata:
 *                                 type: object
 *                                 properties:
 *                                   display_phone_number:
 *                                     type: string
 *                                     example: "+91 70506 66174"
 *                                   phone_number_id:
 *                                     type: string
 *                                     example: "934441963081871"
 *                               statuses:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     id:
 *                                       type: string
 *                                       example: "wamid.HBgMOTE3NjM0ODM1ODMzFQIAERgSNDk2N0FBNTFFMkJFQTgxODkwAA=="
 *                                     status:
 *                                       type: string
 *                                       enum: [sent, delivered, read, failed]
 *                                       example: "delivered"
 *                                     timestamp:
 *                                       type: string
 *                                       example: "1750263773"
 *                                     recipient_id:
 *                                       type: string
 *                                       example: "917634835833"
 *                           field:
 *                             type: string
 *                             example: "messages"
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Webhook processed successfully"
 *       400:
 *         description: Invalid webhook payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid webhook payload"
 */
whatsappRouter.get('/webhook', WhatsAppController.verifyWebhook);
whatsappRouter.post('/webhook', WhatsAppController.handleWebhookEvent);

/**
 * @swagger
 * /api/v1/whatsapp/health:
 *   get:
 *     tags: [WhatsApp Webhooks]
 *     summary: WhatsApp webhook service health check
 *     description: Check if WhatsApp webhook service is configured and healthy
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "WhatsApp webhook service is healthy"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     webhookConfigured:
 *                       type: boolean
 *                       example: true
 */
whatsappRouter.get('/health', WhatsAppController.healthCheck);

export default whatsappRouter;