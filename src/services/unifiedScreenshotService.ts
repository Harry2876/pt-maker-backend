
import { BaseService } from './baseService';
import { QueueService } from './queueService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { r2Service } from './cloudflareR2Service';
import { UploadFile, ScreenshotUploadData } from '../types/upload';
import { QuickScreenshotCache, QuickScreenshotType } from '../types/quickScreenshot';

export class UnifiedScreenshotService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    async processScreenshotUpload(
        context: 'tournament' | 'quick-pt',
        matchId: string,
        userId: string,
        uploadData: {
            files: Array<{
                originalName: string;
                fileName: string;
                size: number;
                mimeType: string;
                path: string;
            }>;
            uploadId: string;
            screenshotType?: string; // Add optional screenshot type
        }
    ) {
        // Validate all required parameters upfront
        if (!context || !matchId || !userId || !uploadData) {
            throw new Error('Missing required parameters for screenshot upload');
        }

        if (!Array.isArray(uploadData.files) || uploadData.files.length === 0) {
            throw new Error('No files provided for upload');
        }
        // Track files for cleanup
        const uploadedFiles = uploadData.files;
        let databaseSuccess = false;

        try {
            const result = await this.db.$transaction(async (tx) => {
                if (context === 'tournament') {
                    return await this.processTournamentScreenshots(matchId, userId, uploadData);
                } else {
                    return await this.processQuickPtScreenshots(matchId, userId, uploadData);
                }
            }, {
                timeout: 30000,
                maxWait: 10000
            });

            databaseSuccess = true;
            return result;

        } catch (error) {
            this.logger.error(`❌ Database transaction failed for ${context} upload:`, error);

            // CRITICAL: Only cleanup R2 if database failed
            if (!databaseSuccess) {
                await this.cleanupR2Files(uploadedFiles);
                this.logger.info(`🧹 Cleaned up ${uploadedFiles.length} R2 files after DB failure`);
            }

            throw error;
        } finally {
            await this.cleanupUploadLock(uploadData.uploadId, userId);
        }
    }

    private async processTournamentScreenshots(matchId: string, userId: string, uploadData: {
        files: Array<{
            originalName: string;
            fileName: string;
            size: number;
            mimeType: string;
            path: string;
        }>;
        uploadId: string;
        screenshotType?: string; // Add optional screenshot type
    }) {
        try {
            // 1. Verify match ownership
            const match = await redis.hgetObject(`match:${matchId}`);
            if (!match || !await this.verifyMatchOwnership(matchId, userId)) {
                throw new Error("Match not found or user does not own this match");
            }

            // 2. Process each file
            const screenshots = [];
            for (const file of uploadData.files) {
                const screenshotId = randomUUID();
                const screenshot = {
                    id: screenshotId,
                    originalName: file.originalName,
                    fileName: file.fileName,
                    fileSize: file.size,
                    mimeType: file.mimeType,
                    storageUrl: file.path,
                    matchId,
                    uploadedAt: new Date().toISOString(),
                    isProcessed: false,
                    type: 'RESULT_IMAGE', // Default type for tournaments
                    dbStatus: 'PENDING_SYNC'
                };

                // 3. Store in redis immediately
                await redis.hsetObject(`screenshot:${screenshotId}`, screenshot);
                await redis.sadd(`match:${matchId}:screenshots`, screenshotId);

                screenshots.push(screenshot);
            }

            // 4. Queue db sync for all screenshots
            for (const screenshot of screenshots) {
                await QueueService.syncImmediately('SCREENSHOT', screenshot.id, screenshot, userId);
            }

            // 5. Update upload progress AFTER database operations
            await this.updateUploadProgress(uploadData.uploadId, 'PROCESSING', 90);

            // Brief wait for queue operations to start
            await new Promise(resolve => setTimeout(resolve, 500));
            await this.updateUploadProgress(uploadData.uploadId, 'COMPLETED', 100);

            // 6. Invalidate match cache
            await redis.delete(`match:${matchId}:screenshots:list`);

            this.logger.info(`✅ Tournament screenshots saved for match ${matchId} by user ${userId}`, {
                count: screenshots.length,
                uploadId: uploadData.uploadId
            });

            return screenshots;
        } catch (error) {
            // Update upload progress with error
            await this.updateUploadProgress(uploadData.uploadId, 'FAILED', 0, (error as any).message);
            this.logger.error(`❌ Failed to save tournament screenshots for match ${matchId} by user ${userId}`, {
                error: (error as any).message,
                uploadId: uploadData.uploadId
            });
            this.handleError(error, 'Save tournament screenshots');
            throw error;
        }
    }

    private async processQuickPtScreenshots(quickMatchId: string, userId: string, uploadData: {
        files: Array<{
            originalName: string;
            fileName: string;
            size: number;
            mimeType: string;
            path: string;
        }>;
        uploadId: string;
        screenshotType?: string; // Add optional screenshot type
    }) {
        try {
            // Import the service we need
            const { quickMatchService } = await import('./quickMatchService');

            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            const screenshots = [];

            // 2. Process each file with robust error handling
            for (const file of uploadData.files) {
                const screenshotId = randomUUID();

                // Determine screenshot type with comprehensive validation and fallbacks
                let screenshotType = 'RESULT'; // Safe default
                try {
                    const rawType = uploadData.screenshotType || 'RESULT';
                    // Sanitize and normalize type names for consistency
                    const normalizedType = rawType.toString().toUpperCase().trim();
                    
                    if (normalizedType === 'ATTENDANCE' || normalizedType === 'ATTENDANCE_IMAGE') {
                        screenshotType = 'ATTENDANCE';
                    } else if (normalizedType === 'RESULT' || normalizedType === 'RESULT_IMAGE') {
                        screenshotType = 'RESULT';
                    }
                    // Any other value defaults to 'RESULT' for safety
                } catch (typeError) {
                    this.logger.warn(`Failed to determine screenshot type, using default: ${typeError}`);
                    screenshotType = 'RESULT'; // Fail safe
                }

                const screenshot = {
                    id: screenshotId,
                    quickMatchId,
                    originalName: file.originalName,
                    fileName: file.fileName,
                    storageUrl: file.path,
                    type: screenshotType, // Use the determined type
                    pageNumber: undefined,
                    isProcessed: false,
                    uploadedAt: new Date().toISOString(),
                    dbStatus: 'PENDING_SYNC'
                };

                // 3. Store in Redis with comprehensive error handling
                try {
                    await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot);
                    await redis.sadd(`quickMatch:${quickMatchId}:screenshots`, screenshotId);
                    
                    // Type-specific Redis operations with additional safety
                    if (screenshot.type === 'ATTENDANCE') {
                        await redis.sadd(`quickMatch:${quickMatchId}:attendanceScreenshots`, screenshotId);
                        this.logger.info(`Added attendance screenshot ${screenshotId} to Redis`);
                    } else if (screenshot.type === 'RESULT') {
                        await redis.sadd(`quickMatch:${quickMatchId}:resultScreenshots`, screenshotId);
                        this.logger.info(`Added result screenshot ${screenshotId} to Redis`);
                    }
                } catch (redisError) {
                    this.logger.error(`Redis storage failed for screenshot ${screenshotId}:`, redisError);
                    // Don't throw - let the screenshot still be processed, just log the issue
                    // The queue sync will handle database persistence as fallback
                }

                // 4. Queue database sync with error handling
                try {
                    await QueueService.syncQuickPtImmediately('QUICK_SCREENSHOT', 'CREATE', screenshotId, screenshot, userId);
                } catch (queueError) {
                    this.logger.error(`Queue sync failed for screenshot ${screenshotId}:`, queueError);
                    // Mark as failed sync but don't interrupt the upload process
                    screenshot.dbStatus = 'SYNC_FAILED';
                }

                screenshots.push(screenshot);
            }

            // 5. Update match status atomically with comprehensive error handling
            if (screenshots.length > 0) {
                try {
                    // Use Redis lock to prevent race conditions with timeout safety
                    const lockKey = `match_status_lock:${quickMatchId}`;
                    const lockValue = `${userId}_${Date.now()}`;
                    const lockTTL = 30; // 30 seconds TTL for safety

                    let lockAcquired = false;
                    try {
                        // Atomic lock acquisition with TTL
                        const keyExists = await redis.exists(lockKey);
                        if (!keyExists) {
                            lockAcquired = await redis.set(lockKey, lockValue, lockTTL);
                        }
                        
                        if (lockAcquired) {
                            try {
                                // Re-check current status with validation
                                const currentMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
                                if (currentMatch && currentMatch.status) {
                                    // Determine new status based on screenshot type and current state
                                    const hasAttendance = screenshots.some(s => s.type === 'ATTENDANCE');
                                    const hasResults = screenshots.some(s => s.type === 'RESULT');
                                    
                                    if (currentMatch.status === 'SLOTS_UPLOADED' && hasAttendance) {
                                        await quickMatchService.updateStatus(quickMatchId, userId, 'ATTENDANCE_UPLOADED');
                                        this.logger.info(`Status updated to ATTENDANCE_UPLOADED for match ${quickMatchId}`);
                                    } else if (currentMatch.status === 'ATTENDANCE_UPLOADED' && hasResults) {
                                        await quickMatchService.updateStatus(quickMatchId, userId, 'RESULTS_UPLOADED');
                                        this.logger.info(`Status updated to RESULTS_UPLOADED for match ${quickMatchId}`);
                                    }
                                }
                            } catch (statusError) {
                                this.logger.error(`State transition failed for match ${quickMatchId}:`, statusError);
                                // Don't throw - screenshots are still uploaded successfully
                                // State can be manually corrected later if needed
                            }
                        } else {
                            this.logger.info(`Could not acquire lock for match status update: ${quickMatchId}`);
                        }
                    } finally {
                        // Always release lock if we acquired it
                        if (lockAcquired) {
                            try {
                                await redis.delete(lockKey);
                            } catch (unlockError) {
                                this.logger.warn(`Failed to release lock ${lockKey}:`, unlockError);
                                // Lock has TTL so it will expire anyway
                            }
                        }
                    }
                } catch (lockError) {
                    this.logger.error(`Lock management failed for match ${quickMatchId}:`, lockError);
                    // Continue without state update - screenshots are still valid
                }
            }

            this.logger.info(`✅ Quick PT screenshots saved for match ${quickMatchId} by user ${userId}`, {
                count: screenshots.length,
                uploadId: uploadData.uploadId
            });

            return screenshots;
        } catch (error) {
            // Update upload progress with error
            await this.updateUploadProgress(uploadData.uploadId, 'FAILED', 0, (error as any).message);
            this.logger.error(`❌ Failed to save Quick PT screenshots for match ${quickMatchId} by user ${userId}`, {
                error: (error as any).message,
                uploadId: uploadData.uploadId
            });
            this.handleError(error, 'Save Quick PT screenshots');
            throw error;
        }
    }

    // Helper methods
    private async verifyMatchOwnership(matchId: string, userId: string): Promise<boolean> {
        const match = await redis.hgetObject<any>(`match:${matchId}`);
        if (!match) return false;

        const tournament = await redis.hgetObject<any>(`tournament:${match.tournamentId}`);
        return tournament !== null && tournament.userId === userId;
    }

    private async updateUploadProgress(uploadId: string,
        status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
        progress: number, error?: string) {
        try {
            const uploadProgress = await redis.getObject<any>(`upload:progress:${uploadId}`);
            if (uploadProgress) {
                uploadProgress.status = status;
                uploadProgress.progress = progress;
                uploadProgress.lastUpdate = new Date().toISOString();
                if (error) uploadProgress.error = error;

                await redis.setObject(`upload:progress:${uploadId}`, uploadProgress, 300);
            }
        } catch (err) {
            this.logger.warn('Failed to update upload progress:', err);
        }
    }

    private async cleanupR2Files(files: Array<{
        originalName: string;
        fileName: string;
        size: number;
        mimeType: string;
        path: string;
    }>) {
        for (const file of files) {
            try {
                await r2Service.deleteFile(file.fileName);
                this.logger.info(`🧹 Cleaned up R2 file: ${file.fileName}`);
            } catch (error) {
                this.logger.warn(`⚠️ Failed to cleanup R2 file ${file.fileName}:`, error);
            }
        }
    }

    /**
    * Clean up upload lock from Redis
    * CRITICAL: Must be called after every upload (success or failure)
    */
    private async cleanupUploadLock(uploadId: string, userId: string) {
        try {
            await redis.delete(`upload:active:${userId}`);
            this.logger.info(`🧹 Cleaned up upload lock for uploadId: ${uploadId}, userId: ${userId}`);
        } catch (error) {
            this.logger.warn(`⚠️ Failed to clean up upload lock for uploadId: ${uploadId}, userId: ${userId}:`, error);
        }
    }
    /**
 * List screenshots for a match (context-aware)
 */
    async listScreenshots(
        context: 'tournament' | 'quick-pt',
        matchId: string,
        userId: string,
        filters?: {
            type?: any;
            isProcessed?: boolean;
        }
    ): Promise<any[]> {
        try {
            if (context === 'tournament') {
                return await this.listTournamentScreenshots(matchId, userId);
            } else {
                return await this.listQuickPtScreenshots(matchId, userId, filters);
            }
        } catch (error) {
            this.handleError(error, 'List Screenshots');
            return []; // Return empty array instead of throwing
        }
    }

    private async listTournamentScreenshots(matchId: string, userId: string): Promise<any[]> {
        // Verify match ownership
        if (!await this.verifyMatchOwnership(matchId, userId)) {
            throw new Error("Match not found or user does not own this match");
        }

        // Check Redis cache first
        const cacheKey = `match:${matchId}:screenshots:list`;
        const cachedScreenshots = await redis.getObject(cacheKey);

        if (cachedScreenshots) {
            this.logger.info(`✅ Fetched tournament screenshots from cache for match ${matchId}`);
            return Array.isArray(cachedScreenshots) ? cachedScreenshots : [];
        }

        // Get from Redis sets
        const screenshotIds = await redis.smembers(`match:${matchId}:screenshots`);

        if (screenshotIds.length === 0) {
            // Fallback to database
            const dbScreenshots = await this.db.screenshot.findMany({
                where: { matchId },
                orderBy: { uploadedAt: 'desc' },
            });

            // Populate cache if found
            if (dbScreenshots.length > 0) {
                await this.populateTournamentScreenshotCache(matchId, dbScreenshots);
            }

            return dbScreenshots || [];
        }

        // Get screenshot details from Redis
        const screenshots = await Promise.all(
            screenshotIds.map(async (id) => {
                return await redis.hgetObject(`screenshot:${id}`);
            })
        );

        const validScreenshots = screenshots.filter(s => s !== null);
        await redis.setObject(cacheKey, validScreenshots, this.CACHE_TTL);

        return validScreenshots;
    }

    private async listQuickPtScreenshots(matchId: string, userId: string, filters?: { type?: any; isProcessed?: boolean }): Promise<any[]> {
        // Import service dynamically
        const { quickMatchService } = await import('./quickMatchService');

        // Verify Quick Match ownership
        const quickMatch = await quickMatchService.getQuickMatchById(matchId, userId);
        if (!quickMatch) {
            throw new Error('Quick Match not found or access denied');
        }

        // Build where clause
        const where: any = { quickMatchId: matchId };
        if (filters?.type) {
            where.type = filters.type;
        }
        if (filters?.isProcessed !== undefined) {
            where.isProcessed = filters.isProcessed;
        }

        // Get screenshots from database
        const dbScreenshots = await this.db.quickScreenshot.findMany({
            where,
            orderBy: [
                { type: 'asc' },
                { pageNumber: 'asc' },
                { uploadedAt: 'asc' }
            ]
        });

        // Convert to cache format
        const screenshots = dbScreenshots.map(dbScreenshot => ({
            id: dbScreenshot.id,
            quickMatchId: dbScreenshot.quickMatchId,
            originalName: dbScreenshot.originalName,
            fileName: dbScreenshot.fileName,
            storageUrl: dbScreenshot.storageUrl,
            type: dbScreenshot.type,
            pageNumber: dbScreenshot.pageNumber || undefined,
            isProcessed: dbScreenshot.isProcessed,
            uploadedAt: dbScreenshot.uploadedAt.toISOString(),
            dbStatus: 'SYNCED'
        }));

        return screenshots;
    }
    /**
 * Delete screenshot (context-aware)
 */
    async deleteScreenshot(
        context: 'tournament' | 'quick-pt',
        screenshotId: string,
        matchId: string,
        userId: string
    ) {
        try {
            if (context === 'tournament') {
                return await this.deleteTournamentScreenshot(screenshotId, userId);
            } else {
                return await this.deleteQuickPtScreenshot(screenshotId, matchId, userId);
            }
        } catch (error) {
            this.handleError(error, 'Delete Screenshot');
            return [];
        }
    }

    private async deleteTournamentScreenshot(screenshotId: string, userId: string) {
        // Get screenshot and verify ownership
        const screenshot = await redis.hgetObject<any>(`screenshot:${screenshotId}`);
        if (!screenshot) {
            throw new Error("Screenshot not found");
        }

        if (!await this.verifyMatchOwnership(screenshot.matchId, userId)) {
            throw new Error("User does not own this screenshot");
        }

        // Delete from R2 if it's an R2 URL
        if (screenshot.storageUrl && screenshot.storageUrl.includes('r2.cloudflarestorage.com')) {
            try {
                const urlParts = screenshot.storageUrl.split('/');
                const r2Key = urlParts.slice(-2).join('/');
                await r2Service.deleteFile(r2Key);
                this.logger.info(`✅ Deleted tournament screenshot ${screenshotId} from R2`);
            } catch (error) {
                this.logger.warn(`❌ Failed to delete tournament screenshot from R2:`, error);
            }
        }

        // Remove from Redis
        await redis.delete(`screenshot:${screenshotId}`);
        await redis.srem(`match:${screenshot.matchId}:screenshots`, screenshotId);

        // Queue database deletion
        await QueueService.queueDatabaseSync({
            type: 'SCREENSHOT_DELETE',
            entityId: screenshotId,
            data: { id: screenshotId, filePath: screenshot.storageUrl },
            userId,
            priority: 'HIGH',
            timestamp: new Date().toISOString()
        });

        // Invalidate cache
        await redis.delete(`match:${screenshot.matchId}:screenshots:list`);

        return { success: true, message: 'Tournament screenshot deleted successfully' };
    }

    private async deleteQuickPtScreenshot(screenshotId: string, matchId: string, userId: string) {
        // Import service dynamically
        const { quickMatchService } = await import('./quickMatchService');

        // Verify Quick Match ownership
        const quickMatch = await quickMatchService.getQuickMatchById(matchId, userId);
        if (!quickMatch) {
            throw new Error('Quick Match not found or access denied');
        }

        // Get screenshot
        const screenshot = await this.getQuickScreenshotById(screenshotId);
        if (!screenshot) {
            throw new Error('Screenshot not found');
        }

        // Delete file from R2
        try {
            await r2Service.deleteFile(screenshot.fileName);
        } catch (error) {
            this.logger.warn(`Failed to delete Quick PT file from R2: ${screenshot.fileName}`);
        }

        // Delete from database
        await this.db.quickScreenshot.delete({
            where: { id: screenshotId }
        });

        // Delete from Redis
        await redis.delete(`quickScreenshot:${screenshotId}`);
        await redis.srem(`quickMatch:${matchId}:screenshots`, screenshotId);
        await redis.srem(`quickMatch:${matchId}:screenshots:${screenshot.type}`, screenshotId);

        if (screenshot.type === 'ATTENDANCE') {
            await redis.srem(`quickMatch:${matchId}:attendanceScreenshots`, screenshotId);
        } else if (screenshot.type === 'RESULT') {
            await redis.srem(`quickMatch:${matchId}:resultScreenshots`, screenshotId);
        }

        this.logger.info(`Quick PT screenshot ${screenshotId} deleted`);

        return { success: true, message: 'Quick PT screenshot deleted successfully' };
    }
    /**
 * Mark screenshots as processed (Quick PT only)
 */
    async markScreenshotsProcessed(
        quickMatchId: string,
        type: any,
        userId?: string
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
                const screenshot = await redis.hgetObject<any>(`quickScreenshot:${screenshotId}`);
                if (screenshot) {
                    screenshot.isProcessed = true;
                    await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot);
                }
            }

            this.logger.info(`All ${type} screenshots marked as processed for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Mark Screenshots Processed');
            throw error;
        }
    }
    private async populateTournamentScreenshotCache(matchId: string, screenshots: any[]) {
        try {
            const promises = screenshots.map(async (screenshot) => {
                await redis.hsetObject(`screenshot:${screenshot.id}`, {
                    ...screenshot,
                    uploadedAt: screenshot.uploadedAt.toISOString(),
                    dbStatus: 'SYNCED'
                });
                await redis.sadd(`match:${matchId}:screenshots`, screenshot.id);
            });

            await Promise.all(promises);
            await redis.setObject(`match:${matchId}:screenshots:list`, screenshots, this.CACHE_TTL);

            this.logger.info(`Populated tournament screenshot cache for match ${matchId}`);
        } catch (error) {
            this.logger.error('Failed to populate tournament screenshot cache:', error);
        }
    }

    private async getQuickScreenshotById(screenshotId: string) {
        // Check Redis cache first
        const cached = await redis.hgetObject<any>(`quickScreenshot:${screenshotId}`);

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
        const screenshot = {
            id: dbScreenshot.id,
            quickMatchId: dbScreenshot.quickMatchId,
            originalName: dbScreenshot.originalName,
            fileName: dbScreenshot.fileName,
            storageUrl: dbScreenshot.storageUrl,
            type: dbScreenshot.type,
            pageNumber: dbScreenshot.pageNumber || undefined,
            isProcessed: dbScreenshot.isProcessed,
            uploadedAt: dbScreenshot.uploadedAt.toISOString(),
            dbStatus: 'SYNCED'
        };

        // Cache it
        await redis.hsetObject(`quickScreenshot:${screenshotId}`, screenshot, this.CACHE_TTL);

        return screenshot;
    }
}

export const unifiedScreenshotService = new UnifiedScreenshotService();