import { Readable } from 'stream';
import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { ServiceError } from '../utils/serviceError';
import { storedFileService } from './storedFileService';
import { issueClientPreview } from '../utils/previewUrlUtils';
import { MediaAssetListItem, MediaAssetPreview, QuickMediaAssetType } from '../types/mediaAsset';

export interface RegisterMediaAssetInput {
    userId: string;
    assetType: QuickMediaAssetType;
    rawImageUrl: string;
    quickMatchId?: string;
    quickSeriesId?: string;
    filename?: string;
    metadata?: Record<string, unknown>;
}

export interface MediaStreamResult {
    stream: Readable;
    contentType: string;
    filename: string;
}

export class MediaAssetService extends BaseService {

    async registerFromImageUrl(input: RegisterMediaAssetInput): Promise<MediaAssetPreview> {
        const file = await storedFileService.registerFromRawUrl({
            userId: input.userId,
            assetType: input.assetType,
            rawUrl: input.rawImageUrl,
            quickMatchId: input.quickMatchId ?? null,
            quickSeriesId: input.quickSeriesId ?? null,
            filename: input.filename ?? null,
            mimeType: 'image/png',
            metadata: input.metadata ?? null,
        });

        return this.toMediaAssetPreview(file.id);
    }

    async findByR2Key(userId: string, r2Key: string) {
        const file = await storedFileService.findByR2Key(userId, r2Key);
        if (!file) {
            return null;
        }
        return { id: file.id };
    }

    async getOwnedAsset(assetId: string, userId: string) {
        const asset = await this.db.quickMediaAsset.findUnique({ where: { id: assetId } });
        if (!asset || asset.userId !== userId) {
            throw new ServiceError('Media asset not found or access denied', 404, 'NOT_FOUND');
        }
        return asset;
    }

    async streamOwnedAsset(assetId: string, userId: string): Promise<MediaStreamResult> {
        const asset = await this.getOwnedAsset(assetId, userId);
        const { body, contentType } = await r2Service.getObjectStream(asset.r2Key);

        return {
            stream: body,
            contentType,
            filename: asset.filename || `${asset.assetType.toLowerCase()}.png`,
        };
    }

    async listMatchMedia(
        quickMatchId: string,
        userId: string,
        assetType?: QuickMediaAssetType,
    ): Promise<MediaAssetListItem[]> {
        const assets = await this.db.quickMediaAsset.findMany({
            where: {
                quickMatchId,
                userId,
                ...(assetType && { assetType }),
            },
            orderBy: { createdAt: 'desc' },
        });

        return assets.map(a => ({
            ...this.toMediaAssetPreview(a.id),
            assetType: a.assetType as QuickMediaAssetType,
            filename: a.filename,
            metadata: (a.metadata as Record<string, unknown>) ?? null,
            createdAt: a.createdAt.toISOString(),
        }));
    }

    previewForAssetId(assetId: string): MediaAssetPreview {
        return this.toMediaAssetPreview(assetId);
    }

    private toMediaAssetPreview(fileId: string): MediaAssetPreview {
        const client = issueClientPreview(fileId);
        return {
            assetId: fileId,
            previewUrl: client.previewUrl,
            signedUrl: client.signedUrl,
            expiresAt: client.expiresAt,
            previewUrlExpiresInSeconds: client.previewUrlExpiresInSeconds,
        };
    }
}

export const mediaAssetService = new MediaAssetService();
