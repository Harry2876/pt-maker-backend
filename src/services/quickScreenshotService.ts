import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { 
    QuickScreenshotCache, 
    CreateQuickScreenshotData,
    QuickScreenshotType,
    ScreenshotUploadResponse
} from '../types/quickScreenshot';
import { quickMatchService } from './quickMatchService';
import { r2Service } from './cloudflareR2Service';

export class QuickScreenshotService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Upload screenshot file to R2 and save metadata
     */
    async uploadScreenshot(
        quickMatchId: string,
        userId: string,
        file: Buffer,
        originalName: string,
        mimeType: string,
        type: QuickScreenshotType,
        pageNumber?: number
    ): Promise<ScreenshotUploadResponse> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Upload file to Cloudflare R2
            const screenshotTypeR2 = type === 'ATTENDANCE' ? 'ATTENDANCE_IMAGE' : 'RESULT_IMAGE';
            const { url, key } = await r2Service.uploadFile(
                file,
                originalName,
                mimeType,
                screenshotTypeR2,
                quickMatchId
            );

            // 3. Generate screenshot ID
            const screenshotId = randomUUID();

            // 4. Create screenshot metadata
            const screenshot: QuickScreenshotCache = {
                id: screenshotId,
                quickMatchId,
                originalName,
                fileName: key,
                storageUrl: url,
                type,
                pageNumber,
                isProcessed: false,
                uploadedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Store in Redis
            await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot);
            await redis.sadd(`quickMatch:${quickMatchId}:screenshots`, screenshotId);
            await redis.sadd(`quickMatch:${quickMatchId}:screenshots:${type}`, screenshotId);

            // 6. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SCREENSHOT', 'CREATE', screenshotId, screenshot, userId);

            // 7. Update match status based on screenshot type
            if (type === 'ATTENDANCE' && quickMatch.status === 'SLOTS_UPLOADED') {
                await quickMatchService.updateStatus(quickMatchId, userId, 'ATTENDANCE_UPLOADED');
            } else if (type === 'RESULT' && quickMatch.status === 'ATTENDANCE_UPLOADED') {
                await quickMatchService.updateStatus(quickMatchId, userId, 'RESULTS_UPLOADED');
            }

            this.logger.info(`Screenshot ${screenshotId} uploaded for Quick Match ${quickMatchId}`);

            return {
                id: screenshotId,
                fileName: key,
                storageUrl: url,
                type,
                uploadedAt: screenshot.uploadedAt
            };

        } catch (error) {
            this.handleError(error, 'Upload Quick Screenshot');
            throw error;
        }
    }

    /**
     * Upload multiple screenshots in batch
     */
    async uploadBatchScreenshots(
        quickMatchId: string,
        userId: string,
        files: Array<{
            buffer: Buffer;
            originalName: string;
            mimeType: string;
            type: QuickScreenshotType;
            pageNumber?: number;
        }>
    ): Promise<{ uploaded: ScreenshotUploadResponse[]; errors: string[] }> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            const uploaded: ScreenshotUploadResponse[] = [];
            const errors: string[] = [];

            // 2. Upload each file
            for (let i = 0; i < files.length; i++) {
                try {
                    const file = files[i];
                    const result = await this.uploadScreenshot(
                        quickMatchId,
                        userId,
                        file.buffer,
                        file.originalName,
                        file.mimeType,
                        file.type,
                        file.pageNumber
                    );
                    uploaded.push(result);
                } catch (error: any) {
                    errors.push(`File ${i + 1} (${files[i].originalName}): ${error.message}`);
                    this.logger.warn(`Failed to upload screenshot ${i + 1}: ${error.message}`);
                }
            }

            this.logger.info(`Batch screenshot upload completed: ${uploaded.length} uploaded, ${errors.length} errors`);
            return { uploaded, errors };

        } catch (error) {
            this.handleError(error, 'Upload Batch Quick Screenshots');
            throw error;
        }
    }

         /**
         * Create screenshot record from already uploaded R2 file
         * (Used when file upload middleware already uploaded to R2)
         */
        async createScreenshotFromR2(
            quickMatchId: string,
            userId: string,
            data: {
                originalName: string;
                fileName: string;
                storageUrl: string;
                type: QuickScreenshotType;
                pageNumber?: number;
            }
        ): Promise<QuickScreenshotCache> {
            try {
                // 1. Verify Quick Match ownership
                const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
                if (!quickMatch) {
                    throw new Error('Quick Match not found or access denied');
                }
    
                // 2. Generate screenshot ID
                const screenshotId = randomUUID();
    
                // 3. Create screenshot metadata
                const screenshot: QuickScreenshotCache = {
                    id: screenshotId,
                    quickMatchId,
                    originalName: data.originalName,
                    fileName: data.fileName,
                    storageUrl: data.storageUrl,
                    type: data.type,
                    pageNumber: data.pageNumber,
                    isProcessed: false,
                    uploadedAt: new Date().toISOString(),
                    dbStatus: 'PENDING_SYNC'
                };
    
                // 4. Store in Redis
                await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot);
                await redis.sadd(`quickMatch:${quickMatchId}:screenshots`, screenshotId);
                await redis.sadd(`quickMatch:${quickMatchId}:screenshots:${data.type}`, screenshotId);
    
                // 5. Queue database sync
                await QueueService.syncQuickPtImmediately('QUICK_SCREENSHOT', 'CREATE', screenshotId, screenshot, userId);
    
                // 6. Update match status based on screenshot type
                if (data.type === 'ATTENDANCE' && quickMatch.status === 'SLOTS_UPLOADED') {
                    await quickMatchService.updateStatus(quickMatchId, userId, 'ATTENDANCE_UPLOADED');
                } else if (data.type === 'RESULT' && quickMatch.status === 'ATTENDANCE_UPLOADED') {
                    await quickMatchService.updateStatus(quickMatchId, userId, 'RESULTS_UPLOADED');
                }
    
                this.logger.info(`Screenshot ${screenshotId} metadata saved for Quick Match ${quickMatchId}`);
    
                return screenshot;
    
            } catch (error) {
                this.handleError(error, 'Create Screenshot from R2');
                throw error;
            }
        }

    /**
     * Get screenshot by ID
     */
    async getScreenshotById(screenshotId: string): Promise<QuickScreenshotCache | null> {
        try {
            // Check Redis cache first
            const cached = await redis.hgetObject<QuickScreenshotCache>(`quickScreenshot:${screenshotId}`);
            
            if (cached) {
                return cached;
            }

            // Fallback to database
            const dbScreenshot = await this.db.quickScreenshot.findUnique({
                where: { id: screenshotId }
            });

            if (!dbScreenshot) {
                return null;
            }

            // Convert to cache format
            const screenshot: QuickScreenshotCache = {
                id: dbScreenshot.id,
                quickMatchId: dbScreenshot.quickMatchId,
                originalName: dbScreenshot.originalName,
                fileName: dbScreenshot.fileName,
                storageUrl: dbScreenshot.storageUrl,
                type: dbScreenshot.type as QuickScreenshotType,
                pageNumber: dbScreenshot.pageNumber || undefined,
                isProcessed: dbScreenshot.isProcessed,
                uploadedAt: dbScreenshot.uploadedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache it
            await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot, this.CACHE_TTL);

            return screenshot;

        } catch (error) {
            this.handleError(error, 'Get Quick Screenshot by ID');
            return null;
        }
    }

    /**
     * List all screenshots for a Quick Match
     */
    async listQuickMatchScreenshots(
        quickMatchId: string,
        userId: string,
        filters?: {
            type?: QuickScreenshotType;
            isProcessed?: boolean;
        }
    ): Promise<QuickScreenshotCache[]> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Build where clause
            const where: any = { quickMatchId };
            if (filters?.type) {
                where.type = filters.type;
            }
            if (filters?.isProcessed !== undefined) {
                where.isProcessed = filters.isProcessed;
            }

            // 3. Get screenshots from database
            const dbScreenshots = await this.db.quickScreenshot.findMany({
                where,
                orderBy: [
                    { type: 'asc' },
                    { pageNumber: 'asc' },
                    { uploadedAt: 'asc' }
                ]
            });

            // 4. Convert to cache format
            const screenshots: QuickScreenshotCache[] = dbScreenshots.map(dbScreenshot => ({
                id: dbScreenshot.id,
                quickMatchId: dbScreenshot.quickMatchId,
                originalName: dbScreenshot.originalName,
                fileName: dbScreenshot.fileName,
                storageUrl: dbScreenshot.storageUrl,
                type: dbScreenshot.type as QuickScreenshotType,
                pageNumber: dbScreenshot.pageNumber || undefined,
                isProcessed: dbScreenshot.isProcessed,
                uploadedAt: dbScreenshot.uploadedAt.toISOString(),
                dbStatus: 'SYNCED'
            }));

            return screenshots;

        } catch (error) {
            this.handleError(error, 'List Quick Match Screenshots');
            throw error;
        }
    }

    /**
     * Mark screenshot as processed
     */
    async markScreenshotProcessed(screenshotId: string): Promise<void> {
        try {
            // 1. Get screenshot
            const screenshot = await this.getScreenshotById(screenshotId);
            if (!screenshot) {
                throw new Error('Screenshot not found');
            }

            // 2. Update processed status in database
            await this.db.quickScreenshot.update({
                where: { id: screenshotId },
                data: { isProcessed: true }
            });

            // 3. Update Redis cache
            const updated: QuickScreenshotCache = {
                ...screenshot,
                isProcessed: true,
                dbStatus: 'SYNCED'
            };
            await redis.hsetObject(`quickScreenshot:${screenshotId}`, updated);

            this.logger.info(`Screenshot ${screenshotId} marked as processed`);

        } catch (error) {
            this.handleError(error, 'Mark Screenshot Processed');
            throw error;
        }
    }

    /**
     * Mark all screenshots of a type as processed
     */
    async markAllScreenshotsProcessed(
        quickMatchId: string,
        type: QuickScreenshotType
    ): Promise<void> {
        try {
            // Update in database
            await this.db.quickScreenshot.updateMany({
                where: {
                    quickMatchId,
                    type
                },
                data: { isProcessed: true }
            });

            // Get screenshot IDs from Redis
            const screenshotIds = await redis.smembers(`quickMatch:${quickMatchId}:screenshots:${type}`);

            // Update each in Redis cache
            for (const screenshotId of screenshotIds) {
                const screenshot = await redis.hgetObject<QuickScreenshotCache>(`quickScreenshot:${screenshotId}`);
                if (screenshot) {
                    screenshot.isProcessed = true;
                    await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot);
                }
            }

            this.logger.info(`All ${type} screenshots marked as processed for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Mark All Screenshots Processed');
            throw error;
        }
    }

    /**
     * Delete screenshot
     */
    async deleteScreenshot(screenshotId: string, quickMatchId: string, userId: string): Promise<void> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get screenshot
            const screenshot = await this.getScreenshotById(screenshotId);
            if (!screenshot) {
                throw new Error('Screenshot not found');
            }

            // 3. Delete file from R2
            try {
                await r2Service.deleteFile(screenshot.fileName);
            } catch (error) {
                this.logger.warn(`Failed to delete file from R2: ${screenshot.fileName}`);
            }

            // 4. Delete from database
            await this.db.quickScreenshot.delete({
                where: { id: screenshotId }
            });

            // 5. Delete from Redis
            await redis.delete(`quickScreenshot:${screenshotId}`);
            await redis.srem(`quickMatch:${quickMatchId}:screenshots`, screenshotId);
            await redis.srem(`quickMatch:${quickMatchId}:screenshots:${screenshot.type}`, screenshotId);

            this.logger.info(`Screenshot ${screenshotId} deleted from Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete Quick Screenshot');
            throw error;
        }
    }

    /**
     * Delete all screenshots for a Quick Match
     */
    async deleteAllScreenshots(quickMatchId: string, userId: string): Promise<void> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get all screenshots
            const screenshots = await this.listQuickMatchScreenshots(quickMatchId, userId);

            // 3. Delete files from R2
            for (const screenshot of screenshots) {
                try {
                    await r2Service.deleteFile(screenshot.fileName);
                } catch (error) {
                    this.logger.warn(`Failed to delete file from R2: ${screenshot.fileName}`);
                }
            }

            // 4. Delete from database
            await this.db.quickScreenshot.deleteMany({
                where: { quickMatchId }
            });

            // 5. Delete from Redis
            for (const screenshot of screenshots) {
                await redis.delete(`quickScreenshot:${screenshot.id}`);
            }
            await redis.delete(`quickMatch:${quickMatchId}:screenshots`);
            await redis.delete(`quickMatch:${quickMatchId}:screenshots:ATTENDANCE`);
            await redis.delete(`quickMatch:${quickMatchId}:screenshots:RESULT`);

            this.logger.info(`All screenshots deleted for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete All Quick Screenshots');
            throw error;
        }
    }

    /**
     * Get screenshot URLs for AI processing
     */
    async getScreenshotUrlsForProcessing(
        quickMatchId: string,
        type: QuickScreenshotType
    ): Promise<string[]> {
        try {
            const screenshots = await this.db.quickScreenshot.findMany({
                where: {
                    quickMatchId,
                    type,
                    isProcessed: false
                },
                orderBy: { pageNumber: 'asc' }, 
                select: { storageUrl: true }
            });

            return screenshots.map(s => s.storageUrl);

        } catch (error) {
            this.handleError(error, 'Get Screenshot URLs for Processing');
            return [];
        }
    }
}

export const quickScreenshotService = new QuickScreenshotService();