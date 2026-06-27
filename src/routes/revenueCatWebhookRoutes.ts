import express from 'express';
import { RevenueCatWebhookController } from '../controllers/revenueCatWebhookController';

const revenueCatWebhookRouter = express.Router();

revenueCatWebhookRouter.post(
  '/revenuecat',
  RevenueCatWebhookController.handleWebhook
);

export default revenueCatWebhookRouter;