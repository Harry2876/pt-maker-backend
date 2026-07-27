import { StandingsExportOptions } from '../types/pythonAI';

export interface MatchBrandingLogoUrls {
    orgLogoUrl?: string;
    sponsorLogoUrl?: string;
}

/** Inject uploaded logo URLs into header_overrides for slot-list, top-10, and team-list. */
export function mergeBrandingIntoHeaderOverrides(
    clientHeaderOverrides?: Record<string, unknown> | null,
    branding?: MatchBrandingLogoUrls,
): Record<string, unknown> | undefined {
    const merged: Record<string, unknown> = { ...(clientHeaderOverrides ?? {}) };

    if (branding?.orgLogoUrl) {
        merged.org_logo_url = branding.orgLogoUrl;
    }
    if (branding?.sponsorLogoUrl) {
        merged.sponsor_logo_url = branding.sponsorLogoUrl;
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Inject uploaded logo URLs as top-level fields for standings export. */
export function mergeBrandingIntoStandingsOptions<T extends StandingsExportOptions>(
    options: T,
    branding?: MatchBrandingLogoUrls,
): T {
    return {
        ...options,
        ...(branding?.orgLogoUrl && { orgLogoUrl: branding.orgLogoUrl }),
        ...(branding?.sponsorLogoUrl && { sponsorLogoUrl: branding.sponsorLogoUrl }),
    };
}
