import { BaseService } from './baseService';
import redis from '../config/redis';
import { r2Service } from './cloudflareR2Service';
import { signedUrlUtility } from './signedUrlUtility';
import { randomUUID } from 'crypto';
import {
    QuickCropCache,
    CreateQuickCropData,
    CropStorageRequest,
    CropStorageResponse
} from '../types/quickCrop';

export class CropStorageService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Process crops via Python API and store metadata
     */
    async processCrops(request: CropStorageRequest): Promise<CropStorageResponse> {
        // TODO: Re-implement with new Python API endpoint
        throw new Error('Not implemented: pending new Python API integration');
    }

    /**
     * Get crops for a match with signed URLs - automatically processes screenshots if needed
     */
    async getMatchCrops(
        quickMatchId: string, 
        userId: string
    ): Promise<CropStorageResponse> {
        try {
            // Verify match ownership
            const hasAccess = await this.verifyMatchAccess(quickMatchId, userId);
            if (!hasAccess) {
                throw new Error('Access denied to match crops');
            }

            // STEP 1: Auto-process any unprocessed screenshots first
            await this.autoProcessMatchScreenshots(quickMatchId);

            // STEP 2: Get existing crops from cache/database
            const cacheKey = `crops:match:${quickMatchId}`;
            let crops = await redis.getObject<QuickCropCache[]>(cacheKey);

            if (!crops) {
                crops = await this.db.quickMatchCrop.findMany({
                    where: {
                        quickMatchId,
                        isActive: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                await redis.setObject(cacheKey, crops, this.CACHE_TTL);
            }

            // STEP 3: Generate fresh signed URLs and organize by type
            const attendanceCrops = [];
            const resultCrops = [];

            for (const crop of crops) {
                let signedUrl = null;
                let expiresAt = null;
                
                // Generate signed URLs for real R2 keys (both existing and newly constructed ones)
                if (crop.r2Key && !crop.r2Key.startsWith('placeholder_key_')) {
                    try {
                        // Clean r2Key of bucket prefix if it exists (for backward compatibility)
                        let cleanR2Key = crop.r2Key;
                        if (cleanR2Key.startsWith('pt-maker-screenshots/')) {
                            cleanR2Key = cleanR2Key.substring('pt-maker-screenshots/'.length);
                        }
                        
                        const signedUrlData = await signedUrlUtility.generateSignedUrl(
                            cleanR2Key, 
                            { expiryMinutes: 30 }
                        );
                        signedUrl = signedUrlData.signedUrl;
                        expiresAt = signedUrlData.expiresAt;
                    } catch (error) {
                        this.logger.warn(`Failed to generate signed URL for crop ${crop.id}:`, error);
                    }
                }

                const uploadStatus = crop.cropData?.upload_status || 'unknown';
                const cropData = {
                    id: crop.id,
                    cropType: crop.cropType,
                    signedUrl: signedUrl || null,
                    expiresAt: expiresAt || null,
                    cropMetadata: crop.cropData,
                    status: signedUrl ? 'ready' : (uploadStatus === 'pending' ? 'pending_upload' : 'processing')
                };

                if (crop.cropType.toLowerCase().includes('attendance')) {
                    attendanceCrops.push(cropData);
                } else {
                    resultCrops.push(cropData);
                }
            }

            return {
                success: true,
                crops: {
                    attendance: attendanceCrops,
                    result: resultCrops,
                    all: [...attendanceCrops, ...resultCrops]
                },
                totalCrops: crops.length,
                attendanceCount: attendanceCrops.length,
                resultCount: resultCrops.length
            };

        } catch (error) {
            this.handleError(error, 'Get Match Crops');
            return {
                success: false,
                crops: {
                    attendance: [],
                    result: [],
                    all: []
                },
                totalCrops: 0,
                attendanceCount: 0,
                resultCount: 0
            };
        }
    }

    /**
     * Auto-process all unprocessed screenshots for a match
     * TODO: Re-implement with new Python API endpoint
     */
    private async autoProcessMatchScreenshots(_quickMatchId: string): Promise<void> {
        throw new Error('Not implemented: pending new Python API integration');
    }

    /**
     * Create crop metadata record
     */
    private async createCrop(data: CreateQuickCropData): Promise<QuickCropCache> {
        const crop = await this.db.quickMatchCrop.create({
            data
        });

        // Cache the crop
        const cacheKey = `crop:${crop.id}`;
        await redis.setObject(cacheKey, crop, this.CACHE_TTL);

        // Invalidate match crops cache
        await redis.delete(`crops:match:${data.quickMatchId}`);

        return crop;
    }

    /**
     * Verify user has access to match crops
     */
    private async verifyMatchAccess(quickMatchId: string, userId: string): Promise<boolean> {
        const match = await this.db.quickMatch.findFirst({
            where: {
                id: quickMatchId,
                userId
            }
        });

        return !!match;
    }

    /**
     * Extract R2 key from crop URL
     */
    private extractR2Key(cropUrl: string): string {
        const url = new URL(cropUrl);
        let key = url.pathname.substring(1); // Remove leading slash
        
        // Remove bucket name prefix if it exists (Python AI includes full bucket path)
        if (key.startsWith('pt-maker-screenshots/')) {
            key = key.substring('pt-maker-screenshots/'.length);
        }
        
        return key;
    }

    /**
     * Get bulk download URLs for all crops in a match organized by category
     */
    async getBulkCropDownloadUrls(
        quickMatchId: string, 
        userId: string
    ): Promise<{
        success: boolean;
        downloads: {
            attendance: Array<{
                id: string;
                cropType: string;
                downloadUrl: string;
                expiresAt: Date;
                filename: string;
                cropMetadata: any;
            }>;
            result: Array<{
                id: string;
                cropType: string;
                downloadUrl: string;
                expiresAt: Date;
                filename: string;
                cropMetadata: any;
            }>;
            all: Array<{
                id: string;
                cropType: string;
                downloadUrl: string;
                expiresAt: Date;
                filename: string;
                cropMetadata: any;
            }>;
        };
        totalCrops: number;
        attendanceCount: number;
        resultCount: number;
    }> {
        try {
            // Verify match ownership
            const hasAccess = await this.verifyMatchAccess(quickMatchId, userId);
            if (!hasAccess) {
                throw new Error('Access denied to match crops');
            }

            // STEP 1: Auto-process any unprocessed screenshots first
            await this.autoProcessMatchScreenshots(quickMatchId);

            // STEP 2: Get existing crops from cache/database
            const cacheKey = `crops:match:${quickMatchId}`;
            let crops = await redis.getObject<QuickCropCache[]>(cacheKey);

            if (!crops) {
                crops = await this.db.quickMatchCrop.findMany({
                    where: {
                        quickMatchId,
                        isActive: true
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                await redis.setObject(cacheKey, crops, this.CACHE_TTL);
            }

            // STEP 3: Generate download URLs and organize by type
            const attendanceDownloads = [];
            const resultDownloads = [];

            for (const crop of crops) {
                // Only generate signed URLs for real R2 keys, not placeholders
                if (crop.r2Key && !crop.r2Key.startsWith('placeholder_key_')) {
                    const signedUrlData = await signedUrlUtility.generateSignedUrl(
                        crop.r2Key, 
                        { expiryMinutes: 30 }
                    );

                    // Generate a clean filename for download
                    const fileExtension = crop.r2Key.split('.').pop() || 'jpg';
                    const filename = `${crop.cropType}_${crop.id.substring(0, 8)}.${fileExtension}`;

                    const downloadData = {
                        id: crop.id,
                        cropType: crop.cropType,
                        downloadUrl: signedUrlData.signedUrl,
                        expiresAt: signedUrlData.expiresAt,
                        filename: filename,
                        cropMetadata: crop.cropData
                    };

                    if (crop.cropType.toLowerCase().includes('attendance')) {
                        attendanceDownloads.push(downloadData);
                    } else {
                        resultDownloads.push(downloadData);
                    }
                }
            }

            return {
                success: true,
                downloads: {
                    attendance: attendanceDownloads,
                    result: resultDownloads,
                    all: [...attendanceDownloads, ...resultDownloads]
                },
                totalCrops: crops.length,
                attendanceCount: attendanceDownloads.length,
                resultCount: resultDownloads.length
            };

        } catch (error) {
            this.handleError(error, 'Get Bulk Crop Download URLs');
            return {
                success: false,
                downloads: {
                    attendance: [],
                    result: [],
                    all: []
                },
                totalCrops: 0,
                attendanceCount: 0,
                resultCount: 0
            };
        }
    }

    /**
     * Generate signed URL for a specific crop
     */
    async generateCropSignedUrl(
        cropId: string,
        userId: string
    ): Promise<{ success: boolean; signedUrl?: string; expiresAt?: Date; cropId?: string }> {
        try {
            // Get crop from cache first
            let crop = await redis.getObject<QuickCropCache>(`crop:${cropId}`);
            
            if (!crop) {
                // Get from database
                crop = await this.db.quickMatchCrop.findFirst({
                    where: {
                        id: cropId,
                        isActive: true
                    }
                });
                
                if (!crop) {
                    return { success: false };
                }
            }

            // Verify match ownership
            const hasAccess = await this.verifyMatchAccess(crop.quickMatchId, userId);
            if (!hasAccess) {
                return { success: false };
            }

            // Only generate signed URLs for real R2 keys, not placeholders
            if (!crop.r2Key || crop.r2Key.startsWith('placeholder_key_')) {
                return { success: false }; // Crop not ready yet
            }

            // Clean r2Key of bucket prefix if it exists (for backward compatibility)
            let cleanR2Key = crop.r2Key;
            if (cleanR2Key.startsWith('pt-maker-screenshots/')) {
                cleanR2Key = cleanR2Key.substring('pt-maker-screenshots/'.length);
            }

            const signedUrlData = await signedUrlUtility.generateSignedUrl(
                cleanR2Key, 
                { expiryMinutes: 30 }
            );

            return {
                success: true,
                cropId: crop.id,
                signedUrl: signedUrlData.signedUrl,
                expiresAt: signedUrlData.expiresAt
            };

        } catch (error) {
            this.handleError(error, 'Generate Crop Signed URL');
            return { success: false };
        }
    }
}

export const cropStorageService = new CropStorageService();