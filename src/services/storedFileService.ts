import { Readable } from 'stream';
import { BaseService } from './baseService';
import { ServiceError } from '../utils/serviceError';
import { extractR2KeyFromUrl } from '../utils/r2UrlUtils';
import { r2Service } from './cloudflareR2Service';
import { issueClientPreview } from '../utils/previewUrlUtils';
import { ClientPreviewFields } from '../types/previewUrl';
import {
    QuickMediaAssetType,
    RegisterStoredFileInput,
    StoredFileRecord,
    StoredFileStreamResult,
} from '../types/mediaAsset';

export class StoredFileService extends BaseService {

    async register(input: RegisterStoredFileInput): Promise<StoredFileRecord> {
        const r2Key = input.r2Key?.trim();
        if (!r2Key) {
            throw new ServiceError('r2Key is required', 400, 'INVALID_R2_KEY');
        }

        // Optional dedupe: same resource → return existing
        if (input.resourceId) {
            const existing = await this.findByResource(input.assetType, input.resourceId);
            if (existing) {
                return existing;
            }
        }

        const row = await this.db.quickMediaAsset.create({
            data: {
                userId: input.userId ?? null,
                quickMatchId: input.quickMatchId ?? null,
                quickSeriesId: input.quickSeriesId ?? null,
                assetType: input.assetType,
                r2Key,
                mimeType: input.mimeType ?? 'image/png',
                filename: input.filename ?? null,
                resourceId: input.resourceId ?? null,
                isPublic: input.isPublic ?? false,
                metadata: input.metadata
                    ? JSON.parse(JSON.stringify(input.metadata))
                    : undefined,
            },
        });

        this.logger.info(`Stored file registered: ${row.id} type=${row.assetType} r2Key=${r2Key}`);
        return this.toRecord(row);
    }

    async registerFromRawUrl(
        input: Omit<RegisterStoredFileInput, 'r2Key'> & { rawUrl: string },
    ): Promise<StoredFileRecord> {
        const r2Key = extractR2KeyFromUrl(input.rawUrl);
        const { rawUrl: _raw, ...rest } = input;
        return this.register({ ...rest, r2Key });
    }

    /** Register (or dedupe by resourceId) and issue a client-facing signed preview URL. */
    async ensureClientPreview(
        input: RegisterStoredFileInput,
        options?: { expiryMinutes?: number },
    ): Promise<ClientPreviewFields> {
        const file = await this.register(input);
        return issueClientPreview(file.id, options);
    }

    async findById(fileId: string): Promise<StoredFileRecord | null> {
        const row = await this.db.quickMediaAsset.findUnique({
            where: { id: fileId.trim() },
        });
        return row ? this.toRecord(row) : null;
    }

    async findByResource(
        assetType: QuickMediaAssetType,
        resourceId: string,
    ): Promise<StoredFileRecord | null> {
        const row = await this.db.quickMediaAsset.findFirst({
            where: { assetType, resourceId },
            orderBy: { createdAt: 'desc' },
        });
        return row ? this.toRecord(row) : null;
    }

    async findByR2Key(userId: string, r2Key: string): Promise<StoredFileRecord | null> {
        const row = await this.db.quickMediaAsset.findFirst({
            where: { userId, r2Key },
            orderBy: { createdAt: 'desc' },
        });
        return row ? this.toRecord(row) : null;
    }

    /**
     * Step 3 stream handler uses this when request has Bearer token (no sig).
     */
    async assertReadable(fileId: string, userId: string): Promise<StoredFileRecord> {
        const file = await this.findById(fileId);
        if (!file) {
            throw new ServiceError('File not found', 404, 'NOT_FOUND');
        }
        if (file.isPublic) {
            return file;
        }
        if (!file.userId || file.userId !== userId) {
            throw new ServiceError('File not found or access denied', 404, 'NOT_FOUND');
        }
        return file;
    }

    /**
     * Step 3 stream handler uses this when request has valid exp+sig (no user).
     */
    async getReadableBySignature(fileId: string): Promise<StoredFileRecord> {
        const file = await this.findById(fileId);
        if (!file) {
            throw new ServiceError('File not found', 404, 'NOT_FOUND');
        }
        return file;
    }

    async streamFileRecord(file: StoredFileRecord): Promise<StoredFileStreamResult> {
        const { body, contentType } = await r2Service.getObjectStream(file.r2Key);
        const safeName = (file.filename ?? `${file.assetType.toLowerCase()}.bin`)
            .replace(/"/g, '');

        return {
            stream: body as Readable,
            contentType: contentType || file.mimeType || 'application/octet-stream',
            filename: safeName,
        };
    }

    private toRecord(row: {
        id: string;
        userId: string | null;
        quickMatchId: string | null;
        quickSeriesId: string | null;
        assetType: string;
        r2Key: string;
        mimeType: string;
        filename: string | null;
        resourceId: string | null;
        isPublic: boolean;
        metadata: unknown;
        createdAt: Date;
    }): StoredFileRecord {
        return {
            id: row.id,
            userId: row.userId,
            quickMatchId: row.quickMatchId,
            quickSeriesId: row.quickSeriesId,
            assetType: row.assetType as QuickMediaAssetType,
            r2Key: row.r2Key,
            mimeType: row.mimeType,
            filename: row.filename,
            resourceId: row.resourceId,
            isPublic: row.isPublic,
            metadata: (row.metadata as Record<string, unknown>) ?? null,
            createdAt: row.createdAt.toISOString(),
        };
    }
}

export const storedFileService = new StoredFileService();