import { SubscriptionStatus } from '@prisma/client';
import { BaseService } from './baseService';
import env from '../config/env';
import { hasProEntitlement, msToDate } from '../config/revenueCat';
import { RevenueCatWebhookBody } from '../types/revenueCat';

export class RevenueCatWebhookService extends BaseService {

    verifyAuthorization(header: string | undefined): boolean {
        if (env.REVENUECAT_SKIP_WEBHOOK_AUTH) return true;
        const secret = env.REVENUECAT_WEBHOOK_SECRET;
        if (!secret) return false;
        if (!header) return false;
        // RC sends exactly what you typed in dashboard — support both forms
        return header === secret || header === `Bearer ${secret}`;
    }

    async processWebhook(body: RevenueCatWebhookBody): Promise<void> {
        const event = body.event;
        if(!event?.id || !event?.type || !event?.app_user_id) {
            throw new Error('Invalid webhook payload');
        }

        //Idempotency check
        const existing = await this.db.revenueCatWebhookEvent.findUnique({
            where : { eventId: event.id
            },
        });

        if (existing) {
            this.logger.info(`Skipping duplicate event: ${event.id}`);
            return;
        }

        const user = await this.db.user.findUnique({
            where: { id: event.app_user_id },
        });

        if (!user) {
            this.logger.warn(`User not found for event: ${event.id}`);
            return;
        }

        const update = this.mapEventToUserUpdate(event);

        await this.db.$transaction([
            this.db.user.update({
                where: {id: user.id},
                data:{
                    ...update,
                    revenueCatAppUserId: event.app_user_id,
                    revenueCatLastEventId: event.id,
                    revenueCatLastSyncedAt: new Date(),
                },
            }),
            this.db.revenueCatWebhookEvent.create({
                data:{
                    eventId: event.id,
                    eventType: event.type,
                    appUserId: user.id,
                    payload: body as object,
                },
            }),
        ]);

        this.logger.info(`Processed RC webhook event: ${event.id} for user: ${user.id}`);
    }

    private mapEventToUserUpdate(event: RevenueCatWebhookBody['event']): {
        subscriptionStatus: SubscriptionStatus;
        subscriptionEndDate: Date | null;
        proProductIdentifier: string | null;
      } {
        const proInPayload = hasProEntitlement(event.entitlement_ids);
        const expiresAt = msToDate(event.expiration_at_ms ?? null);
        switch (event.type) {
          case 'INITIAL_PURCHASE':
          case 'RENEWAL':
          case 'UNCANCELLATION':
            return {
              subscriptionStatus: SubscriptionStatus.ACTIVE,
              subscriptionEndDate: expiresAt,
              proProductIdentifier: event.product_id ?? null,
            };
          case 'BILLING_ISSUE':
            return {
              subscriptionStatus: SubscriptionStatus.PAST_DUE,
              subscriptionEndDate: expiresAt,
              proProductIdentifier: event.product_id ?? null,
            };
          case 'EXPIRATION':
            return {
              subscriptionStatus: SubscriptionStatus.INACTIVE,
              subscriptionEndDate: expiresAt,
              proProductIdentifier: null,
            };
          case 'CANCELLATION':
            // Still active until period end — keep ACTIVE if expiration in future
            if (expiresAt && expiresAt.getTime() > Date.now() && proInPayload) {
              return {
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                subscriptionEndDate: expiresAt,
                proProductIdentifier: event.product_id ?? null,
              };
            }
            return {
              subscriptionStatus: SubscriptionStatus.CANCELED,
              subscriptionEndDate: expiresAt,
              proProductIdentifier: event.product_id ?? null,
            };
          default:
            // Unknown event — sync from entitlements if present
            if (proInPayload) {
              return {
                subscriptionStatus: SubscriptionStatus.ACTIVE,
                subscriptionEndDate: expiresAt,
                proProductIdentifier: event.product_id ?? null,
              };
            }
            return {
              subscriptionStatus: SubscriptionStatus.INACTIVE,
              subscriptionEndDate: expiresAt,
              proProductIdentifier: null,
            };
        }
      }
}

export const revenueCatWebhookService = new RevenueCatWebhookService();