export type QuickMediaAssetType =
    | 'STANDINGS'
    | 'SLOT_LIST'
    | 'ROSTER'
    | 'TOP_10'
    | 'SERIES_STANDINGS';

export interface MediaAssetPreview {
    assetId: string;
    previewUrl: string;
}

export interface MediaAssetListItem {
    assetId: string;
    previewUrl: string;
    assetType: QuickMediaAssetType;
    filename?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
}
