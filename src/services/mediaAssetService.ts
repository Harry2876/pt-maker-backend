import { Readable } from 'stream';
import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { ServiceError } from '../utils/serviceError';
import { extractR2KeyFromUrl } from '../utils/r2UrlUtils';
import { buildMediaPreviewUrl } from '../utils/mediaPreviewUrl';
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
        const r2Key = extractR2KeyFromUrl(input.rawImageUrl);

        const asset = await this.db.quickMediaAsset.create({
            data: {
                userId: input.userId,
                quickMatchId: input.quickMatchId ?? null,
                quickSeriesId: input.quickSeriesId ?? null,
                assetType: input.assetType,
                r2Key,
                mimeType: 'image/png',
                filename: input.filename ?? null,
                metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
            },
        });

        return {
            assetId: asset.id,
            previewUrl: buildMediaPreviewUrl(asset.id),
        };
    }

    async findByR2Key(userId: string, r2Key: string) {
        return this.db.quickMediaAsset.findFirst({
            where: { userId, r2Key },
            orderBy: { createdAt: 'desc' },
        });
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
            assetId: a.id,
            previewUrl: buildMediaPreviewUrl(a.id),
            assetType: a.assetType as QuickMediaAssetType,
            filename: a.filename,
            metadata: (a.metadata as Record<string, unknown>) ?? null,
            createdAt: a.createdAt.toISOString(),
        }));
    }

    previewForAssetId(assetId: string): MediaAssetPreview {
        return {
            assetId,
            previewUrl: buildMediaPreviewUrl(assetId),
        };
    }
}

export const mediaAssetService = new MediaAssetService();
