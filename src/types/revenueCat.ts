import { SubscriptionStatus } from "@prisma/client";


export type RevenueCatEventType = 
| 'INITIAL_PURCHASE'
| 'RENEWAL'
| 'UNCANCELLATION'
| 'CANCELLATION'
| 'EXPIRATION'
| 'BILLING_ISSUE'
| 'PRODUCT_CHANGE'
| string;

export interface RevenueCatWebhookEventPayload {
    id: string;
    type: RevenueCatEventType;
    app_user_id: string;
    product_id?: string;
    entitlement_ids?: string[];
    expiration_at_ms?: number | null;
    event_timestamp_ms?: number;
}

export interface RevenueCatWebhookBody {
    api_version?: string;
    event: RevenueCatWebhookEventPayload;
  }
  /** For Step 7 profile — define now, use later */
  export interface UserEntitlements {
    isPro: boolean;
    showBranding: boolean;
    showAds: boolean;
    subscriptionStatus: SubscriptionStatus;
    expiresAt: string | null;
    productIdentifier: string | null;
  }