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
            // Additional validation for safety
            if (!matchId || !userId) {
                throw new Error('Missing required parameters: matchId or userId');
            }

            // Validate files before processing
            if (!Array.isArray(uploadInfo.files) || uploadInfo.files.length === 0) {
                throw new Error('No valid files found for upload');
            }

            const screenshots = await unifiedScreenshotService.processScreenshotUpload(
                'tournament', 
                matchId, 
                userId, 
                { 
                    files: uploadInfo.files, 
                    uploadId: uploadInfo.uploadId,
                    screenshotType: type || 'RESULT_IMAGE' // Safe fallback for tournament
                }
            );
            
            if (Array.isArray(screenshots) && screenshots.length > 0) {
                results.push(...screenshots);
            } else {
                errors.push('No screenshots were processed successfully');
            }
        } catch (error: any) {
            const errorMessage = error?.message || 'Unknown upload error';
            errors.push(`Upload failed: ${errorMessage}`);
        }

        // Determine success with comprehensive validation
        const hasSuccessfulUploads = Array.isArray(results) && results.length > 0;
        const hasErrors = Array.isArray(errors) && errors.length > 0;
        const success = hasSuccessfulUploads && !hasErrors;

        // Ensure safe response data
        const responseData = {
            uploaded: Array.isArray(results) ? results : [],
            errors: Array.isArray(errors) ? errors : [],
            uploadId: uploadInfo?.uploadId || 'unknown'
        };

        try {
            return res.status(success ? 201 : (hasSuccessfulUploads ? 207 : 400)).json(
                success 
                    ? ResponseHelper.success('Screenshots uploaded successfully', responseData)
                    : hasSuccessfulUploads
                        ? ResponseHelper.success('Screenshots uploaded with some errors', responseData)
                        : {
                            success: false,
                            message: 'Screenshot upload failed',
                            data: responseData,
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
        } catch (responseError) {
            // Ultimate fallback response to prevent API crashes
            return res.status(500).json({
                success: false,
                message: 'Internal server error during response generation',
                error: {
                    code: 'RESPONSE_ERROR',
                    timestamp: new Date().toISOString()
                }
            });
        }
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
