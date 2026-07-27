import { randomUUID } from 'crypto';
import { BaseService } from './baseService';
import { quickMatchService } from './quickMatchService';
import { r2Service } from './cloudflareR2Service';
import { issueLogoClientPreview, toLogoPreviewResponse } from '../utils/logoPreviewUtils';
import { ServiceError } from '../utils/serviceError';
import { MatchBrandingLogoUrls } from '../utils/brandingLogoUtils';
import { MatchBrandingLogoView, MatchBrandingLogosView } from '../types/quickMatch';

export type BrandingLogoKind = 'organiser' | 'sponsor';

const LOGO_EXT_MAP: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};

export interface BrandingLogoUploadResult extends MatchBrandingLogoView {}

export class QuickMatchBrandingService extends BaseService {
    async attachBrandingLogo(
        userId: string,
        quickMatchId: string,
        kind: BrandingLogoKind,
        fileBuffer: Buffer,
        mimeType: string,
    ): Promise<BrandingLogoUploadResult> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const ext = LOGO_EXT_MAP[mimeType];
        if (!ext) {
            throw new ServiceError('Invalid logo type. Allowed: jpeg, png, webp.', 400, 'INVALID_FILE_TYPE');
        }

        if (fileBuffer.length > 5 * 1024 * 1024) {
            throw new ServiceError('Logo file too large. Maximum size is 5MB.', 400, 'FILE_TOO_LARGE');
        }

        const dbMatch = await this.db.quickMatch.findUnique({
            where: { id: quickMatchId },
            select: {
                organiserLogoR2Key: true,
                sponsorLogoR2Key: true,
            },
        });

        if (!dbMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const existingR2Key = kind === 'organiser'
            ? dbMatch.organiserLogoR2Key
            : dbMatch.sponsorLogoR2Key;

        if (existingR2Key) {
            await r2Service.deleteFile(existingR2Key).catch(() => { });
        }

        const r2Key = `match-branding-logos/${quickMatchId}/${kind}-${randomUUID()}.${ext}`;
        const { url } = await r2Service.uploadLogoBuffer(fileBuffer, r2Key, mimeType);

        await this.db.quickMatch.update({
            where: { id: quickMatchId },
            data: kind === 'organiser'
                ? { organiserLogoR2Key: r2Key, organiserLogoStorageUrl: url }
                : { sponsorLogoR2Key: r2Key, sponsorLogoStorageUrl: url },
        });

        const preview = await issueLogoClientPreview({ userId, r2Key, quickMatchId });
        if (!preview) {
            throw new ServiceError('Failed to generate logo preview URL', 500, 'PREVIEW_URL_FAILED');
        }

        this.logger.info(`${kind} branding logo attached to match ${quickMatchId}`);

        return {
            logoStorageUrl: url,
            ...toLogoPreviewResponse(preview),
            signedLogoUrl: preview.previewUrl,
        } as BrandingLogoUploadResult;
    }

    async removeBrandingLogo(
        userId: string,
        quickMatchId: string,
        kind: BrandingLogoKind,
    ): Promise<void> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const dbMatch = await this.db.quickMatch.findUnique({
            where: { id: quickMatchId },
            select: {
                organiserLogoR2Key: true,
                sponsorLogoR2Key: true,
            },
        });

        if (!dbMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const existingR2Key = kind === 'organiser'
            ? dbMatch.organiserLogoR2Key
            : dbMatch.sponsorLogoR2Key;

        if (existingR2Key) {
            await r2Service.deleteFile(existingR2Key).catch(() => { });
        }

        await this.db.quickMatch.update({
            where: { id: quickMatchId },
            data: kind === 'organiser'
                ? { organiserLogoR2Key: null, organiserLogoStorageUrl: null }
                : { sponsorLogoR2Key: null, sponsorLogoStorageUrl: null },
        });

        this.logger.info(`${kind} branding logo removed from match ${quickMatchId}`);
    }

    async getBrandingLogoUrls(quickMatchId: string): Promise<MatchBrandingLogoUrls> {
        const match = await this.db.quickMatch.findUnique({
            where: { id: quickMatchId },
            select: {
                organiserLogoStorageUrl: true,
                sponsorLogoStorageUrl: true,
            },
        });

        return {
            ...(match?.organiserLogoStorageUrl && { orgLogoUrl: match.organiserLogoStorageUrl }),
            ...(match?.sponsorLogoStorageUrl && { sponsorLogoUrl: match.sponsorLogoStorageUrl }),
        };
    }

    /** Signed preview URLs for app display on GET match (same pattern as slot logo list items). */
    async getBrandingLogosForClient(
        userId: string,
        quickMatchId: string,
    ): Promise<MatchBrandingLogosView> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const match = await this.db.quickMatch.findUnique({
            where: { id: quickMatchId },
            select: {
                organiserLogoR2Key: true,
                organiserLogoStorageUrl: true,
                sponsorLogoR2Key: true,
                sponsorLogoStorageUrl: true,
            },
        });

        const [organiserLogo, sponsorLogo] = await Promise.all([
            this.toBrandingLogoView(
                userId,
                quickMatchId,
                match?.organiserLogoR2Key ?? null,
                match?.organiserLogoStorageUrl ?? null,
            ),
            this.toBrandingLogoView(
                userId,
                quickMatchId,
                match?.sponsorLogoR2Key ?? null,
                match?.sponsorLogoStorageUrl ?? null,
            ),
        ]);

        return { organiserLogo, sponsorLogo };
    }

    private async toBrandingLogoView(
        userId: string,
        quickMatchId: string,
        r2Key: string | null,
        logoStorageUrl: string | null,
    ): Promise<MatchBrandingLogoView | null> {
        if (!r2Key || !logoStorageUrl) {
            return null;
        }

        const preview = await issueLogoClientPreview({ userId, r2Key, quickMatchId });
        if (!preview?.fileId || !preview.previewUrl || !preview.signedUrl || !preview.expiresAt) {
            return null;
        }

        return {
            logoStorageUrl,
            fileId: preview.fileId,
            previewUrl: preview.previewUrl,
            signedUrl: preview.signedUrl,
            signedLogoUrl: preview.previewUrl,
            expiresAt: preview.expiresAt,
            previewUrlExpiresInSeconds: preview.previewUrlExpiresInSeconds ?? 0,
        };
    }
}

export const quickMatchBrandingService = new QuickMatchBrandingService();
