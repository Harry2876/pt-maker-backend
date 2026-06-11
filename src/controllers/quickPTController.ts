import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { quickMatchService } from '../services/quickMatchService';
import { quickSlotService } from '../services/quickSlotService';
import { quickProcessingService } from '../services/quickProcessingService';
import { quickExportService } from '../services/quickExportService';
import { unifiedScreenshotService } from '../services/unifiedScreenshotService';
import { quickPointsTableService } from '../services/quickPointsTableService';
import { quickResultService } from '../services/quickResultService';
import { tieBreakingService } from '../services/tieBreakingService';
import { quickSeriesService } from '../services/quickSeriesService';
import { templateService } from '../services/templateService';
import { excelExportService } from '../services/excelExportService';

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

        const uploadedWithPreviews = hasSuccessfulUploads
            ? await unifiedScreenshotService.attachQuickPtPreviewUrls(results)
            : [];

        // Ensure safe response data
        const responseData = {
            uploaded: uploadedWithPreviews,
            errors: Array.isArray(errors) ? errors : [],
            uploadId: uploadInfo?.uploadId || 'unknown',
            count: {
                total: uploadedWithPreviews.length,
                attendance: uploadedWithPreviews.filter((s) => s.type === 'ATTENDANCE').length,
                result: uploadedWithPreviews.filter((s) => s.type === 'RESULT').length,
            },
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

        const screenshotData = await unifiedScreenshotService.listQuickPtScreenshotsForClient(
            quickMatchId,
            userId,
            {
                type: type as any,
                isProcessed: isProcessed === 'true' ? true : isProcessed === 'false' ? false : undefined
            }
        );

        return res.json(
            ResponseHelper.success('Screenshots retrieved successfully', screenshotData)
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
     * POST /api/quick-pt/matches/:id/process
     * Unified screenshot processing endpoint.
     * Body: { type: "ATTENDANCE" | "RESULT" | "COMPLETE" }
     * Omitting type or passing "COMPLETE" runs both steps in sequence.
     */
    static processImages = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const type: string = (req.body?.type ?? 'COMPLETE').toUpperCase();

        if (type === 'ATTENDANCE') {
            const result = await quickProcessingService.processAttendance(quickMatchId, userId);
            return res.json(ResponseHelper.success('Attendance processed successfully', result));
        }

        if (type === 'RESULT') {
            const result = await quickProcessingService.processResults(quickMatchId, userId);
            return res.json(ResponseHelper.success('Results processed successfully', result));
        }

        if (type === 'COMPLETE') {
            const result = await quickProcessingService.processComplete(quickMatchId, userId);
            return res.json(ResponseHelper.success('Complete processing finished successfully', result));
        }

        return res.status(400).json(
            ResponseHelper.error('Invalid process type', 'VALIDATION_ERROR', 'Use "ATTENDANCE", "RESULT", or "COMPLETE"')
        );
    });
    // ========================================
    // TIE-BREAKING ENDPOINTS
    // ========================================

    /**
     * POST /api/quick-pt/matches/:id/conflicts/detect
     * Detect points conflicts in match results
     */
    static detectPointsConflicts = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const conflicts = await quickExportService.detectConflicts(quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Conflicts detection completed', conflicts)
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/conflicts/resolve
     * Resolve points conflicts manually
     */
    static resolvePointsConflicts = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { conflictGroupId, userDefinedOrder, reason } = req.body;

        const result = await quickExportService.resolveConflicts(
            quickMatchId,
            userId,
            conflictGroupId,
            userDefinedOrder,
            reason
        );

        return res.json(
            ResponseHelper.success('Conflicts resolved successfully', result)
        );
    });

    /**
     * POST /api/quick-pt/matches/:id/tie-breaking/rules
     * Set tie-breaking rules for a match
     */
    static setTieBreakingRules = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { rules, autoResolveEnabled } = req.body;

        const result = await quickExportService.setTieBreakingRules(
            quickMatchId,
            userId,
            rules,
            autoResolveEnabled
        );

        return res.json(
            ResponseHelper.success('Tie-breaking rules set successfully', result)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/tie-breaking/config
     * Get tie-breaking configuration for a match
     */
    static getTieBreakingConfig = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        // Verify ownership first
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            return res.status(404).json(ResponseHelper.notFound('Quick Match not found'));
        }

        const config = await tieBreakingService.getTieBreakingConfig(quickMatchId, 'match');

        return res.json(
            ResponseHelper.success('Tie-breaking config retrieved', config)
        );
    });

    // ========================================
    // SERIES TIE-BREAKING ENDPOINTS
    // ========================================

    /**
     * POST /api/quick-pt/series/:id/conflicts/detect
     * Detect conflicts in series standings
     */
    static detectSeriesConflicts = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;

        const conflicts = await quickSeriesService.detectSeriesConflicts(seriesId, userId);

        return res.json(
            ResponseHelper.success('Series conflicts detection completed', conflicts)
        );
    });

    /**
     * POST /api/quick-pt/series/:id/tie-breaking/rules
     * Set tie-breaking rules for a series
     */
    static setSeriesTieBreakingRules = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;
        const { rules, autoResolveEnabled } = req.body;

        const result = await quickSeriesService.setSeriesTieBreakingRules(
            seriesId,
            userId,
            rules,
            autoResolveEnabled
        );

        return res.json(
            ResponseHelper.success('Series tie-breaking rules set successfully', result)
        );
    });

    /**
     * GET /api/quick-pt/series/:id/tie-breaking/config
     * Get tie-breaking configuration for a series
     */
    static getSeriesTieBreakingConfig = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;

        // Verify ownership first
        const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            return res.status(404).json(ResponseHelper.notFound('Tournament series not found'));
        }

        const config = await tieBreakingService.getTieBreakingConfig(seriesId, 'series');

        return res.json(
            ResponseHelper.success('Series tie-breaking config retrieved', config)
        );
    });

    /**
     * POST /api/quick-pt/series/:id/conflicts/resolve
     * Resolve series points conflicts manually
     */
    static resolveSeriesConflicts = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;
        const { conflictGroupId, userDefinedOrder, reason } = req.body;

        const result = await quickSeriesService.resolveSeriesConflicts(
            seriesId,
            userId,
            conflictGroupId,
            userDefinedOrder,
            reason
        );

        return res.json(
            ResponseHelper.success('Series conflicts resolved successfully', result)
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/results
     * Get match results
     */
    static getMatchResults = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;

        const results = await quickResultService.getMatchResults(quickMatchId, userId);

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
        const {
            template,
            formatType,
            outputFilename,
            tableFontSize,
            tableHeaderFontSize,
            tableHeaderLabelMode,
            rowHeightAdjust,
            eventName,
            organiserName,
            sponsorName,
            elementOverrides,
            columnOverrides,
            advancedConfig,
        } = req.body;

        const result = await quickExportService.exportPointsTable({
            quickMatchId,
            userId,
            template,
            formatType,
            outputFilename,
            tableFontSize,
            tableHeaderFontSize,
            tableHeaderLabelMode,
            rowHeightAdjust,
            eventName,
            organiserName,
            sponsorName,
            elementOverrides,
            columnOverrides,
            advancedConfig,
        });

        const message = result.imageCount > 1
            ? `Standings exported as ${result.imageCount} images`
            : 'Standings exported successfully';

        return res.json(
            ResponseHelper.success(message, result)
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
        const {
            template,
            formatType,
            outputFilename,
            tableFontSize,
            tableHeaderFontSize,
            tableHeaderLabelMode,
            rowHeightAdjust,
            eventName,
            organiserName,
            sponsorName,
            elementOverrides,
            columnOverrides,
            advancedConfig,
        } = req.body;

        const result = await quickExportService.regeneratePointsTable({
            quickMatchId,
            userId,
            template,
            formatType,
            outputFilename,
            tableFontSize,
            tableHeaderFontSize,
            tableHeaderLabelMode,
            rowHeightAdjust,
            eventName,
            organiserName,
            sponsorName,
            elementOverrides,
            columnOverrides,
            advancedConfig,
        });

        const message = result.imageCount > 1
            ? `Standings regenerated as ${result.imageCount} images`
            : 'Standings regenerated successfully';

        return res.json(
            ResponseHelper.success(message, result)
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
 * POST /api/v1/quick-pt/matches/:id/results/manual
 * Create a manual result entry
 */
static createManualResult = asyncHandler(async (req: Request, res: Response) => {
    const { id: quickMatchId } = req.params;
    const userId = req.user!.id;
    const resultData = req.body;

    const result = await quickResultService.createManualResult(quickMatchId, userId, {
        ...resultData,
        source: 'MANUAL_ENTRY',
        entryMethod: 'INDIVIDUAL',
        enteredBy: userId
    });

    return res.status(201).json(
        ResponseHelper.success('Manual result created successfully', result)
    );
});

/**
 * PUT /api/v1/quick-pt/matches/:quickMatchId/results/:resultId
 * Update an existing result
 */
static updateManualResult = asyncHandler(async (req: Request, res: Response) => {
    const { resultId } = req.params;
    const userId = req.user!.id;
    const updateData = req.body;

    const result = await quickResultService.updateManualResult(resultId, userId, {
        ...updateData,
        modifiedBy: userId
    });

    return res.json(
        ResponseHelper.success('Result updated successfully', result)
    );
});
/**
 * POST /api/v1/quick-pt/matches/:id/results/bulk
 * Create multiple manual results in bulk
 */
static createBulkManualResults = asyncHandler(async (req: Request, res: Response) => {
    const { id: quickMatchId } = req.params;
    const userId = req.user!.id;
    const bulkData = req.body;

    const result = await quickResultService.createBulkManualResults(quickMatchId, userId, {
        ...bulkData,
        results: bulkData.results.map((r: any) => ({
            ...r,
            source: 'MANUAL_ENTRY',
            entryMethod: 'BULK',
            enteredBy: userId
        }))
    });

    const statusCode = result.success ? 201 : (result.created.length > 0 ? 207 : 400);
    
    return res.status(statusCode).json(
        result.success 
            ? ResponseHelper.success('Bulk results created successfully', result)
            : {
                success: false,
                message: 'Bulk operation completed with errors',
                data: result,
                error: {
                    code: 'BULK_PARTIAL_SUCCESS',
                    timestamp: new Date().toISOString()
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            }
    );
});

/**
 * PUT /api/v1/quick-pt/matches/:id/results/bulk
 * Update multiple results in bulk
 */
static updateBulkManualResults = asyncHandler(async (req: Request, res: Response) => {
    const { id: quickMatchId } = req.params;
    const userId = req.user!.id;
    const { updates } = req.body;

    const result = await quickResultService.updateBulkManualResults(quickMatchId, userId, updates);

    const statusCode = result.success ? 200 : (result.updated.length > 0 ? 207 : 400);
    
    return res.status(statusCode).json(
        result.success 
            ? ResponseHelper.success('Bulk results updated successfully', result)
            : {
                success: false,
                message: 'Bulk update completed with errors',
                data: result,
                error: {
                    code: 'BULK_PARTIAL_SUCCESS',
                    timestamp: new Date().toISOString()
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            }
    );
});

/**
 * DELETE /api/v1/quick-pt/matches/:id/results/bulk  
 * Delete multiple results in bulk
 */
static deleteBulkManualResults = asyncHandler(async (req: Request, res: Response) => {
    const { id: quickMatchId } = req.params;
    const userId = req.user!.id;
    const { resultIds } = req.body;

    const result = await quickResultService.deleteBulkManualResults(quickMatchId, userId, resultIds);

    const statusCode = result.success ? 200 : 400;
    
    return res.json(
        result.success 
            ? ResponseHelper.success('Bulk results deleted successfully', result)
            : {
                success: false,
                message: 'Bulk deletion failed',
                data: result,
                error: {
                    code: 'BULK_DELETE_ERROR',
                    timestamp: new Date().toISOString()
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            }
    );
});
/**
 * DELETE /api/v1/quick-pt/matches/:quickMatchId/results/:resultId
 * Delete a result
 */
static deleteResult = asyncHandler(async (req: Request, res: Response) => {
    const { resultId } = req.params;
    const userId = req.user!.id;

    await quickResultService.deleteResult(resultId, userId);

    return res.json(
        ResponseHelper.success('Result deleted successfully')
    );
});

// ========================================
// TEMPLATE ENDPOINTS
// ========================================

/**
 * GET /api/quick-pt/templates
 * Get all available template images
 */
static getAvailableTemplates = asyncHandler(async (req: Request, res: Response) => {
    const templates = await templateService.getAllTemplates();

    return res.json(
        ResponseHelper.success('Templates retrieved successfully', templates)
    );
});

/**
 * GET /api/v1/quick-pt/matches/:id/export/excel
 * Export match results to Excel format (single sheet)
 */
static exportToExcel = asyncHandler(async (req: Request, res: Response) => {
    const { id: quickMatchId } = req.params;
    const userId = req.user!.id;
    const queryData = (req as any).validatedQuery || req.query;
    const { customFilename } = queryData;

    const result = await excelExportService.exportMatchToExcel(
        quickMatchId,
        userId,
        { customFilename: customFilename as string | undefined }
    );

    return res.json(
        ResponseHelper.success('Excel export completed successfully', result)
    );
});

}