export interface QuickCropCache {
    id: string;
    quickMatchId: string;
    originalUrl: string;
    cropUrl: string;
    r2Key: string;
    cropData: any;
    cropType: string;
    isActive: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateQuickCropData {
    quickMatchId: string;
    originalUrl: string;
    cropUrl: string;
    r2Key: string;
    cropData: any;
    cropType: string;
    expiresAt?: Date;
}

export interface CropStorageRequest {
    quickMatchId: string;
    screenshotUrl: string;
    cropType?: string;
}

export interface CropStorageResponse {
    success: boolean;
    crops: Array<{
        id: string;
        cropType: string;
        signedUrl: string;
        expiresAt: Date;
        cropMetadata: any;
    }>;
    totalCrops: number;
}