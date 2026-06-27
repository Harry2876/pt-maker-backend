import { SubscriptionStatus } from '@prisma/client';
import { BaseService } from './baseService';
import {
    FREE_TIER_SHOW_ADS,
    FREE_TIER_SHOW_BRANDING,
    PRO_TIER_SHOW_ADS,
    PRO_TIER_SHOW_BRANDING,
} from '../config/revenueCat';
import { UserEntitlements } from '../types/revenueCat';

type EntitlementUserRow = {
    subscriptionStatus: SubscriptionStatus;
    subscriptionEndDate: Date | null;
    proProductIdentifier: string | null;
};

export class EntitlementService extends BaseService {

    async isPro(userId: string): Promise<boolean> {
        const user = await this.db.user.findUnique({
            where: { id: userId },
            select: {
                subscriptionStatus: true,
                subscriptionEndDate: true,
            },

        });

        if (!user) {
            return false;
        }

        return this.isProFromRow(user);
    }
    async resolveShowBranding(userId: string): Promise<boolean> {
        const pro = await this.isPro(userId);
        return pro ? PRO_TIER_SHOW_BRANDING : FREE_TIER_SHOW_BRANDING;
    }
    async resolveShowAds(userId: string): Promise<boolean> {
        const pro = await this.isPro(userId);
        return pro ? PRO_TIER_SHOW_ADS : FREE_TIER_SHOW_ADS;
    }
    async getUserEntitlements(userId: string): Promise<UserEntitlements | null> {
        const user = await this.db.user.findUnique({
            where: { id: userId },
            select: {
                subscriptionStatus: true,
                subscriptionEndDate: true,
                proProductIdentifier: true,
            },
        });
        if (!user) {
            return null;
        }
        const isPro = this.isProFromRow(user);
        const showBranding = isPro ? PRO_TIER_SHOW_BRANDING : FREE_TIER_SHOW_BRANDING;
        const showAds = isPro ? PRO_TIER_SHOW_ADS : FREE_TIER_SHOW_ADS;
        return {
            isPro,
            showBranding,
            showAds,
            subscriptionStatus: user.subscriptionStatus,
            expiresAt: user.subscriptionEndDate?.toISOString() ?? null,
            productIdentifier: user.proProductIdentifier ?? null,
        };
    }
    /**
     * Pro = ACTIVE or PAST_DUE (grace) and not past subscriptionEndDate.
     * Webhook keeps these fields in sync via RevenueCat.
     */
    private isProFromRow(user: Pick<EntitlementUserRow, 'subscriptionStatus' | 'subscriptionEndDate'>): boolean {
        const entitledStatus =
            user.subscriptionStatus === SubscriptionStatus.ACTIVE ||
            user.subscriptionStatus === SubscriptionStatus.PAST_DUE;
        if (!entitledStatus) {
            return false;
        }
        if (user.subscriptionEndDate && user.subscriptionEndDate.getTime() <= Date.now()) {
            return false;
        }
        return true;
    }
}
export const entitlementService = new EntitlementService();