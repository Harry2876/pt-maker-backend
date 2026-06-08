import { env } from '../config/env';

/**
 * Derive the config JSON filename for a template image name.
 * e.g. tmplate_1 → templateConfig_1.json
 */
export function templateNameToConfigFileName(templateName: string): string {
    // tmplate_1 → 1, tmplate1 → 1, tmplate_2 → 2
    const stem = templateName.replace(/^tmplate_?/i, '');
    return `templateConfig_${stem}.json`;
}

/**
 * Build a raw (unsigned) R2 object URL from a key relative to the bucket public base.
 * e.g. key "templates/16_teams/tmplate_1.jpeg"
 */
export function buildRawR2ObjectUrl(relativeKey: string): string {
    const base = (env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
    const key = relativeKey.replace(/^\/+/, '');
    return `${base}/${key}`;
}

/**
 * Convert a stored screenshot/template URL to the R2 key path Python AI expects.
 * Handles path-style URLs: https://account.r2.cloudflarestorage.com/bucket/key → bucket/key
 */
export function storageUrlToR2Key(storageUrl: string): string {
    try {
        const url = new URL(storageUrl);
        let key = url.pathname.replace(/^\/+/, '');
        const bucketName = process.env.R2_BUCKET_NAME;
        if (bucketName && key.startsWith(`${bucketName}/`)) {
            key = key.substring(bucketName.length + 1);
        }
        return key;
    } catch {
        return storageUrl.replace(/^\/+/, '');
    }
}

/**
 * Strip null/undefined keys from a payload before sending to Python AI.
 */
export function omitEmptyFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
            out[key] = value;
        }
    }
    return out as Partial<T>;
}
