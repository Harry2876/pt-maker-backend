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