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
 * Convert a stored screenshot/template URL to the object key inside the bucket.
 * Handles path-style URLs: https://account.r2.cloudflarestorage.com/bucket/key → key
 */
export function storageUrlToR2Key(storageUrl: string): string {
    try {
        const url = new URL(storageUrl);
        let key = url.pathname.replace(/^\/+/, '');
        const bucketName = process.env.R2_BUCKET_NAME;
        if (bucketName && key.startsWith(`${bucketName}/`)) {
            key = key.substring(bucketName.length + 1);
        }
        if (key.startsWith('pt-maker-screenshots/')) {
            key = key.substring('pt-maker-screenshots/'.length);
        }
        return key;
    } catch {
        return storageUrl.replace(/^\/+/, '');
    }
}

/** Infer MIME type from an R2 object key extension. */
export function mimeTypeFromR2Key(key: string): string {
    const ext = key.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        gif: 'image/gif',
        json: 'application/json',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return map[ext ?? ''] ?? 'application/octet-stream';
}

/** Normalize Python image URL to an R2 object key inside the bucket. */
export function extractR2KeyFromUrl(imageUrl: string): string {
    const key = storageUrlToR2Key(imageUrl);
    if (!key) {
        throw new Error('Empty R2 object key');
    }
    return key;
}

/**
 * Normalize an object key inside the bucket (no bucket prefix, no leading slash).
 */
export function resolveR2ObjectKey(storageUrl?: string, fallbackKey?: string): string | null {
    const source = (storageUrl || fallbackKey || '').trim();
    if (!source) {
        return null;
    }

    let key = source.startsWith('http')
        ? storageUrlToR2Key(source)
        : source.replace(/^\/+/, '');

    if (key.startsWith('pt-maker-screenshots/')) {
        key = key.substring('pt-maker-screenshots/'.length);
    }

    return key || null;
}

/**
 * Build the image reference Python AI uses to download from R2.
 * Uses full raw HTTPS URLs — same pattern as standings/template calls.
 */
export function resolvePythonImageRef(storageUrl: string, fallbackKey?: string): string {
    const trimmedStorageUrl = (storageUrl || '').trim();
    if (trimmedStorageUrl.startsWith('https://') || trimmedStorageUrl.startsWith('http://')) {
        return trimmedStorageUrl;
    }

    const key = resolveR2ObjectKey(undefined, fallbackKey || storageUrl);
    if (!key) {
        throw new Error('Missing R2 image reference');
    }

    const url = buildRawR2ObjectUrl(key);
    if (!url.startsWith('https://')) {
        throw new Error(`Invalid R2 public URL for key "${key}" — check R2_PUBLIC_URL`);
    }
    return url;
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

/** R2 folder prefix for Python crop APIs: `{bucket}/{key-dir}/` */
export function buildCropFolderPathFromObjectKey(objectKey: string): string {
    const bucket = env.R2_BUCKET_NAME || 'pt-maker-screenshots';
    const key = resolveR2ObjectKey(undefined, objectKey) ?? objectKey.replace(/^\/+/, '');
    const lastSlash = key.lastIndexOf('/');
    const dir = lastSlash >= 0 ? key.substring(0, lastSlash + 1) : '';
    return `${bucket}/${dir}`;
}

export function buildCropFolderPathFromStorageUrl(storageUrl: string): string {
    return buildCropFolderPathFromObjectKey(storageUrlToR2Key(storageUrl));
}

/** Standard quick-pt screenshot folder when no sample file key is available yet. */
export function buildQuickPtScreenshotFolderPath(
    quickMatchId: string,
    screenshotType: 'ATTENDANCE_IMAGE' | 'RESULT_IMAGE',
): string {
    const bucket = env.R2_BUCKET_NAME || 'pt-maker-screenshots';
    return `${bucket}/quick-pt/${screenshotType}/match-${quickMatchId}/`;
}
