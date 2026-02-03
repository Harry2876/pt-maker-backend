import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { cropStorageService } from '../services/cropStorageService';

export class CropStorageController {
    /**
     * POST /api/v1/quick-pt/matches/:id/crops/generate
     * Generate crops from screenshot
     */
    static generateCrops = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const { screenshotUrl, cropType } = req.body;
        const userId = req.user!.id;

        if (!screenshotUrl) {
            return res.status(400).json(
                ResponseHelper.validationError('Screenshot URL is required')
            );
        }

        const result = await cropStorageService.processCrops({
            quickMatchId,
            screenshotUrl,
            cropType
        });

        if (!result.success) {
            return res.status(400).json(
                ResponseHelper.error('Failed to generate crops', 'CROP_GENERATION_FAILED')
            );
        }

        return res.status(201).json(
            ResponseHelper.success('Crops generated successfully', result)
        );
    });

    /**
     * GET /api/v1/quick-pt/matches/:id/crops
     * Get all crops for a match with signed URLs
     */
    static getMatchCrops = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const result = await cropStorageService.getMatchCrops(quickMatchId, userId);

        if (!result.success) {
            return res.status(400).json(
                ResponseHelper.error('Failed to retrieve crops', 'CROP_RETRIEVAL_FAILED')
            );
        }

        return res.json(
            ResponseHelper.success('Crops retrieved successfully', result)
        );
    });

    /**
     * GET /api/v1/quick-pt/matches/:id/crops/download
     * Get bulk download URLs for all crops in a match organized by category
     */
    static getBulkCropDownloadUrls = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const result = await cropStorageService.getBulkCropDownloadUrls(quickMatchId, userId);

        if (!result.success) {
            return res.status(400).json(
                ResponseHelper.error('Failed to get crop download URLs', 'CROP_DOWNLOAD_FAILED')
            );
        }

        return res.json(
            ResponseHelper.success('Crop download URLs retrieved successfully', result)
        );
    });

    /**
     * GET /api/v1/quick-pt/matches/:id/crops/:cropId/download
     * Get fresh signed URL for specific crop (legacy endpoint)
     */
    static getCropDownloadUrl = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId, cropId } = req.params;
        const userId = req.user!.id;

        // Get specific crop and generate fresh signed URL
        const crops = await cropStorageService.getMatchCrops(quickMatchId, userId);
        
        if (!crops.success) {
            return res.status(404).json(
                ResponseHelper.notFound('Crop not found')
            );
        }

        // Search in all crops array (which contains both attendance and result crops)
        const crop = crops.crops.all.find((c: any) => c.id === cropId);
        
        if (!crop) {
            return res.status(404).json(
                ResponseHelper.notFound('Crop not found')
            );
        }

        return res.json(
            ResponseHelper.success('Crop download URL generated', {
                cropId: crop.id,
                signedUrl: crop.signedUrl,
                expiresAt: crop.expiresAt
            })
        );
    });
}