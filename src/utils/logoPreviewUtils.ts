import { storedFileService } from '../services/storedFileService';
import { mimeTypeFromR2Key } from './r2UrlUtils';
import { PreviewUrlTtl } from './previewUrlUtils';
import { ClientPreviewFields } from '../types/previewUrl';
import logger from './logger';

export interface LogoPreviewInput {
    userId: string;
    r2Key: string;
    quickMatchId?: string | null;
}

/** Register (or dedupe by r2Key) and issue a signed /files/ preview URL for a logo. */
export async function issueLogoClientPreview(
    input: LogoPreviewInput,
): Promise<ClientPreviewFields | null> {
    const r2Key = input.r2Key?.trim();
    if (!r2Key) return null;

    try {
        return await storedFileService.ensureClientPreview(
            {
                userId: input.userId,
                assetType: 'LOGO',
                r2Key,
                resourceId: r2Key,
                quickMatchId: input.quickMatchId ?? null,
                mimeType: mimeTypeFromR2Key(r2Key),
            },
            { expiryMinutes: PreviewUrlTtl.default },
        );
    } catch (error) {
        logger.warn(`Failed to issue logo preview for r2Key=${r2Key}:`, error);
        return null;
    }
}

export interface LogoPreviewResponseFields {
    fileId: string | null;
    previewUrl: string | null;
    signedUrl: string | null;
    signedLogoUrl: string | null;
    expiresAt: string | null;
    previewUrlExpiresInSeconds: number | null;
}

export function toLogoPreviewResponse(
    preview: ClientPreviewFields | null,
): LogoPreviewResponseFields {
    if (!preview) {
        return {
            fileId: null,
            previewUrl: null,
            signedUrl: null,
            signedLogoUrl: null,
            expiresAt: null,
            previewUrlExpiresInSeconds: null,
        };
    }

    return {
        fileId: preview.fileId,
        previewUrl: preview.previewUrl,
        signedUrl: preview.signedUrl,
        signedLogoUrl: preview.previewUrl,
        expiresAt: preview.expiresAt,
        previewUrlExpiresInSeconds: preview.previewUrlExpiresInSeconds,
    };
}

export function withLogoPreviewResponse<T extends Record<string, unknown>>(
    base: T,
    preview: ClientPreviewFields | null,
): T & LogoPreviewResponseFields {
    return { ...base, ...toLogoPreviewResponse(preview) };
}
