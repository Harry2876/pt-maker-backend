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
            // Call Python API to generate crops using specific endpoint
            const cropResponse = request.cropType?.toLowerCase() === 'attendance' 
                ? await pythonAIService.generateAttendanceCrops(
                    request.screenshotUrl,
                    request.quickMatchId,
                    request.tournamentId,
                    request.metadata
                )
                : await pythonAIService.generateResultCrops(
                    request.screenshotUrl,
                    request.quickMatchId,
                    request.tournamentId,
                    request.metadata
                );

            // Handle Python AI response structure
            let crops = [];
            if (cropResponse && cropResponse.status === 'success') {
                const cropsGenerated = cropResponse.data?.crops_generated || 0;
                this.logger.info(`Python AI generated ${cropsGenerated} crops from ${request.screenshotUrl}`);
                
                // IMPORTANT: Python AI processes images but doesn't upload to R2
                // We need to handle crops differently based on whether URLs are provided
                if (cropsGenerated > 0) {
                    const cropType = cropResponse.data?.crop_type || request.cropType || 'result';
                    const r2Folder = cropResponse.data?.r2_folder || `crops/${cropType}/match_${Date.now()}/`;
                    
// Extract actual crop URLs from crops array
                const actualCropUrls = cropResponse.crops?.map((crop: any) => crop.r2_url) || [];
                
                for (let i = 0; i < cropsGenerated; i++) {
                    const cropNumber = i + 1;
                    const cropFilename = `card_${cropNumber.toString().padStart(2, '0')}_team_${cropNumber.toString().padStart(2, '0')}.jpg`;
                    
                    // Only use actual crop URLs if they exist in Python AI response
                        let fullCropUrl;
                        if (actualCropUrls.length > 0 && actualCropUrls[i]) {
                            // Use actual URL provided by Python AI
                            fullCropUrl = actualCropUrls[i];
                        } else {
                            // Mark as placeholder - file doesn't exist yet
                            fullCropUrl = `pending_upload_${r2Folder}${cropFilename}`;
                            this.logger.warn(`Crop ${cropNumber} marked as pending - no actual URL provided by Python AI`);
                        }
                        
                        crops.push({
                            crop_index: cropNumber,
                            crop_url: fullCropUrl,
                            metadata: {
                                ...cropResponse.data,
                                crop_number: cropNumber,
                                r2_folder: cropResponse.data?.r2_folder,
                                processing_time_seconds: cropResponse.data?.processing_time_seconds,
                                crop_filename: cropFilename,
                                upload_status: actualCropUrls.length > 0 ? 'uploaded' : 'pending'
                            },
                            type: cropType
                        });
                    }
                } else {
                    this.logger.warn(`No crops generated for ${request.screenshotUrl}`);
                }
            } else if (cropResponse && cropResponse.crops && Array.isArray(cropResponse.crops)) {
                // Use crops array directly from Python API response
                crops = cropResponse.crops.map((crop: any, index: number) => ({
                    crop_index: crop.card_index || (index + 1),
                    crop_url: crop.r2_url,
                    r2Key: crop.r2_url ? this.extractR2Key(crop.r2_url) : `placeholder_key_${Date.now()}_${index + 1}`,
                    metadata: {
                        crop_number: crop.card_index || (index + 1),
                        team_name: crop.team_name,
                        coordinates: crop.coordinates,
                        confidence: crop.confidence,
                        upload_status: crop.r2_url ? 'uploaded' : 'pending'
                    },
                    type: cropResponse.data?.crop_type || request.cropType || 'result'
                }));
            } else if (cropResponse && cropResponse.data && cropResponse.data.crops && Array.isArray(cropResponse.data.crops)) {
                crops = cropResponse.data.crops;
            }

            if (crops.length === 0) {
                this.logger.warn(`No crops available for processing from: ${request.screenshotUrl}`);
                // Return success but with empty crops
                return {
                    success: true,
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

            const savedCrops = [];

            // Store crop metadata for each generated crop
            for (const crop of crops) {
                const cropData: CreateQuickCropData = {
                    quickMatchId: request.quickMatchId,
                    originalUrl: request.screenshotUrl,
                    cropUrl: (crop as any).crop_url || `generated_crop_${(crop as any).crop_index || 1}`,
                    r2Key: (crop as any).r2Key || ((crop as any).crop_url && !(crop as any).crop_url.startsWith('pending_upload_') ? this.extractR2Key((crop as any).crop_url) : `placeholder_key_${Date.now()}_${(crop as any).crop_index || 1}`),
                    cropData: (crop as any).metadata || (crop as any).data || crop,
                    cropType: (crop as any).type || request.cropType || 'result',
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                };

                const savedCrop = await this.createCrop(cropData);
                savedCrops.push(savedCrop);
            }

            // Generate signed URLs for each crop and organize by type
            const attendanceCrops = [];
            const resultCrops = [];

            for (const crop of savedCrops) {
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
                totalCrops: savedCrops.length,
                attendanceCount: attendanceCrops.length,
                resultCount: resultCrops.length
            };

        } catch (error) {
            this.handleError(error, 'Process Crops');
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
     */
    private async autoProcessMatchScreenshots(quickMatchId: string): Promise<void> {
        try {
            // Get all unprocessed screenshots for this match
            const unprocessedScreenshots = await this.db.quickScreenshot.findMany({
                where: {
                    quickMatchId,
                    isProcessed: false
                },
                orderBy: {
                    uploadedAt: 'asc'
                }
            });

            if (unprocessedScreenshots.length === 0) {
                this.logger.info(`No unprocessed screenshots found for match: ${quickMatchId}`);
                return;
            }

            this.logger.info(`Auto-processing ${unprocessedScreenshots.length} screenshots for match: ${quickMatchId}`);

            // Process each screenshot
            const processingPromises = unprocessedScreenshots.map(async (screenshot: any) => {
                try {
                    const screenshotType = screenshot.type.toLowerCase(); // 'ATTENDANCE' -> 'attendance'
                    
                    // Generate crops via Python AI using specific endpoint with actual match ID
                    const cropResponse = screenshotType.toLowerCase() === 'attendance'
                        ? await pythonAIService.generateAttendanceCrops(
                            screenshot.storageUrl,
                            quickMatchId,
                            screenshot.quickMatch?.tournamentId || undefined,
                            {
                                week: 1,
                                day: 2,
                                session: "auto_processed",
                                uploaded_by: "system_auto"
                            }
                        )
                        : await pythonAIService.generateResultCrops(
                            screenshot.storageUrl,
                            quickMatchId,
                            screenshot.quickMatch?.tournamentId || undefined,
                            {
                                week: 1,
                                day: 2,
                                session: "auto_processed",
                                game_number: 1,
                                uploaded_by: "system_auto"
                            }
                        );

                    // Handle Python AI response structure
                    let crops = [];
                    if (cropResponse && cropResponse.status === 'success') {
                        const cropsGenerated = cropResponse.data?.crops_generated || 0;
                        this.logger.info(`Python AI generated ${cropsGenerated} crops from ${screenshot.storageUrl}`);
                        
                        if (cropsGenerated > 0) {
                            const cropType = cropResponse.data?.crop_type || screenshotType;
                            const r2Folder = cropResponse.data?.r2_folder || `crops/${cropType}/match_${Date.now()}/`;
                            
                            // Extract actual crop URLs from crops array
                            const actualCropUrls = cropResponse.crops?.map((crop: any) => crop.r2_url) || [];
                            
                            for (let i = 0; i < cropsGenerated; i++) {
                                const cropNumber = i + 1;
                                const cropFilename = `card_${cropNumber.toString().padStart(2, '0')}_team_${cropNumber.toString().padStart(2, '0')}.jpg`;
                                
                                // Only use actual crop URLs if they exist in Python AI response
                                let fullCropUrl;
                                if (actualCropUrls.length > 0 && actualCropUrls[i]) {
                                    fullCropUrl = actualCropUrls[i];
                                } else {
                                    fullCropUrl = `pending_upload_${r2Folder}${cropFilename}`;
                                    this.logger.warn(`Auto-process crop ${cropNumber} marked as pending - no actual URL provided by Python AI`);
                                }
                                
                                crops.push({
                                    crop_index: cropNumber,
                                    crop_url: fullCropUrl,
                                    metadata: {
                                        ...cropResponse.data,
                                        crop_number: cropNumber,
                                        r2_folder: cropResponse.data?.r2_folder,
                                        processing_time_seconds: cropResponse.data?.processing_time_seconds,
                                        crop_filename: cropFilename,
                                        upload_status: actualCropUrls.length > 0 ? 'uploaded' : 'pending'
                                    },
                                    type: cropType
                                });
                            }
                        }
                    } else if (cropResponse && cropResponse.crops && Array.isArray(cropResponse.crops)) {
                        // Use crops array directly from Python API response
                        crops = cropResponse.crops.map((crop: any, index: number) => ({
                            crop_index: crop.card_index || (index + 1),
                            crop_url: crop.r2_url,
                            r2Key: crop.r2_url ? this.extractR2Key(crop.r2_url) : `placeholder_key_${Date.now()}_${index + 1}`,
                            metadata: {
                                crop_number: crop.card_index || (index + 1),
                                team_name: crop.team_name,
                                coordinates: crop.coordinates,
                                confidence: crop.confidence,
                                upload_status: crop.r2_url ? 'uploaded' : 'pending'
                            },
                            type: cropResponse.data?.crop_type || screenshotType
                        }));
                    } else if (cropResponse && cropResponse.data && cropResponse.data.crops && Array.isArray(cropResponse.data.crops)) {
                        crops = cropResponse.data.crops;
                    }

                    if (crops.length > 0) {
                        // Store crop metadata for each generated crop
                        for (const crop of crops) {
                            const cropData: CreateQuickCropData = {
                                quickMatchId,
                                originalUrl: screenshot.storageUrl,
                                cropUrl: (crop as any).crop_url || `generated_crop_${(crop as any).crop_index || 1}`,
                                r2Key: (crop as any).r2Key || ((crop as any).crop_url && !(crop as any).crop_url.startsWith('pending_upload_') ? this.extractR2Key((crop as any).crop_url) : `placeholder_key_${Date.now()}_${(crop as any).crop_index || 1}`),
                                cropData: (crop as any).metadata || (crop as any).data || crop,
                                cropType: (crop as any).type || screenshotType,
                                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                            };

                            await this.createCrop(cropData);
                        }

                        // Mark screenshot as processed
                        await this.db.quickScreenshot.update({
                            where: { id: screenshot.id },
                            data: { isProcessed: true }
                        });

                        this.logger.info(`✅ Processed screenshot ${screenshot.id} - Generated ${crops.length} crops`);
                    } else {
                        this.logger.warn(`⚠️ No crops generated for screenshot ${screenshot.id}`);
                    }
                } catch (error) {
                    this.logger.error(`❌ Failed to process screenshot ${screenshot.id}:`, error);
                }
            });

            // Process all screenshots in parallel (but limit concurrency)
            const batchSize = 3; // Process 3 screenshots at a time
            for (let i = 0; i < processingPromises.length; i += batchSize) {
                const batch = processingPromises.slice(i, i + batchSize);
                await Promise.all(batch);
            }

            // Invalidate cache after processing
            await redis.delete(`crops:match:${quickMatchId}`);

        } catch (error) {
            this.logger.error(`Failed to auto-process screenshots for match ${quickMatchId}:`, error);
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