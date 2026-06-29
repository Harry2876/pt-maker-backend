import { ClientPreviewFields, PreviewUrlResult } from '../types/previewUrl';
import { previewUrlService, PreviewUrlService } from '../services/previewUrlService';

/** Map PreviewUrlResult → Android-compatible fields */
export function toClientPreviewFields(result: PreviewUrlResult): ClientPreviewFields {
    return {
        fileId: result.fileId,
        previewUrl: result.previewUrl,
        signedUrl: result.previewUrl,
        expiresAt: result.expiresAt,
        previewUrlExpiresInSeconds: result.previewUrlExpiresInSeconds,
    };
}

/** Convenience: issue + map in one call (used heavily from Step 4+) */
export function issueClientPreview(
    fileId: string,
    options?: { expiryMinutes?: number },
): ClientPreviewFields {
    const issued = previewUrlService.issue(fileId, options);
    return toClientPreviewFields(issued);
}

/** TTL presets — mirror PreviewUrlService constants */
export const PreviewUrlTtl = {
    screenshot: PreviewUrlService.SCREENSHOT_EXPIRY_MINUTES,
    default: PreviewUrlService.DEFAULT_EXPIRY_MINUTES,
} as const;