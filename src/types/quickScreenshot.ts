export interface QuickScreenshotCache {
    id: string;
    quickMatchId: string;
    originalName: string;
    fileName: string;
    storageUrl: string;
    type: QuickScreenshotType;
    pageNumber?: number;
    isProcessed: boolean;
    uploadedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateQuickScreenshotData {
    originalName: string;
    fileName: string;
    storageUrl: string;
    type: QuickScreenshotType;
    pageNumber?: number;
}

export type QuickScreenshotType = 
    | 'ATTENDANCE'
    | 'RESULT';

// File upload response
export interface ScreenshotUploadResponse {
    id: string;
    fileName: string;
    storageUrl: string;
    type: QuickScreenshotType;
    uploadedAt: string;
}

export interface QuickScreenshotWithPreview {
    id: string;
    quickMatchId: string;
    originalName: string;
    fileName: string;
    storageUrl: string;
    type: string;
    pageNumber?: number;
    isProcessed: boolean;
    uploadedAt: string;
    dbStatus?: string;
    r2Key: string | null;
    previewUrl: string | null;
    signedUrl: string | null;
    expiresAt: string | null;
    previewUrlExpiresInSeconds: number;
}

export interface QuickScreenshotListResponse {
    screenshots: QuickScreenshotWithPreview[];
    attendance: QuickScreenshotWithPreview[];
    result: QuickScreenshotWithPreview[];
    count: {
        total: number;
        attendance: number;
        result: number;
    };
}