import {Request, Response} from 'express';
import { screenshotService} from '../services/screenshotService';
import {asyncHandler} from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class UploadController {
    //upload screenshots  for match
    static uploadScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const {id: matchId} = req.params;
        const userId = req.user!.id;
        const uploadInfo = req.uploadInfo!;

        const result = await screenshotService.saveScreenshots(matchId, userId, {
            matchId,
            files:uploadInfo.files.map(file => ({
                ...file,
                uploadedAt: new Date().toISOString()
            })),
            uploadId: uploadInfo.uploadId,
        });

        if(!result){
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

        const screenshots = await screenshotService.getMatchScreenshots(matchId, userId);

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

        const result = await screenshotService.deleteScreenshot(screenshotId, userId);

        if (!result) {
            return res.status(500).json(ResponseHelper.serverError('Failed to delete screenshot'));
        }

        return res.json(ResponseHelper.success('Screenshot deleted successfully', result));
    });

}
