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

        const result = await unifiedScreenshotService.processScreenshotUpload(
            'tournament', matchId, userId, { files: uploadInfo.files, uploadId: uploadInfo.uploadId }
        );

        if (!result) {
            return res.status(500).json(ResponseHelper.serverError('Failed to upload screenshots'));
        }

        return res.status(201).json(ResponseHelper.success('Screenshots uploaded successfully', {
            screenshots: result,
            uploadId: uploadInfo.uploadId
        }));
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
