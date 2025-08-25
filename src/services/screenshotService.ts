import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import { UploadFile, ScreenshotUploadData } from "../types/upload";
import { MatchCache } from '../types/match';
import { TournamentCache } from '../types/tournament';
import { UploadProgress } from '../types/upload';
import { r2Service } from "./cloudflareR2Service";

export class ScreenshotService extends BaseService {
    private CACHE_TTL = 300; //5 minutes

    //save screenshot metadata with hybrid sync
    async saveScreenshots(matchId: string, userId: string, uploadData: ScreenshotUploadData) {
        try {
            //verify match ownership
            const match = await redis.hgetObject(`match:${matchId}`);
            if (!match || !await this.verifyMatchOwnership(matchId, userId)) {
                throw new Error("Match not found or user does not own this match");
            }

            //process each file
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
                    type: this.determineScreenshotType(file.originalName),
                    dbStatus: 'PENDING_SYNC'
                };

                //store in redis immediately
                await redis.hsetObject(`screenshot:${screenshotId}`, screenshot);
                await redis.sadd(`match:${matchId}:screenshots`, screenshotId);

                screenshots.push(screenshot);
            }

            //queue db sync for all screenshots
            for (const screenshot of screenshots) {
                await QueueService.syncImmediately('SCREENSHOT', screenshot.id, screenshot, userId);
            }

            //update upload progress
            await this.updateUploadProgress(uploadData.uploadId, 'COMPLETED', 100);

            //invalidate match cache
            await redis.delete(`match:${matchId}:screenshots:list`);

            this.logger.info(`✅ Screenshots saved for match ${matchId} by user ${userId}`, {
                count: screenshots.length,
                uploadId: uploadData.uploadId
            });

            return screenshots;
        } catch (error) {
            //update upload progress with error
            await this.updateUploadProgress(uploadData.uploadId, 'FAILED', 0, (error as any).message);
            this.logger.error(`❌ Failed to save screenshots for match ${matchId} by user ${userId}`, {
                error: (error as any).message,
                uploadId: uploadData.uploadId
            });
            this.handleError(error, 'Save screenshots');
            return null;
        }
    }

    //get screenshots  for a match
    async getMatchScreenshots(matchId: string, userId: string) {
        try {
            //verify match ownership
            if (!await this.verifyMatchOwnership(matchId, userId)) {
                throw new Error("Match not found or user does not own this match");
            }

            //check redis cache first
            const cacheKey = `match:${matchId}:screenshots:list`;
            const cachedScreenshots = await redis.getObject(cacheKey);

            if (cachedScreenshots) {
                this.logger.info(`✅ Fetched screenshots from cache for match ${matchId} by user ${userId}`);
                return cachedScreenshots;
            }

            //get from redis sets
            const screenshotIds = await redis.smembers(`match:${matchId}:screenshots`);

            if (screenshotIds.length === 0) {
                //fallback to database

                const dbScreenshots = await this.db.screenshot.findMany({
                    where: { matchId },
                    orderBy: { uploadedAt: 'desc' },
                });

                //populate cache
                if (dbScreenshots.length > 0) {
                    await this.populateScreenshotCache(matchId, dbScreenshots);
                }

                return dbScreenshots;
            }

            //get screenshot details from redis
            const screenshots = await Promise.all(
                screenshotIds.map(async (id) => {
                    return await redis.hgetObject(`screenshot:${id}`);
                })
            );

            const validScreenshots = screenshots.filter(s => s !== null);
            await redis.setObject(cacheKey, validScreenshots, this.CACHE_TTL);

            return validScreenshots;
        } catch (error) {
            this.logger.error(`❌ Failed to get screenshots for match ${matchId} by user ${userId}`, {
                error: (error as any).message
            });
            this.handleError(error, 'Get match screenshots');
            return null;
        }
    }

    //delete screenshot
    async deleteScreenshot(screenshotId: string, userId: string) {
        try {
            //get screenshot and verify ownership
            const screenshot = await redis.hgetObject<any>(`screenshot:${screenshotId}`);
            if (!screenshot) {
                throw new Error("Screenshot not found");
            }

            if (!await this.verifyMatchOwnership(screenshot.matchId, userId)) {
                throw new Error("User does not own this screenshot");
            }

            //delete from r2 if its an r2 url
            if(screenshot.storageUrl && screenshot.storageUrl.includes('r2.cloudflarestorage.com')){
                try {
                    //extract r2 key from url
                    const urlParts = screenshot.storageUrl.split('/');
                    const r2Key = urlParts.slice(-2).join('/'); // assuming folder/filename format
                    await r2Service.deleteFile(r2Key);
                    this.logger.info(`✅ Deleted screenshot ${screenshotId} from R2 storage`);
                } catch (error) {
                    this.logger.warn(`❌ Failed to delete screenshot ${screenshotId} from R2 storage`, {
                        error: (error as any).message
                    });
                }
            }
            //remove from redis
            await redis.delete(`screenshot:${screenshotId}`);
            await redis.srem(`match:${screenshot.matchId}:screenshots`, screenshotId);

            //queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'SCREENSHOT_DELETE',
                entityId: screenshotId,
                data: { id: screenshotId, filePath: screenshot.storageUrl },
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            //invalidate cache
            await redis.delete(`match:${screenshot.matchId}:screenshots:list`);

            this.logger.info(`✅ Screenshot ${screenshotId} deleted for match ${screenshot.matchId} by user ${userId}`);
            return { success: true, message: 'Screenshot deleted successfully' };
        } catch (error) {
            this.handleError(error, 'Delete screenshot');
            return null;
        }
    }

    //helper methods
    private async verifyMatchOwnership(matchId: string, userId: string): Promise<boolean> {
        const match = await redis.hgetObject<MatchCache>(`match:${matchId}`);
        if (!match) return false;

        const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
        return tournament !== null && tournament.userId === userId;
    }

    private determineScreenshotType(filename: string): 'SLOT_LIST' | 'RESULT_SCREEN' {
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('slot') || lowerName.includes('team') || lowerName.includes('lobby')) {
            return 'SLOT_LIST';
        }
        return 'RESULT_SCREEN';
    }


    private async updateUploadProgress(uploadId: string,
        status: 'UPLOADING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
        progress: number, error?: string) {
        try {
            const uploadProgress = await redis.getObject<UploadProgress>(`upload:progress:${uploadId}`);
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

    private async populateScreenshotCache(matchId: string, screenshots: any[]) {
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

            this.logger.info(`Populated screenshot cache for match ${matchId}`);
        } catch (error) {
            this.logger.error('Failed to populate screenshot cache:', error);
        }
    }
}
export const screenshotService = new ScreenshotService();