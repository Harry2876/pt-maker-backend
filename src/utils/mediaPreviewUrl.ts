import { env } from '../config/env';

/** Build client-facing preview path for a stored media asset (auth required on GET). */
export function buildMediaPreviewPath(assetId: string): string {
    return `/api/v1/quick-pt/media/${assetId}`;
}

/** Ensure PRODUCTION_DOMAIN is a usable absolute origin (adds https:// when omitted). */
function normalizeProductionOrigin(domain: string): string {
    const trimmed = domain.trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return `https://${trimmed}`;
}

/** Absolute URL when PRODUCTION_DOMAIN is set — preferred for Android image loaders. */
export function buildMediaPreviewUrl(assetId: string): string {
    const path = buildMediaPreviewPath(assetId);
    const domain = env.PRODUCTION_DOMAIN?.trim();
    if (!domain) {
        return path;
    }
    return `${normalizeProductionOrigin(domain)}${path}`;
}

const MEDIA_PREVIEW_URL_KEYS = new Set([
    'previewUrl',
    'signedUrl',
    'previewImageUrl',
    'signedImageUrl',
]);

function isMediaPreviewUrl(value: string): boolean {
    return value.includes('/quick-pt/media/');
}

/** Append JWT so preview links work in browser / img tags (Coil can also use Authorization header instead). */
export function appendAccessTokenToPreviewUrl(url: string, accessToken: string): string {
    if (!accessToken || !isMediaPreviewUrl(url)) {
        return url;
    }
    if (/([?&])access_token=/.test(url)) {
        return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}access_token=${encodeURIComponent(accessToken)}`;
}

/** Recursively attach access_token to preview URLs in export/generate responses. */
export function withMediaPreviewAuth<T>(data: T, accessToken?: string | null): T {
    if (!accessToken || data == null) {
        return data;
    }
    if (typeof data === 'string') {
        return (isMediaPreviewUrl(data)
            ? appendAccessTokenToPreviewUrl(data, accessToken)
            : data) as T;
    }
    if (Array.isArray(data)) {
        return data.map(item => withMediaPreviewAuth(item, accessToken)) as T;
    }
    if (typeof data === 'object') {
        const record = data as Record<string, unknown>;
        const out: Record<string, unknown> = { ...record };
        for (const [key, value] of Object.entries(out)) {
            if (typeof value === 'string' && MEDIA_PREVIEW_URL_KEYS.has(key) && isMediaPreviewUrl(value)) {
                out[key] = appendAccessTokenToPreviewUrl(value, accessToken);
            } else if (value && typeof value === 'object') {
                out[key] = withMediaPreviewAuth(value, accessToken);
            }
        }
        return out as T;
    }
    return data;
}
