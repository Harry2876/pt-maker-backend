import { BaseService } from './baseService';
import redis from '../config/redis';
import { storedFileService } from './storedFileService';
import { randomUUID } from 'crypto';
import {
    QuickCropCache,
    CreateQuickCropData,
    CropStorageRequest,
    CropStorageResponse
} from '../types/quickCrop';
import { pythonAIService } from './pythonAIService';
import { unifiedScreenshotService } from './unifiedScreenshotService';
import {
    buildCropFolderPathFromObjectKey,
    buildCropFolderPathFromStorageUrl,
    buildQuickPtScreenshotFolderPath,
    mimeTypeFromR2Key,
    resolvePythonImageRef,
} from '../utils/r2UrlUtils';
import {
    CropUploadRequest,
    CropUploadResponse,
    getCropItemsFromResponse,
} from '../types/pythonAI';

export class CropStorageService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    private cleanCropR2Key(r2Key: string): string {
        if (r2Key.startsWith('pt-maker-screenshots/')) {
            return r2Key.substring('pt-maker-screenshots/'.length);
        }
        return r2Key;
    }

    private async previewForCrop(
        crop: Pick<QuickCropCache, 'id' | 'quickMatchId' | 'r2Key'>,
        userId: string,
    ): Promise<{ signedUrl: string | null; expiresAt: Date | null }> {
        if (!crop.r2Key || crop.r2Key.startsWith('placeholder_key_')) {
            return { signedUrl: null, expiresAt: null };
        }

        const cleanR2Key = this.cleanCropR2Key(crop.r2Key);
        const preview = await storedFileService.ensureClientPreview({
            userId,
            assetType: 'CROP',
            r2Key: cleanR2Key,
            resourceId: crop.id,
            quickMatchId: crop.quickMatchId,
            mimeType: mimeTypeFromR2Key(cleanR2Key),
        });

        return {
            signedUrl: preview.previewUrl,
            expiresAt: new Date(preview.expiresAt),
        };
    }

    /**
     * Process crops via Python API and store metadata
     */
    async processCrops(request: CropStorageRequest): Promise<CropStorageResponse> {
        const { quickMatchId, screenshotUrl, cropType = 'ATTENDANCE' } = request;

        try {
            const isAttendance = cropType.toUpperCase().includes('ATTENDANCE');
            const typeLabel = isAttendance ? 'attendance' : 'result';

            this.logger.info(`Processing ${typeLabel} crop for match ${quickMatchId}`);

            const tournamentId = await this.resolveTournamentId(
                quickMatchId,
                request.tournamentId,
            );

            const pyRequest = this.buildCropUploadRequest(
                quickMatchId,
                isAttendance,
                [{ storageUrl: screenshotUrl }],
                { tournamentId, metadata: request.metadata },
            );

            const pyResponse = isAttendance
                ? await pythonAIService.uploadAttendanceCrops(pyRequest)
                : await pythonAIService.uploadResultCrops(pyRequest);

            if (pyResponse.status !== 'success') {
                throw new Error(`Python AI crop upload failed with status: ${pyResponse.status}`);
            }

            await this.persistPythonCrops(
                pyResponse,
                quickMatchId,
                cropType.toUpperCase().includes('ATTENDANCE') ? 'ATTENDANCE_CROP' : 'RESULT_CROP',
                screenshotUrl,
            );

            // Invalidate cache so getMatchCrops returns fresh data
            await redis.delete(`crops:match:${quickMatchId}`);

            return this.getMatchCrops(quickMatchId, request.metadata?.userId ?? '');

        } catch (error) {
            this.logger.error(`processCrops failed for match ${quickMatchId}:`, error);
            throw error;
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
            await this.autoProcessMatchScreenshots(quickMatchId, userId);

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

            const previews = await Promise.all(
                crops.map(crop =>
                    (crop.r2Key && !crop.r2Key.startsWith('placeholder_key_'))
                        ? this.previewForCrop(crop, userId).catch(error => {
                            this.logger.warn(`Failed to generate preview URL for crop ${crop.id}:`, error);
                            return { signedUrl: null, expiresAt: null };
                          })
                        : Promise.resolve({ signedUrl: null, expiresAt: null })
                )
            );

            for (let i = 0; i < crops.length; i++) {
                const crop = crops[i];
                const { signedUrl, expiresAt } = previews[i];
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
     * Auto-process all unprocessed screenshots for a match.
     * Batches attendance and result screenshots separately and uploads crops to R2.
     */
    private async autoProcessMatchScreenshots(quickMatchId: string, userId: string): Promise<void> {
        try {
            // Check if any crops already exist to avoid re-processing
            const existingCrops = await this.db.quickMatchCrop.count({
                where: { quickMatchId, isActive: true },
            });
            if (existingCrops > 0) return;

            // Fetch all screenshots — pass userId so ownership check passes
            const attendanceShots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'ATTENDANCE' }
            ).catch(() => []);

            const resultShots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'RESULT' }
            ).catch(() => []);

            const tournamentId = await this.resolveTournamentId(quickMatchId);

            const processGroup = async (
                shots: typeof attendanceShots,
                isAttendance: boolean
            ) => {
                if (shots.length === 0) return;

                const pyRequest = this.buildCropUploadRequest(
                    quickMatchId,
                    isAttendance,
                    shots.map(s => ({ storageUrl: s.storageUrl, fileName: s.fileName })),
                    { tournamentId },
                );

                const pyResponse = isAttendance
                    ? await pythonAIService.uploadAttendanceCrops(pyRequest)
                    : await pythonAIService.uploadResultCrops(pyRequest);

                if (pyResponse.status !== 'success') return;

                await this.persistPythonCrops(
                    pyResponse,
                    quickMatchId,
                    isAttendance ? 'ATTENDANCE_CROP' : 'RESULT_CROP',
                    shots[0]?.storageUrl ?? '',
                );
            };

            await Promise.allSettled([
                processGroup(attendanceShots, true),
                processGroup(resultShots, false),
            ]);

            await redis.delete(`crops:match:${quickMatchId}`);

        } catch (error) {
            this.logger.warn(`autoProcessMatchScreenshots failed for match ${quickMatchId}:`, error);
            // Non-critical: getMatchCrops will still return existing crops
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
     * Save crop rows from Python response (supports crops[] or legacy uploaded_urls[]).
     */
    private async persistPythonCrops(
        pyResponse: CropUploadResponse,
        quickMatchId: string,
        cropType: string,
        originalUrl: string,
    ): Promise<number> {
        const items = getCropItemsFromResponse(pyResponse);

        if (items.length === 0) {
            this.logger.warn('Python crop response contained no crop URLs', {
                quickMatchId,
                cropType,
                request_id: pyResponse.request_id,
            });
            return 0;
        }

        await Promise.all(
            items.map(item => {
                const rawUrl = item.r2_url;
                const r2Key = this.extractR2Key(rawUrl);
                return this.createCrop({
                    quickMatchId,
                    cropType,
                    r2Key,
                    originalUrl,
                    cropUrl: rawUrl,
                    cropData: {
                        upload_status: 'ready',
                        source_url: originalUrl,
                        card_index: item.card_index,
                        team_name: item.team_name,
                        coordinates: item.coordinates,
                        confidence: item.confidence,
                        python_data: pyResponse.data,
                        python_metadata: pyResponse.metadata,
                    },
                });
            })
        );

        this.logger.info(`Persisted ${items.length} ${cropType} crop(s) for match ${quickMatchId}`);
        return items.length;
    }

    /**
     * Resolve series id for Python tournament_id (quick-pt matches in a series).
     */
    private async resolveTournamentId(
        quickMatchId: string,
        explicit?: string,
    ): Promise<string | undefined> {
        if (explicit?.trim()) {
            return explicit.trim();
        }
        const link = await this.db.quickSeriesMatch.findFirst({
            where: { quickMatchId },
            select: { seriesId: true },
        });
        return link?.seriesId;
    }

    /**
     * Build Python crop request — image_urls plus folder context for R2 output layout.
     */
    private buildCropUploadRequest(
        quickMatchId: string,
        isAttendance: boolean,
        shots: Array<{ storageUrl: string; fileName?: string }>,
        options?: {
            tournamentId?: string;
            metadata?: Record<string, unknown> | null;
        },
    ): CropUploadRequest {
        if (shots.length === 0) {
            throw new Error('At least one screenshot is required for crop processing');
        }

        const screenshotType = isAttendance ? 'ATTENDANCE_IMAGE' : 'RESULT_IMAGE';
        const first = shots[0];

        let folder_path: string;
        if (first.storageUrl?.trim()) {
            folder_path = buildCropFolderPathFromStorageUrl(first.storageUrl);
        } else if (first.fileName?.trim()) {
            folder_path = buildCropFolderPathFromObjectKey(first.fileName);
        } else {
            folder_path = buildQuickPtScreenshotFolderPath(quickMatchId, screenshotType);
        }

        const image_urls = shots.map(s =>
            resolvePythonImageRef(s.storageUrl, s.fileName),
        );

        return {
            image_urls,
            folder_path,
            match_id: quickMatchId,
            ...(options?.tournamentId && { tournament_id: options.tournamentId }),
            ...(options?.metadata != null && { metadata: options.metadata }),
            cleanup_temp: true,
        };
    }

    /**
     * Extract R2 key from a crop URL (strips bucket prefix — for internal storage)
     * e.g. https://...r2.cloudflarestorage.com/pt-maker-screenshots/crops/... → crops/...
     */
    private extractR2Key(cropUrl: string): string {
        const url = new URL(cropUrl);
        let key = url.pathname.substring(1); // Remove leading slash
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
            await this.autoProcessMatchScreenshots(quickMatchId, userId);

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

            const downloadPreviews = await Promise.all(
                crops.map(crop =>
                    (crop.r2Key && !crop.r2Key.startsWith('placeholder_key_'))
                        ? this.previewForCrop(crop, userId).catch(error => {
                            this.logger.warn(`Failed to generate download URL for crop ${crop.id}:`, error);
                            return { signedUrl: null, expiresAt: null };
                          })
                        : Promise.resolve({ signedUrl: null, expiresAt: null })
                )
            );

            for (let i = 0; i < crops.length; i++) {
                const crop = crops[i];
                const preview = downloadPreviews[i];
                if (!preview.signedUrl) continue;

                const fileExtension = crop.r2Key.split('.').pop() || 'jpg';
                const filename = `${crop.cropType}_${crop.id.substring(0, 8)}.${fileExtension}`;

                const downloadData = {
                    id: crop.id,
                    cropType: crop.cropType,
                    downloadUrl: preview.signedUrl,
                    expiresAt: preview.expiresAt ?? new Date(),
                    filename,
                    cropMetadata: crop.cropData,
                };

                if (crop.cropType.toLowerCase().includes('attendance')) {
                    attendanceDownloads.push(downloadData);
                } else {
                    resultDownloads.push(downloadData);
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
                return { success: false };
            }

            const preview = await this.previewForCrop(crop, userId);
            if (!preview.signedUrl) {
                return { success: false };
            }

            return {
                success: true,
                cropId: crop.id,
                signedUrl: preview.signedUrl,
                expiresAt: preview.expiresAt ?? undefined,
            };

        } catch (error) {
            this.handleError(error, 'Generate Crop Signed URL');
            return { success: false };
        }
    }
}

export const cropStorageService = new CropStorageService();