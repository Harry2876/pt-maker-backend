import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { advancedEngineService } from '../services/advancedEngineService';
import { AdvancedEngineRequest } from '../types/advancedEngine';

export class AdvancedEngineController {

    // Process screenshots with AI
    static processScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { matchId, processingType, screenshots, manualSlots, metadata } = req.body;
        const userId = req.user!.id;

        const result = await advancedEngineService.processScreenshots({
            matchId,
            processingType,
            screenshots,
            ...(manualSlots && { manualSlots }),
            ...(metadata && { metadata })
        } as AdvancedEngineRequest, userId);

        if (!result || !result.success) {
            return res.status(400).json(ResponseHelper.validationError('Failed to process screenshots'));
        }

        return res.status(201).json(
            ResponseHelper.success('Screenshot processing completed successfully', result)
        );
    });

    // Get job status
    static getJobStatus = asyncHandler(async (req: Request, res: Response) => {
        const { jobId } = req.params;
        
        const status = await advancedEngineService.getJobStatus(jobId);

        if (!status || status.status === 'NOT_FOUND') {
            return res.status(404).json(
                ResponseHelper.notFound('Processing job not found')
            );
        }

        return res.json(ResponseHelper.success('Job status retrieved successfully', status));
    });

    // Get match processing status
    static getMatchProcessingStatus = asyncHandler(async (req: Request, res: Response) => {
        const { matchId } = req.params;
        const userId = req.user!.id;
        
        const status = await advancedEngineService.getMatchProcessingStatus(matchId);

        if (!status || status.status === 'NO_JOBS') {
            return res.status(404).json(
                ResponseHelper.notFound('No processing jobs found for this match')
            );
        }

        return res.json(ResponseHelper.success('Match processing status retrieved successfully', status));
    });

    // Get processed data for match
    static getProcessedData = asyncHandler(async (req: Request, res: Response) => {
        const { matchId } = req.params;
        const { processingId } = req.query;
        const userId = req.user!.id;

        const processedData = await advancedEngineService.getProcessedData(
            matchId, 
            processingId as string
        );

        if (!processedData) {
            return res.status(404).json(
                ResponseHelper.notFound('No processed data found for this match')
            );
        }

        return res.json(ResponseHelper.success('Processed data retrieved successfully', processedData));
    });
}