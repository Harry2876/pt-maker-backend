import { Readable } from 'stream';
import { BaseService } from './baseService';
import { r2Service } from './cloudflareR2Service';
import { ServiceError } from '../utils/serviceError';
import { storedFileService } from './storedFileService';
import { issueClientPreview } from '../utils/previewUrlUtils';
import { ensureCompressedPreviewInR2, previewWebpKeyFromOriginalR2Key } from '../utils/imagePreviewUtils';
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

const PREVIEW_METADATA_FLAG = 'isCompressedPreview';

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

        const previewAssetId = await this.ensurePreviewAssetForOriginal(file.id, {
            userId: input.userId,
            assetType: input.assetType,
            originalR2Key: file.r2Key,
            quickMatchId: input.quickMatchId ?? null,
            quickSeriesId: input.quickSeriesId ?? null,
            filename: input.filename ?? null,
            existingMetadata: file.metadata,
        });

        return this.toDualMediaAssetPreview(file.id, previewAssetId);
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

        const items = await Promise.all(
            assets
                .filter(a => !(a.metadata as Record<string, unknown> | null)?.[PREVIEW_METADATA_FLAG])
                .map(async (a) => ({
                    ...(await this.previewForAssetId(a.id)),
                    assetType: a.assetType as QuickMediaAssetType,
                    filename: a.filename,
                    metadata: (a.metadata as Record<string, unknown>) ?? null,
                    createdAt: a.createdAt.toISOString(),
                })),
        );

        return items;
    }

    async previewForAssetId(assetId: string): Promise<MediaAssetPreview> {
        const file = await storedFileService.findById(assetId);
        if (!file) {
            throw new ServiceError('Media asset not found', 404, 'NOT_FOUND');
        }

        const previewAssetId =
            (file.metadata?.previewAssetId as string | undefined) ??
            (await this.findLinkedPreviewAssetId(file.assetType, file.r2Key));

        return this.toDualMediaAssetPreview(file.id, previewAssetId);
    }

    private async ensurePreviewAssetForOriginal(
        originalAssetId: string,
        input: {
            userId: string;
            assetType: QuickMediaAssetType;
            originalR2Key: string;
            quickMatchId: string | null;
            quickSeriesId: string | null;
            filename: string | null;
            existingMetadata: Record<string, unknown> | null;
        },
    ): Promise<string | undefined> {
        const existingPreviewId = input.existingMetadata?.previewAssetId as string | undefined;
        if (existingPreviewId) {
            return existingPreviewId;
        }

        try {
            const previewR2Key = await ensureCompressedPreviewInR2(input.originalR2Key);

            let previewFile = await storedFileService.findByResource(input.assetType, previewR2Key);
            if (!previewFile) {
                previewFile = await storedFileService.register({
                    userId: input.userId,
                    assetType: input.assetType,
                    r2Key: previewR2Key,
                    resourceId: previewR2Key,
                    quickMatchId: input.quickMatchId,
                    quickSeriesId: input.quickSeriesId,
                    mimeType: 'image/webp',
                    filename: input.filename?.replace(/\.(png|jpe?g)$/i, '.webp') ?? null,
                    metadata: {
                        [PREVIEW_METADATA_FLAG]: true,
                        originalAssetId: originalAssetId,
                    },
                });
            }

            await this.db.quickMediaAsset.update({
                where: { id: originalAssetId },
                data: {
                    metadata: {
                        ...(input.existingMetadata ?? {}),
                        previewAssetId: previewFile.id,
                        previewR2Key,
                    },
                },
            });

            return previewFile.id;
        } catch (error) {
            this.logger.warn(
                `Compressed preview generation failed for ${input.originalR2Key} — falling back to original for display`,
                error,
            );
            return undefined;
        }
    }

    private async findLinkedPreviewAssetId(
        assetType: QuickMediaAssetType,
        originalR2Key: string,
    ): Promise<string | undefined> {
        const previewR2Key = previewWebpKeyFromOriginalR2Key(originalR2Key);
        const previewFile = await storedFileService.findByResource(assetType, previewR2Key);
        return previewFile?.id;
    }

    private toDualMediaAssetPreview(originalFileId: string, previewFileId?: string): MediaAssetPreview {
        const original = issueClientPreview(originalFileId);

        if (!previewFileId || previewFileId === originalFileId) {
            return {
                assetId: originalFileId,
                previewUrl: original.previewUrl,
                signedUrl: original.signedUrl,
                expiresAt: original.expiresAt,
                previewUrlExpiresInSeconds: original.previewUrlExpiresInSeconds,
            };
        }

        const compressed = issueClientPreview(previewFileId);

        return {
            assetId: originalFileId,
            previewUrl: compressed.previewUrl,
            signedUrl: original.previewUrl,
            expiresAt: compressed.expiresAt,
            previewUrlExpiresInSeconds: compressed.previewUrlExpiresInSeconds,
        };
    }
}

export const mediaAssetService = new MediaAssetService();
