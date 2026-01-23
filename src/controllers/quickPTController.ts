import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { quickMatchService } from '../services/quickMatchService';
import { quickSlotService } from '../services/quickSlotService';
import { quickProcessingService } from '../services/quickProcessingService';
import { quickExportService } from '../services/quickExportService';
import { unifiedScreenshotService } from '../services/unifiedScreenshotService';
import { pythonAIService } from '../services/pythonAIService';
import { quickPointsTableService } from '../services/quickPointsTableService';

export class QuickPTController {

    /**
     * POST /api/quick-pt/matches
     * Create a new Quick Match
     */
    static createQuickMatch = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { matchName, game, map, positionPointsConfig, killPointsValue, scoringDescription } = req.body;

        const quickMatch = await quickMatchService.createQuickMatch(userId, {
            matchName,
            game,
            map,
            positionPointsConfig,
            killPointsValue,
            scoringDescription
        });

        return res.status(201).json(
            ResponseHelper.success('Quick Match created successfully', quickMatch)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id
     * Get Quick Match by ID
     */
    static getQuickMatchById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const quickMatch = await quickMatchService.getQuickMatchById(id, userId);

        if (!quickMatch) {
            return res.status(404).json(ResponseHelper.notFound('Quick Match not found'));
        }

        return res.json(
            ResponseHelper.success('Quick Match retrieved successfully', quickMatch)
        );
    });

    /**
     * GET /api/quick-pt/matches
     * List all Quick Matches for user
     */
    static listQuickMatches = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { status, page, limit } = req.query;

        const result = await quickMatchService.listUserQuickMatches(userId, {
            status: status as any,
            page: page ? parseInt(page as string) : undefined,
            limit: limit ? parseInt(limit as string) : undefined
        });

        return res.json(
            ResponseHelper.success('Quick Matches retrieved successfully', result)
        );
    });

    /**
     * PATCH /api/quick-pt/matches/:id
     * Update Quick Match
     */
    static updateQuickMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const quickMatch = await quickMatchService.updateQuickMatch(id, userId, updateData);

        if (!quickMatch) {
            return res.status(404).json(ResponseHelper.notFound('Quick Match not found'));
        }

        return res.json(
            ResponseHelper.success('Quick Match updated successfully', quickMatch)
        );
    });

    /**
     * DELETE /api/quick-pt/matches/:id
     * Delete Quick Match
     */
    static deleteQuickMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        await quickMatchService.deleteQuickMatch(id, userId);

        return res.json(
            ResponseHelper.success('Quick Match deleted successfully')
        );
    });

    // ========================================
    // SLOT MANAGEMENT ENDPOINTS
    // ========================================

    /**
     * POST /api/quick-pt/matches/:id/slots/parse
     * Parse and create slots from text
     */
    static createSlotsFromText = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { slotsText } = req.body;

        const result = await quickSlotService.createSlotsFromText(quickMatchId, userId, slotsText);

        if (!result.parseResult.success) {
            return res.status(400).json(
                ResponseHelper.error(
                    'Failed to parse slots',
                    'PARSE_ERROR',
                    result.parseResult.errors.join(', ')
                )
            );
        }

        return res.status(201).json(
            ResponseHelper.success('Slots created successfully', {
                created: result.created,
                errors: result.errors,
                warnings: result.parseResult.warnings
            })
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/slots
     * Create single slot
     */
    static createSlot = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { slotNumber, teamName, playerNames } = req.body;

        const slot = await quickSlotService.createSlot(quickMatchId, userId, {
            slotNumber,
            teamName,
            playerNames
        });

        return res.status(201).json(
            ResponseHelper.success('Slot created successfully', slot)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/slots
     * List all slots for a match
     */
    static listSlots = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { status, detectedInAttendance } = req.query;

        const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId, {
            status: status as any,
            detectedInAttendance: detectedInAttendance === 'true' ? true : detectedInAttendance === 'false' ? false : undefined
        });

        return res.json(
            ResponseHelper.success('Slots retrieved successfully', {
                slots,
                count: slots.length
            })
        );
    });

    /**
     * PATCH /api/quick-pt/slots/:slotId
     * Update slot
     */
    static updateSlot = asyncHandler(async (req: Request, res: Response) => {
        const { slotId } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const slot = await quickSlotService.updateSlot(slotId, userId, updateData);

        return res.json(
            ResponseHelper.success('Slot updated successfully', slot)
        );
    });

    /**
     * DELETE /api/quick-pt/matches/:id/slots
     * Delete all slots for a match
     */
    static deleteAllSlots = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        await quickSlotService.deleteAllSlots(quickMatchId, userId);

        return res.json(
            ResponseHelper.success('All slots deleted successfully')
        );
    });

    // ========================================
    // SCREENSHOT ENDPOINTS
    // ========================================

    /**
     * POST /api/quick-pt/matches/:id/screenshots
     * Upload screenshots (uses file upload middleware)
     */
    static uploadScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        // CRITICAL: Validate middleware state before proceeding
        if (!req.uploadInfo || !req.uploadInfo.files || req.uploadInfo.files.length === 0) {
            return res.status(400).json(ResponseHelper.error(
                'Upload state invalid. Files not processed by middleware.',
                'MIDDLEWARE_STATE_ERROR'
            ));
        }

        if (!req.screenshotType) {
            return res.status(400).json(ResponseHelper.error(
                'Screenshot type not determined by middleware.',
                'MISSING_SCREENSHOT_TYPE'
            ));
        }

        const uploadInfo = req.uploadInfo;
        const type = req.screenshotType;
        const results = [];
        const errors = [];

        try {
            // Additional validation for safety
            if (!quickMatchId || !userId) {
                throw new Error('Missing required parameters: quickMatchId or userId');
            }

            // Validate files before processing
            if (!Array.isArray(uploadInfo.files) || uploadInfo.files.length === 0) {
                throw new Error('No valid files found for upload');
            }

            const screenshots = await unifiedScreenshotService.processScreenshotUpload(
                'quick-pt',
                quickMatchId,
                userId,
                { 
                    files: uploadInfo.files, 
                    uploadId: uploadInfo.uploadId,
                    screenshotType: type || 'RESULT' // Safe fallback
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

    /**
     * GET /api/quick-pt/matches/:id/screenshots
     * List screenshots for a match
     */
    static listScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { type, isProcessed } = req.query;

        const screenshots = await unifiedScreenshotService.listScreenshots(
            'quick-pt',
            quickMatchId,
            userId,
            {
                type: type as any,
                isProcessed: isProcessed === 'true' ? true : isProcessed === 'false' ? false : undefined
            }
        );

        return res.json(
            ResponseHelper.success('Screenshots retrieved successfully', {
                screenshots,
                count: screenshots.length
            })
        );
    });


    /**
     * DELETE /api/quick-pt/screenshots/:screenshotId
     * Delete screenshot
     */
    static deleteScreenshot = asyncHandler(async (req: Request, res: Response) => {
        const { screenshotId } = req.params;
        const { quickMatchId } = req.body;
        const userId = req.user!.id;

        await unifiedScreenshotService.deleteScreenshot('quick-pt', screenshotId, quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Screenshot deleted successfully')
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/process/attendance
     * Process attendance screenshots
     */
    static processAttendance = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const result = await quickProcessingService.processAttendance(quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Attendance processed successfully', result)
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/process/results
     * Process result screenshots
     */
    static processResults = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const result = await quickProcessingService.processResults(quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Results processed successfully', result)
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/process/complete
     * Run complete processing (attendance + results)
     */
    static processComplete = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const result = await quickProcessingService.processComplete(
            quickMatchId,
            userId,
        );

        return res.json(
            ResponseHelper.success('Complete processing finished successfully', result)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/results
     * Get match results
     */
    static getMatchResults = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const results = await quickProcessingService.getMatchResults(quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Match results retrieved successfully', {
                results,
                count: results.length
            })
        );
    });

    // ========================================
    // EXPORT & POINTS TABLE ENDPOINTS
    // ========================================

    /**
     * POST /api/quick-pt/matches/:id/export
     * Generate and export points table
     */
    static exportPointsTable = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { template } = req.body;

        const result = await quickExportService.exportPointsTable({
            quickMatchId,
            userId,
            template
        });

        return res.json(
            ResponseHelper.success('Points table exported successfully', result)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/points-table
     * Get points table for a match
     */
    static getPointsTable = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const pointsTable = await quickExportService.getPointsTable(quickMatchId, userId);

        if (!pointsTable) {
            return res.status(404).json(ResponseHelper.notFound('Points table not found'));
        }

        return res.json(
            ResponseHelper.success('Points table retrieved successfully', pointsTable)
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/points-table/regenerate
     * Regenerate points table
     */
    static regeneratePointsTable = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { template } = req.body;

        const result = await quickExportService.regeneratePointsTable(quickMatchId, userId, template);

        return res.json(
            ResponseHelper.success('Points table regenerated successfully', result)
        );
    });

    /**
     * DELETE /api/quick-pt/points-table/:pointsTableId
     * Delete points table
     */
    static deletePointsTable = asyncHandler(async (req: Request, res: Response) => {
        const { pointsTableId } = req.params;
        const userId = req.user!.id;

        await quickExportService.deletePointsTable(pointsTableId, userId);

        return res.json(
            ResponseHelper.success('Points table deleted successfully')
        );
    });
    /**
     * GET /api/quick-pt/engines
     * Get available OCR engines
     */
    static getEngines = asyncHandler(async (req: Request, res: Response) => {
        const engines = await pythonAIService.getAvailableEngines();
        
        return res.json(
            ResponseHelper.success('Available engines retrieved successfully', engines)
        );
    });

    /**
     * GET /api/quick-pt/engines/status
     * Get engine status and health
     */
    static getEngineStatus = asyncHandler(async (req: Request, res: Response) => {
    const status = await pythonAIService.getEngineStatus();
    
    return res.json(
        ResponseHelper.success('Engine status retrieved successfully', status)
    );
});

    /**
     * GET /api/quick-pt/health
     * Get Python AI API health status
     */
    static getHealthStatus = asyncHandler(async (req: Request, res: Response) => {
        const health = await pythonAIService.getHealthStatus();
        
        return res.json(
            ResponseHelper.success('Health status retrieved successfully', health)
        );
    });
}