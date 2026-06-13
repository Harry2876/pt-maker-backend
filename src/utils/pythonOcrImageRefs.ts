import { signedUrlUtility } from '../services/signedUrlUtility';
import { ServiceError } from './serviceError';
import { resolveR2ObjectKey } from './r2UrlUtils';

/** Signed URLs for Python OCR — private R2 buckets reject unsigned public URLs (HTTP 400). */
const OCR_IMAGE_URL_EXPIRY_MINUTES = 60;

export interface ScreenshotR2Ref {
    storageUrl?: string | null;
    fileName?: string | null;
}

export async function resolvePythonOcrImageRef(screenshot: ScreenshotR2Ref): Promise<string> {
    const key = resolveR2ObjectKey(
        screenshot.storageUrl ?? undefined,
        screenshot.fileName ?? undefined
    );

    if (!key) {
        throw new ServiceError(
            'Screenshot is missing R2 storage reference (storageUrl/fileName)',
            400,
            'MISSING_SCREENSHOT_URL'
        );
    }

    const signed = await signedUrlUtility.generateSignedUrl(key, {
        expiryMinutes: OCR_IMAGE_URL_EXPIRY_MINUTES,
    });

    return signed.signedUrl;
}

export async function resolvePythonOcrImageRefs(screenshots: ScreenshotR2Ref[]): Promise<string[]> {
    return Promise.all(screenshots.map(resolvePythonOcrImageRef));
}
