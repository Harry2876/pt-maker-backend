import env from './env';


export const REVENUECAT_PRO_ENTITLEMENT_IDS = (env.REVENUECAT_PRO_ENTITLEMENT_IDS || 'Scrymz Pro')
.split(',')
.map(s => s.trim())
.filter(Boolean);

export function hasProEntitlement(entitlementIds: string[] | undefined | null): boolean {
    if (!entitlementIds) return false;
    return entitlementIds.some(id => REVENUECAT_PRO_ENTITLEMENT_IDS.includes(id));
}

export function msToDate(ms: number | null | undefined): Date | null {
    if (ms == null || ms <= 0) return null;
    return new Date(ms);
  }

export const FREE_TIER_SHOW_BRANDING = true;
export const PRO_TIER_SHOW_BRANDING = false;
export const FREE_TIER_SHOW_ADS = true;
export const PRO_TIER_SHOW_ADS = false;