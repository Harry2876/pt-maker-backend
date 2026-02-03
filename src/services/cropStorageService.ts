import { BaseService } from './baseService';
import redis from '../config/redis';
import { r2Service } from './cloudflareR2Service';
import { pythonAIService } from './pythonAIService';
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
        try {
            // Call Python API to generate crops
            const cropResponse = await pythonAIService.generateCrops(
                request.screenshotUrl,
                request.cropType
            );

            if (!cropResponse.success || !cropResponse.crops) {
                throw new Error('Python API failed to generate crops');
            }

            const savedCrops = [];

            // Store crop metadata for each generated crop
            for (const crop of cropResponse.crops) {
                const cropData: CreateQuickCropData = {
                    quickMatchId: request.quickMatchId,
                    originalUrl: request.screenshotUrl,
                    cropUrl: crop.crop_url,
                    r2Key: this.extractR2Key(crop.crop_url),
                    cropData: crop.metadata,
                    cropType: crop.type,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                };

                const savedCrop = await this.createCrop(cropData);
                savedCrops.push(savedCrop);
            }

            // Generate signed URLs for each crop
            const cropsWithSignedUrls = await Promise.all(
                savedCrops.map(async (crop) => {
                    const signedUrlData = await signedUrlUtility.generateSignedUrl(
                        crop.r2Key, 
                        { expiryMinutes: 30 }
                    );
                    return {
                        id: crop.id,
                        cropType: crop.cropType,
                        signedUrl: signedUrlData.signedUrl,
                        expiresAt: signedUrlData.expiresAt,
                        cropMetadata: crop.cropData
                    };
                })
            );

            return {
                success: true,
                crops: cropsWithSignedUrls,
                totalCrops: cropsWithSignedUrls.length
            };

        } catch (error) {
            this.handleError(error, 'Process Crops');
            return {
                success: false,
                crops: [],
                totalCrops: 0
            };
        }
    }

    /**
     * Get crops for a match with signed URLs
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

            const cacheKey = `crops:match:${quickMatchId}`;
            let crops = await redis.hgetObject<QuickCropCache[]>(cacheKey);

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

                await redis.hsetObject(cacheKey, crops, this.CACHE_TTL);
            }

            // Generate fresh signed URLs
            const cropsWithSignedUrls = await Promise.all(
                crops.map(async (crop) => {
                    const signedUrlData = await signedUrlUtility.generateSignedUrl(
                        crop.r2Key, 
                        { expiryMinutes: 30 }
                    );
                    return {
                        id: crop.id,
                        cropType: crop.cropType,
                        signedUrl: signedUrlData.signedUrl,
                        expiresAt: signedUrlData.expiresAt,
                        cropMetadata: crop.cropData
                    };
                })
            );

            return {
                success: true,
                crops: cropsWithSignedUrls,
                totalCrops: cropsWithSignedUrls.length
            };

        } catch (error) {
            this.handleError(error, 'Get Match Crops');
            return {
                success: false,
                crops: [],
                totalCrops: 0
            };
        }
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
        await redis.hsetObject(cacheKey, crop, this.CACHE_TTL);

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
        return url.pathname.substring(1); // Remove leading slash
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
            let crop = await redis.hgetObject<QuickCropCache>(`crop:${cropId}`);
            
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

            const signedUrlData = await signedUrlUtility.generateSignedUrl(
                crop.r2Key, 
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