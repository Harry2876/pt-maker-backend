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
    tournamentId?: string;
    metadata?: any;
}

export interface CropStorageResponse {
    success: boolean;
    crops: {
        attendance: Array<{
            id: string;
            cropType: string;
            signedUrl: string | null;
            expiresAt: Date | null;
            cropMetadata: any;
            status: string;
        }>;
        result: Array<{
            id: string;
            cropType: string;
            signedUrl: string | null;
            expiresAt: Date | null;
            cropMetadata: any;
            status: string;
        }>;
        all: Array<{
            id: string;
            cropType: string;
            signedUrl: string | null;
            expiresAt: Date | null;
            cropMetadata: any;
            status: string;
        }>;
    };
    totalCrops: number;
    attendanceCount: number;
    resultCount: number;
}