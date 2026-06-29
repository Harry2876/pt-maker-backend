export type QuickMediaAssetType =
    | 'STANDINGS'
    | 'SLOT_LIST'
    | 'ROSTER'
    | 'TOP_10'
    | 'SERIES_STANDINGS'
    | 'SCREENSHOT'
    | 'CROP'
    | 'TEMPLATE'
    | 'TEMPLATE_CONFIG'
    | 'LOGO'
    | 'EXCEL';

/** DB row shape used internally by storedFileService */
export interface StoredFileRecord {
    id: string;
    userId: string | null;
    quickMatchId: string | null;
    quickSeriesId: string | null;
    assetType: QuickMediaAssetType;
    r2Key: string;
    mimeType: string;
    filename: string | null;
    resourceId: string | null;
    isPublic: boolean;
    metadata: Record<string, unknown> | null;
    createdAt: string;
}

export interface StoredFileStreamResult {
    stream: NodeJS.ReadableStream;
    contentType: string;
    filename: string;
}

export interface RegisterStoredFileInput {
    userId?: string | null;
    assetType: QuickMediaAssetType;
    r2Key: string;
    mimeType?: string;
    filename?: string | null;
    resourceId?: string | null;
    isPublic?: boolean;
    quickMatchId?: string | null;
    quickSeriesId?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface MediaAssetPreview {
    assetId: string;
    previewUrl: string;
    signedUrl: string;
    expiresAt: string;
    previewUrlExpiresInSeconds: number;
}

export interface MediaAssetListItem extends MediaAssetPreview {
    assetType: QuickMediaAssetType;
    filename?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}