import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { revenueCatWebhookService } from '../services/revenueCatWebhookService';
import { RevenueCatWebhookBody } from '../types/revenueCat';

export class RevenueCatWebhookController {
    /**
     * POST /api/v1/webhooks/revenuecat
     * Receive RevenueCat subscription lifecycle events (server-to-server).
     */
    static handleWebhook = asyncHandler(async (req: Request, res: Response) => {
        const authHeader = req.headers.authorization;

        if (!revenueCatWebhookService.verifyAuthorization(authHeader)) {
            return res.status(401).json(
                ResponseHelper.unauthorized('RevenueCat webhook unauthorized'),
            );
        }

        const body = req.body as RevenueCatWebhookBody;

        try {
            await revenueCatWebhookService.processWebhook(body);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Invalid webhook';
            return res.status(400).json(
                ResponseHelper.validationError(message),
            );
        }

        return res.status(200).json(
            ResponseHelper.success('RevenueCat webhook processed successfully'),
        );
    });
}
