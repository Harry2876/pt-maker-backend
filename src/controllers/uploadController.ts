import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { unifiedScreenshotService } from '../services/unifiedScreenshotService';

export class UploadController {
    //upload screenshots  for match
    static uploadScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { id: matchId } = req.params;
        const userId = req.user!.id;

        // CRITICAL: Validate middleware state
        if (!req.uploadInfo || !req.uploadInfo.files || req.uploadInfo.files.length === 0) {
            return res.status(500).json(ResponseHelper.serverError(
                'Upload state invalid. Files not processed by middleware.'
            ));
        }
        if (!req.screenshotType) {
            return res.status(500).json(ResponseHelper.serverError(
                'Screenshot type not determined by middleware.'
            ));
        }

        const uploadInfo = req.uploadInfo;
        const type = req.screenshotType;
        const results = [];
        const errors = [];

        try {
            const screenshots = await unifiedScreenshotService.processScreenshotUpload(
                'tournament', 
                matchId, 
                userId, 
                { 
                    files: uploadInfo.files, 
                    uploadId: uploadInfo.uploadId,
                    screenshotType: type // Pass the screenshot type from middleware
                }
            );
            results.push(...screenshots);
        } catch (error: any) {
            errors.push(`Upload failed: ${error.message}`);
        }

        // Determine success based on whether we have results and no errors
        const hasSuccessfulUploads = results.length > 0;
        const hasErrors = errors.length > 0;
        const success = hasSuccessfulUploads && !hasErrors;

        return res.status(success ? 201 : 400).json(
            success 
                ? ResponseHelper.success('Screenshots uploaded successfully', {
                    uploaded: results,
                    errors: errors,
                    uploadId: uploadInfo.uploadId
                })
                : {
                    success: false,
                    message: 'Screenshot upload failed',
                    data: {
                        uploaded: results,
                        errors: errors,
                        uploadId: uploadInfo.uploadId
                    },
                    error: {
                        code: 'UPLOAD_ERROR',
                        timestamp: new Date().toISOString()
                    },
                    meta: {
                        timestamp: new Date().toISOString(),
                        version: '1.0'
                    }
                }
        );
    });

    // Get match screenshots
    static getMatchScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { id: matchId } = req.params;
        const userId = req.user!.id;

        const screenshots = await unifiedScreenshotService.listScreenshots('tournament', matchId, userId);

        if (!screenshots) {
            return res.status(404).json(ResponseHelper.notFound('No screenshots found for this match'));
        }

        return res.json(ResponseHelper.success('Screenshots retrieved successfully', {
            screenshots,
            count: Array.isArray(screenshots) ? screenshots.length : 0
        }));
    });

    // Delete screenshot
    static deleteScreenshot = asyncHandler(async (req: Request, res: Response) => {
        const { id: screenshotId } = req.params;
        const userId = req.user!.id;

        const result = await unifiedScreenshotService.deleteScreenshot('tournament', screenshotId, '', userId);

        if (!result) {
            return res.status(500).json(ResponseHelper.serverError('Failed to delete screenshot'));
        }

        return res.json(ResponseHelper.success('Screenshot deleted successfully', result));
    });

}
