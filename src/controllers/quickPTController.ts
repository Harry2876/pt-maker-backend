import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { quickMatchService } from '../services/quickMatchService';
import { quickSlotService } from '../services/quickSlotService';
import { quickScreenshotService } from '../services/quickScreenshotService';
import { quickProcessingService } from '../services/quickProcessingService';
import { quickExportService } from '../services/quickExportService';
import { quickPointsTableService } from '../services/quickPointsTableService';

export class QuickPTController {

    // ========================================
    // QUICK MATCH ENDPOINTS
    // ========================================

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
        const uploadInfo = req.uploadInfo!;
        const type = req.screenshotType || req.body.type; // Use middleware value first
        const { pageNumber } = req.body;

        // Note: Files are already uploaded to R2 by middleware
        // We just need to save the metadata to database
        const results = [];
        const errors = [];

        for (const file of uploadInfo.files) {
            try {
                const screenshot = await quickScreenshotService.createScreenshotFromR2(
                    quickMatchId,
                    userId,
                    {
                        originalName: file.originalName,
                        fileName: file.fileName,
                        storageUrl: file.path,
                        type: type as 'ATTENDANCE' | 'RESULT',
                        pageNumber: pageNumber ? parseInt(pageNumber) : undefined
                    }
                );
                results.push(screenshot);
            } catch (error: any) {
                errors.push(`${file.originalName}: ${error.message}`);
            }
        }

        return res.status(201).json(
            ResponseHelper.success('Screenshots uploaded successfully', {
                uploaded: results,
                errors: errors,
                uploadId: uploadInfo.uploadId
            })
        );
    });

    /**
     * GET /api/quick-pt/matches/:id/screenshots
     * List screenshots for a match
     */
    static listScreenshots = asyncHandler(async (req: Request, res: Response) => {
        const { id: quickMatchId } = req.params;
        const userId = req.user!.id;
        const { type, isProcessed } = req.query;

        const screenshots = await quickScreenshotService.listQuickMatchScreenshots(
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

        await quickScreenshotService.deleteScreenshot(screenshotId, quickMatchId, userId);

        return res.json(
            ResponseHelper.success('Screenshot deleted successfully')
        );
    });

    // ========================================
    // PROCESSING ENDPOINTS
    // ========================================

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
        const { skipAttendance } = req.body;

        const result = await quickProcessingService.processComplete(
            quickMatchId,
            userId,
            skipAttendance || false
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
}