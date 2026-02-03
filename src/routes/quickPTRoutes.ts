import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { QuickPTController } from '../controllers/quickPTController';
import { screenshotUpload } from '../middleware/fileUpload';
import {
    createQuickMatchSchema,
    updateQuickMatchSchema,
    listQuickMatchesQuerySchema,
    quickMatchParamsSchema
} from '../validations/quickMatchValidation';
import {
    createQuickSlotSchema,
    textSlotUploadSchema,
    updateQuickSlotSchema,
    quickSlotParamsSchema
} from '../validations/quickSlotValidation';
import {
    uploadQuickScreenshotSchema,
    quickScreenshotParamsSchema,
    listQuickScreenshotsQuerySchema
} from '../validations/quickScreenshotValidation';
import {
    quickResultParamsSchema,
    processResultsSchema,
    exportPointsTableSchema
} from '../validations/quickResultValidation';
import {
    setTieBreakingRulesSchema,
    resolveConflictsSchema,
    detectConflictsSchema,
    setSeriesTieBreakingRulesSchema,
    matchIdParamSchema,
    seriesIdParamSchema,
    tieBreakingRulesWithValidationSchema
} from '../validations/tieBreakingValidation';

import { QuickSeriesController } from '../controllers/quickSeriesController';
import {
    createQuickSeriesSchema,
    addMatchToSeriesSchema,
    quickSeriesParamsSchema,
    updateQuickSeriesSchema,
    listQuickSeriesQuerySchema
} from '../validations/quickSeriesValidation';

import {
    createManualResultSchema,
    updateManualResultSchema,
    manualResultParamsSchema,
    bulkCreateManualResultsSchema,
    bulkUpdateManualResultsSchema,
    bulkDeleteManualResultsSchema
} from '../validations/manualResultValidation';

import { CropStorageController } from '../controllers/cropStorageController';
import {
    generateCropsSchema,
    cropParamsSchema,
    cropDownloadParamsSchema
} from '../validations/cropValidation';

/**
 * @swagger
 * tags:
 *   - name: Quick-PT
 *     description: Quick Points Table generation for esports matches
 */

const quickPTRouter = express.Router();

// Apply authentication to all Quick-PT routes
quickPTRouter.use(authenticateUser);

// ========================================
// QUICK MATCH ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create a new Quick Match
 *     description: |
 *       Creates a Quick Match with custom scoring configuration for fast points table generation.
 *       
 *       **Workflow:**
 *       1. Create match with scoring rules
 *       2. Upload slot assignments
 *       3. Upload screenshots (attendance & results)
 *       4. Process with AI
 *       5. Generate points table
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - matchName
 *             properties:
 *               matchName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "BGMI Scrims Day 1"
 *               game:
 *                 type: string
 *                 default: BGMI
 *                 example: "BGMI"
 *               map:
 *                 type: string
 *                 example: "Erangel"
 *               positionPointsConfig:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of 10 integers for position points (rank 1-10)
 *                 example: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
 *               killPointsValue:
 *                 type: integer
 *                 default: 1
 *                 example: 1
 *               scoringDescription:
 *                 type: string
 *                 example: "Standard BGMI scoring"
 *     responses:
 *       201:
 *         description: Quick Match created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quick Match created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     matchName:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [CREATED]
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                     killPointsValue:
 *                       type: integer
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches',
    validateRequest(createQuickMatchSchema),
    QuickPTController.createQuickMatch
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get Quick Match by ID
 *     description: Retrieve complete match details including status, scoring config, processing metadata
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Quick Match retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quick Match retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "clx123abc456"
 *                     matchName:
 *                       type: string
 *                       example: "BGMI Scrims Day 1"
 *                     game:
 *                       type: string
 *                       example: "BGMI"
 *                     map:
 *                       type: string
 *                       example: "Erangel"
 *                     status:
 *                       type: string
 *                       enum: [CREATED, SLOTS_UPLOADED, ATTENDANCE_UPLOADED, RESULTS_UPLOADED, PROCESSING, COMPLETED, ERROR]
 *                       example: "SLOTS_UPLOADED"
 *                     processingStep:
 *                       type: string
 *                       example: "Waiting for screenshots"
 *                     teamsDetected:
 *                       type: integer
 *                       example: 16
 *                     warningsCount:
 *                       type: integer
 *                       example: 2
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
 *                     killPointsValue:
 *                       type: integer
 *                       example: 1
 *                     scoringDescription:
 *                       type: string
 *                       example: "Standard BGMI scoring"
 *                     userId:
 *                       type: string
 *                       example: "user_123"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T11:15:00.000Z"
 *       404:
 *         description: Quick Match not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Quick Match not found"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 */
quickPTRouter.get(
    '/matches/:id',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.getQuickMatchById
);

/**
 * @swagger
 * /api/v1/quick-pt/matches:
 *   get:
 *     tags: [Quick-PT]
 *     summary: List all Quick Matches for user
 *     description: Get paginated list of user's Quick Matches with optional status filter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATED, SLOTS_UPLOADED, ATTENDANCE_UPLOADED, RESULTS_UPLOADED, PROCESSING, COMPLETED, ERROR]
 *         description: Filter by match status
 *         example: "COMPLETED"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of items per page
 *         example: 20
 *     responses:
 *       200:
 *         description: List retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quick Matches retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     matches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           matchName:
 *                             type: string
 *                           game:
 *                             type: string
 *                           map:
 *                             type: string
 *                           status:
 *                             type: string
 *                           teamsDetected:
 *                             type: integer
 *                           warningsCount:
 *                             type: integer
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                         total:
 *                           type: integer
 *                           example: 45
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get(
    '/matches',
    validateRequest(listQuickMatchesQuerySchema, 'query'),
    QuickPTController.listQuickMatches
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}:
 *   put:
 *     tags: [Quick-PT]
 *     summary: Update Quick Match
 *     description: Update match name, map, or scoring configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               matchName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "BGMI Scrims Day 1 - Updated"
 *               map:
 *                 type: string
 *                 example: "Miramar"
 *               positionPointsConfig:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [20, 15, 12, 10, 8, 6, 4, 2, 1, 0]
 *               killPointsValue:
 *                 type: integer
 *                 example: 2
 *               scoringDescription:
 *                 type: string
 *                 example: "Custom high-value scoring"
 *     responses:
 *       200:
 *         description: Quick Match updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quick Match updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     matchName:
 *                       type: string
 *                     map:
 *                       type: string
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                     killPointsValue:
 *                       type: integer
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.put(
    '/matches/:id',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(updateQuickMatchSchema),
    QuickPTController.updateQuickMatch
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete Quick Match
 *     description: Permanently deletes match and all related data (slots, screenshots, results, points tables)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Quick Match deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Quick Match deleted successfully"
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete(
    '/matches/:id',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.deleteQuickMatch
);

// ========================================
// SLOT MANAGEMENT ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots/parse:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Parse and create slots from text
 *     description: Parse slot assignments from text format. Supports formats - "Slot 1 - Team A", "1. Team A", "Slot 1 Team A"
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slotsText
 *             properties:
 *               slotsText:
 *                 type: string
 *                 description: Multi-line text with slot assignments
 *                 example: "Slot 1: Team Alpha\nSlot 2: Team Beta\nSlot 3: Team Gamma"
 *     responses:
 *       201:
 *         description: Slots created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Slots created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     created:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           slotNumber:
 *                             type: integer
 *                           teamName:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [PENDING, DETECTED, MATCHED, NOT_FOUND]
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Line 5: Invalid format"]
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Duplicate slot number 3"]
 *       400:
 *         description: Parse error or validation failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/slots/parse',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(textSlotUploadSchema),
    QuickPTController.createSlotsFromText
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create a single slot
 *     description: Manually create a single slot assignment for the match
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - slotNumber
 *               - teamName
 *             properties:
 *               slotNumber:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 1
 *               teamName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Team Alpha"
 *               playerNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Player1", "Player2", "Player3", "Player4"]
 *     responses:
 *       201:
 *         description: Slot created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Slot created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     slotNumber:
 *                       type: integer
 *                     teamName:
 *                       type: string
 *                     playerNames:
 *                       type: array
 *                       items:
 *                         type: string
 *                     status:
 *                       type: string
 *                       enum: [PENDING, DETECTED, MATCHED, NOT_FOUND]
 *                     detectedInAttendance:
 *                       type: boolean
 *                     quickMatchId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or duplicate slot number
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/slots',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(createQuickSlotSchema),
    QuickPTController.createSlot
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots:
 *   get:
 *     tags: [Quick-PT]
 *     summary: List all slots for a match
 *     description: Get all slot assignments with optional filters for status and attendance detection
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, DETECTED, MATCHED, NOT_FOUND]
 *         description: Filter slots by status
 *         example: "MATCHED"
 *       - in: query
 *         name: detectedInAttendance
 *         schema:
 *           type: boolean
 *         description: Filter by attendance detection status
 *         example: true
 *     responses:
 *       200:
 *         description: List of slots retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Slots retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       slotNumber:
 *                         type: integer
 *                       teamName:
 *                         type: string
 *                       playerNames:
 *                         type: array
 *                         items:
 *                           type: string
 *                       status:
 *                         type: string
 *                         enum: [PENDING, DETECTED, MATCHED, NOT_FOUND]
 *                       detectedInAttendance:
 *                         type: boolean
 *                       matchQuality:
 *                         type: number
 *                         description: Match confidence percentage (0-100)
 *                       detectedPlayers:
 *                         type: array
 *                         items:
 *                           type: string
 *                       quickMatchId:
 *                         type: string
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get(
    '/matches/:id/slots',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.listSlots
);

/**
 * @swagger
 * /api/v1/quick-pt/slots/{slotId}:
 *   put:
 *     tags: [Quick-PT]
 *     summary: Update a slot
 *     description: Update slot details like team name or player names
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         example: "slot_xyz789"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quickMatchId
 *             properties:
 *               quickMatchId:
 *                 type: string
 *                 example: "clx123abc456"
 *               slotNumber:
 *                 type: integer
 *                 example: 5
 *               teamName:
 *                 type: string
 *                 example: "Team Alpha Updated"
 *               playerNames:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Player1", "Player2", "Player3", "Player4"]
 *     responses:
 *       200:
 *         description: Slot updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Slot updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     slotNumber:
 *                       type: integer
 *                     teamName:
 *                       type: string
 *                     playerNames:
 *                       type: array
 *                       items:
 *                         type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       404:
 *         description: Slot not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.put(
    '/slots/:slotId',
    validateRequest(updateQuickSlotSchema),
    QuickPTController.updateSlot
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete all slots for a match
 *     description: Remove all slot assignments for the match (useful for re-uploading corrected slots)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: All slots deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "All slots deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *                       example: 16
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete(
    '/matches/:id/slots',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.deleteAllSlots
);

// ========================================
// SCREENSHOT ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/screenshots:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Upload screenshots for attendance or results
 *     description: |
 *       Upload multiple screenshots to Cloudflare R2. Files are automatically uploaded and metadata saved.
 *       
 *       **Important:** The `type` parameter must be sent as a **query parameter** (?type=ATTENDANCE or ?type=RESULT)
 *       
 *       **Request Format:**
 *       - URL: `/api/v1/quick-pt/matches/{id}/screenshots?type=ATTENDANCE`
 *       - Body: multipart/form-data with files and optional pageNumber
 *       
 *       **Supported Screenshot Types:**
 *       - `ATTENDANCE`: Player attendance/participation list
 *       - `RESULT`: Match results/kill feed/leaderboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *         example: "clx123abc456"
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ATTENDANCE, RESULT]
 *         description: Type of screenshot (ATTENDANCE for player list, RESULT for match results)
 *         example: "ATTENDANCE"
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Image files (PNG, JPG, JPEG, WebP) - Max 10 files, 10MB each
 *               pageNumber:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 description: Page number for multi-page results (optional)
 *                 example: 1
 *     responses:
 *       201:
 *         description: Screenshots uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Screenshots uploaded successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       r2Key:
 *                         type: string
 *                         example: "quick-pt/clx123/attendance_1733312400.png"
 *                       r2Url:
 *                         type: string
 *                         example: "https://cdn.example.com/screenshots/..."
 *                       type:
 *                         type: string
 *                         enum: [ATTENDANCE, RESULT]
 *                       pageNumber:
 *                         type: integer
 *                       isProcessed:
 *                         type: boolean
 *                         example: false
 *                       quickMatchId:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Validation error or file upload failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/screenshots',
    validateRequest(quickMatchParamsSchema, 'params'),
    screenshotUpload, // File upload middleware (validates query type)
    QuickPTController.uploadScreenshots
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/screenshots:
 *   get:
 *     tags: [Quick-PT]
 *     summary: List screenshots for a match
 *     description: Get all uploaded screenshots with optional filters for type and processing status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ATTENDANCE, RESULT]
 *         description: Filter by screenshot type
 *         example: "RESULT"
 *       - in: query
 *         name: isProcessed
 *         schema:
 *           type: boolean
 *         description: Filter by processing status
 *         example: false
 *     responses:
 *       200:
 *         description: Screenshots retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Screenshots retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       r2Key:
 *                         type: string
 *                       r2Url:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [ATTENDANCE, RESULT]
 *                       pageNumber:
 *                         type: integer
 *                       isProcessed:
 *                         type: boolean
 *                       processingError:
 *                         type: string
 *                       quickMatchId:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get(
    '/matches/:id/screenshots',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(listQuickScreenshotsQuerySchema, 'query'),
    QuickPTController.listScreenshots
);

/**
 * @swagger
 * /api/v1/quick-pt/screenshots/{screenshotId}:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete a screenshot
 *     description: Delete screenshot from database and Cloudflare R2 storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: screenshotId
 *         required: true
 *         schema:
 *           type: string
 *         example: "screenshot_abc123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quickMatchId
 *             properties:
 *               quickMatchId:
 *                 type: string
 *                 example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Screenshot deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Screenshot deleted successfully"
 *       404:
 *         description: Screenshot not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete(
    '/screenshots/:screenshotId',
    QuickPTController.deleteScreenshot
);

// ========================================
// PROCESSING ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/process/attendance:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Process attendance screenshots with AI
 *     description: Send attendance screenshots to Python AI for player name detection and match with slots
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Attendance processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Attendance processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     teamsDetected:
 *                       type: integer
 *                       example: 16
 *                     teamsMatched:
 *                       type: integer
 *                       example: 15
 *                     teamsNotFound:
 *                       type: integer
 *                       example: 1
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Slot 5: 60% player match (below 100%)"]
 *                     detectedPlayers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           players:
 *                             type: array
 *                             items:
 *                               type: string
 *                           slotNumber:
 *                             type: integer
 *                           matchQuality:
 *                             type: number
 *       400:
 *         description: No attendance screenshots found or processing error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/process/attendance',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.processAttendance
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/process/results:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Process result screenshots with AI
 *     description: Send result screenshots to Python AI for rankings, kills, and player name extraction
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               useGeminiFallback:
 *                 type: boolean
 *                 description: Use Google Gemini if primary AI fails
 *                 example: false
 *     responses:
 *       200:
 *         description: Results processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Results processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     resultsCount:
 *                       type: integer
 *                       example: 16
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotNumber:
 *                             type: integer
 *                           teamName:
 *                             type: string
 *                           position:
 *                             type: integer
 *                           kills:
 *                             type: integer
 *                           positionPoints:
 *                             type: integer
 *                           killPoints:
 *                             type: integer
 *                           totalPoints:
 *                             type: integer
 *                           playerNames:
 *                             type: array
 *                             items:
 *                               type: string
 *                           matchQuality:
 *                             type: number
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: No result screenshots found or processing error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/process/results',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(processResultsSchema),
    QuickPTController.processResults
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/process/complete:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Run complete processing workflow (attendance + results)
 *     description: Process attendance and results in sequence, then update match status to COMPLETED
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               skipAttendance:
 *                 type: boolean
 *                 description: Skip attendance processing if already done
 *                 example: false
 *     responses:
 *       200:
 *         description: Complete processing finished successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Match processing completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     matchId:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "COMPLETED"
 *                     attendance:
 *                       type: object
 *                       properties:
 *                         teamsDetected:
 *                           type: integer
 *                         teamsMatched:
 *                           type: integer
 *                         warnings:
 *                           type: array
 *                           items:
 *                             type: string
 *                     results:
 *                       type: object
 *                       properties:
 *                         resultsCount:
 *                           type: integer
 *                         warnings:
 *                           type: array
 *                           items:
 *                             type: string
 *                     processingTime:
 *                       type: number
 *                       description: Total processing time in seconds
 *                       example: 45.3
 *       400:
 *         description: Processing error or missing data
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/process/complete',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.processComplete
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/results:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get match results
 *     description: Retrieve all processed results with rankings, kills, and points breakdown
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Match results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Match results retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       slotNumber:
 *                         type: integer
 *                         example: 1
 *                       teamName:
 *                         type: string
 *                         example: "Team Alpha"
 *                       position:
 *                         type: integer
 *                         example: 1
 *                       kills:
 *                         type: integer
 *                         example: 12
 *                       positionPoints:
 *                         type: integer
 *                         example: 15
 *                       killPoints:
 *                         type: integer
 *                         example: 12
 *                       totalPoints:
 *                         type: integer
 *                         example: 27
 *                       playerNames:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["Player1", "Player2", "Player3", "Player4"]
 *                       matchQuality:
 *                         type: number
 *                         description: Match confidence (0-100)
 *                         example: 95.5
 *                       quickMatchId:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Match not found or no results available
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get(
    '/matches/:id/results',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.getMatchResults
);

// ========================================
// EXPORT & POINTS TABLE ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/export:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Generate and export standings table
 *     description: |
 *       Generate professional standings table using advanced templating system.
 *       
 *       **New Features:**
 *       - Advanced template system with multiple formats
 *       - Support for 16_teams, 24_teams, 32_teams formats
 *       - Professional branding and styling options
 *       - Signed URLs for secure access (30-minute expiry)
 *       - Enhanced metadata and processing information
 *       
 *       **Template Options:**
 *       - `24_teams/template1` - Modern dark theme
 *       - `24_teams/template2` - Light professional theme  
 *       - `16_teams/template1` - Compact format for smaller tournaments
 *       
 *       **Security:** Returns signed URLs valid for 30 minutes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 example: "24_teams/template1"
 *                 description: "Template with format (format_type/template_name)"
 *               formatType:
 *                 type: string
 *                 example: "24_teams"  
 *                 description: "Format type based on team count"
 *               outputFilename:
 *                 type: string
 *                 example: "tournament_standings_final.png"
 *                 description: "Custom output filename"
 *     responses:
 *       200:
 *         description: Standings table generated and exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Standings table exported successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pointsTableId:
 *                       type: string
 *                       example: "table_abc123"
 *                     signedImageUrl:
 *                       type: string
 *                       example: "https://storage.com/signed?token=..."
 *                       description: "Signed URL valid for 30 minutes"
 *                     originalImageUrl:
 *                       type: string
 *                       example: "https://r2.com/standings/table.png"
 *                     templateUsed:
 *                       type: string
 *                       example: "24_teams/template1"
 *                     formatType:
 *                       type: string
 *                       example: "24_teams"
 *                     teamsProcessed:
 *                       type: integer
 *                       example: 24
 *                     quickMatchId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: No results available or export failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/export',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(exportPointsTableSchema),
    QuickPTController.exportPointsTable
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/points-table:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get points table for a match
 *     description: Retrieve generated points table with image URL and structured data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Points table retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Points table retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     r2Key:
 *                       type: string
 *                       example: "quick-pt/clx123/points-table_1733312400.png"
 *                     r2Url:
 *                       type: string
 *                       example: "https://cdn.example.com/points-tables/..."
 *                     template:
 *                       type: string
 *                       example: "default"
 *                     tableData:
 *                       type: array
 *                       description: Ranked list of teams with scores
 *                       items:
 *                         type: object
 *                         properties:
 *                           rank:
 *                             type: integer
 *                             example: 1
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           slotNumber:
 *                             type: integer
 *                             example: 1
 *                           position:
 *                             type: integer
 *                             example: 1
 *                           kills:
 *                             type: integer
 *                             example: 12
 *                           positionPoints:
 *                             type: integer
 *                             example: 15
 *                           killPoints:
 *                             type: integer
 *                             example: 12
 *                           totalPoints:
 *                             type: integer
 *                             example: 27
 *                     quickMatchId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Points table not found - need to export first
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Points table not found"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get(
    '/matches/:id/points-table',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.getPointsTable
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/points-table/regenerate:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Regenerate points table
 *     description: Delete existing points table and generate a new one with updated template or data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "clx123abc456"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 description: New visual template to use
 *                 example: "premium"
 *     responses:
 *       200:
 *         description: Points table regenerated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Points table regenerated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     r2Key:
 *                       type: string
 *                     r2Url:
 *                       type: string
 *                     template:
 *                       type: string
 *                     tableData:
 *                       type: array
 *                       items:
 *                         type: object
 *                     quickMatchId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: No results available or regeneration failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/points-table/regenerate',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(exportPointsTableSchema),
    QuickPTController.regeneratePointsTable
);

/**
 * @swagger
 * /api/v1/quick-pt/points-table/{pointsTableId}:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete points table
 *     description: Remove points table from database and delete image from R2 storage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pointsTableId
 *         required: true
 *         schema:
 *           type: string
 *         example: "table_xyz789"
 *     responses:
 *       200:
 *         description: Points table deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Points table deleted successfully"
 *       404:
 *         description: Points table not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete(
    '/points-table/:pointsTableId',
    QuickPTController.deletePointsTable
);

/**
 * @swagger
 * /api/v1/quick-pt/engines:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get available OCR engines
 *     description: Retrieve list of available OCR engines for processing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available engines retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Available engines retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     engines:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["paddleocr", "easyocr", "tesseract"]
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/engines', QuickPTController.getEngines);

/**
 * @swagger
 * /api/v1/quick-pt/engines/status:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get OCR engines status
 *     description: Get current status and health of OCR engines
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Engine status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Engine status retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "healthy"
 *                     engines:
 *                       type: object
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/engines/status', QuickPTController.getEngineStatus);

/**
 * @swagger
 * /api/v1/quick-pt/health:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Quick PT System Health Check
 *     description: |
 *       Comprehensive health check for Quick PT system including AI processing, database, and storage services.
 *       
 *       **Health Checks:**
 *       - Python AI processing API availability
 *       - Database connectivity and performance  
 *       - File storage service (R2) status
 *       - Background job queue health
 *       - System resource utilization
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Health status retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [healthy, degraded, unhealthy]
 *                       example: "healthy"
 *                     message:
 *                       type: string
 *                       example: "All systems operational"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T14:30:00.000Z"
 *                     services:
 *                       type: object
 *                       properties:
 *                         aiProcessing:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               enum: [up, down, limited]
 *                               example: "up"
 *                             responseTime:
 *                               type: number
 *                               description: Response time in milliseconds
 *                               example: 250.5
 *                             queueLength:
 *                               type: integer
 *                               description: Pending processing jobs
 *                               example: 2
 *                             lastHealthCheck:
 *                               type: string
 *                               format: date-time
 *                         database:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               enum: [up, down]
 *                               example: "up"
 *                             responseTime:
 *                               type: number
 *                               example: 45.2
 *                             connectionPool:
 *                               type: object
 *                               properties:
 *                                 active:
 *                                   type: integer
 *                                   example: 5
 *                                 idle:
 *                                   type: integer
 *                                   example: 10
 *                         storage:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               enum: [up, down]
 *                               example: "up"
 *                             responseTime:
 *                               type: number
 *                               example: 120.8
 *                             uploadsToday:
 *                               type: integer
 *                               example: 48
 *                         backgroundJobs:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               enum: [up, down]
 *                               example: "up"
 *                             activeWorkers:
 *                               type: integer
 *                               example: 3
 *                             pendingJobs:
 *                               type: integer
 *                               example: 1
 *                             failedJobs:
 *                               type: integer
 *                               example: 0
 *                     systemMetrics:
 *                       type: object
 *                       properties:
 *                         uptime:
 *                           type: number
 *                           description: System uptime in seconds
 *                           example: 86400
 *                         memoryUsage:
 *                           type: object
 *                           properties:
 *                             used:
 *                               type: number
 *                               description: Used memory in MB
 *                               example: 512.5
 *                             total:
 *                               type: number
 *                               description: Total memory in MB
 *                               example: 2048
 *                             percentage:
 *                               type: number
 *                               example: 25.02
 *                         cpuUsage:
 *                           type: number
 *                           description: CPU usage percentage
 *                           example: 15.6
 *       503:
 *         description: Service unavailable - system unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "System is unhealthy"
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: "unhealthy"
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["AI service unavailable", "High response latency"]
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/health', QuickPTController.getHealthStatus);

/**
 * @swagger
 * /api/v1/quick-pt/series:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create Tournament Series
 *     description: |
 *       Create a new tournament series to group multiple matches and track overall standings.
 *       
 *       **Use Cases:**
 *       - Multi-match tournaments (BGMI leagues, scrims series)
 *       - Overall championship tracking
 *       - Aggregated leaderboards across matches
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - seriesName
 *               - totalMatches
 *             properties:
 *               seriesName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 pattern: '^[a-zA-Z0-9\s\-_]+$'
 *                 example: "BGMI Championship Series"
 *               game:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 default: "BGMI"
 *                 example: "BGMI"
 *               totalMatches:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 example: 5
 *               positionPointsConfig:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 100
 *                 minItems: 10
 *                 maxItems: 10
 *                 example: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
 *               killPointsValue:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 10
 *                 default: 1
 *                 example: 1
 *               scoringDescription:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Standard BGMI tournament scoring"
 *     responses:
 *       201:
 *         description: Tournament Series created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tournament Series created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "series_clx123abc456"
 *                     seriesName:
 *                       type: string
 *                       example: "BGMI Championship Series"
 *                     game:
 *                       type: string
 *                       example: "BGMI"
 *                     totalMatches:
 *                       type: integer
 *                       example: 5
 *                     matchesCompleted:
 *                       type: integer
 *                       example: 0
 *                     status:
 *                       type: string
 *                       enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *                       example: "CREATED"
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
 *                     killPointsValue:
 *                       type: integer
 *                       example: 1
 *                     scoringDescription:
 *                       type: string
 *                       example: "Standard BGMI tournament scoring"
 *                     currentMatchNumber:
 *                       type: integer
 *                       example: 1
 *                     isFinished:
 *                       type: boolean
 *                       example: false
 *                     userId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T10:30:00.000Z"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Validation failed"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post('/series',
    validateRequest(createQuickSeriesSchema, 'body'),
    QuickSeriesController.createTournamentSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/matches:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Add Match to Series
 *     description: Add a completed Quick Match to tournament series for leaderboard calculation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "series_clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quickMatchId
 *             properties:
 *               quickMatchId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of completed Quick Match to add
 *                 example: "clx123abc456"
 *     responses:
 *       201:
 *         description: Match added to series successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Match added to series successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     seriesId:
 *                       type: string
 *                       format: uuid
 *                     quickMatchId:
 *                       type: string
 *                       format: uuid
 *                     matchOrder:
 *                       type: integer
 *                       example: 1
 *                     isCompleted:
 *                       type: boolean
 *                       example: true
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                     matchWeight:
 *                       type: number
 *                       example: 1.0
 *                     bonusPoints:
 *                       type: number
 *                       example: 0
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Match already in series or not completed
 *       404:
 *         description: Series or match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post('/series/:id/matches',
    validateRequest(quickSeriesParamsSchema, 'params'),
    validateRequest(addMatchToSeriesSchema, 'body'),
    QuickSeriesController.addMatchToSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/matches:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get matches in Tournament Series
 *     description: List all matches that belong to this tournament series with completion status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "series_clx123abc456"
 *     responses:
 *       200:
 *         description: Series matches retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Series matches retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       seriesId:
 *                         type: string
 *                         format: uuid
 *                       quickMatchId:
 *                         type: string
 *                         format: uuid
 *                       matchOrder:
 *                         type: integer
 *                         example: 1
 *                       isCompleted:
 *                         type: boolean
 *                         example: true
 *                       completedAt:
 *                         type: string
 *                         format: date-time
 *                       matchWeight:
 *                         type: number
 *                         example: 1.0
 *                       bonusPoints:
 *                         type: number
 *                         example: 0
 *                       quickMatch:
 *                         type: object
 *                         properties:
 *                           matchName:
 *                             type: string
 *                             example: "BGMI Scrims Match 1"
 *                           status:
 *                             type: string
 *                             example: "COMPLETED"
 *                           teamsDetected:
 *                             type: integer
 *                             example: 16
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       404:
 *         description: Tournament Series not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Tournament series not found"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/series/:id/matches',
    validateRequest(quickSeriesParamsSchema, 'params'),
    QuickSeriesController.getSeriesMatches
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get Tournament Series by ID
 *     description: Retrieve detailed information about a tournament series including progress and statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "series_clx123abc456"
 *     responses:
 *       200:
 *         description: Tournament Series retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tournament series retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "series_clx123abc456"
 *                     seriesName:
 *                       type: string
 *                       example: "BGMI Championship Series"
 *                     game:
 *                       type: string
 *                       example: "BGMI"
 *                     totalMatches:
 *                       type: integer
 *                       example: 5
 *                     matchesCompleted:
 *                       type: integer
 *                       example: 3
 *                     status:
 *                       type: string
 *                       enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *                       example: "IN_PROGRESS"
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [15, 12, 10, 8, 6, 4, 2, 1, 0, 0]
 *                     killPointsValue:
 *                       type: integer
 *                       example: 1
 *                     scoringDescription:
 *                       type: string
 *                       example: "Standard BGMI tournament scoring"
 *                     currentMatchNumber:
 *                       type: integer
 *                       example: 4
 *                     isFinished:
 *                       type: boolean
 *                       example: false
 *                     winnerTeamName:
 *                       type: string
 *                       example: "Team Alpha"
 *                     finalStandings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                           totalPoints:
 *                             type: number
 *                           matchesPlayed:
 *                             type: integer
 *                           bestPosition:
 *                             type: integer
 *                           worstPosition:
 *                             type: integer
 *                           totalKills:
 *                             type: integer
 *                           averagePosition:
 *                             type: number
 *                     userId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-04T12:15:00.000Z"
 *       404:
 *         description: Tournament Series not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Tournament series not found"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/series/:id',
    validateRequest(quickSeriesParamsSchema, 'params'),
    QuickSeriesController.getTournamentSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series:
 *   get:
 *     tags: [Quick-PT]
 *     summary: List all Tournament Series for user
 *     description: Get paginated list of user's tournament series with optional status filter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         description: Filter by series status
 *         example: "IN_PROGRESS"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page
 *         example: 10
 *     responses:
 *       200:
 *         description: Tournament Series list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tournament Series retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     series:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           seriesName:
 *                             type: string
 *                             example: "BGMI Championship Series"
 *                           game:
 *                             type: string
 *                             example: "BGMI"
 *                           totalMatches:
 *                             type: integer
 *                             example: 5
 *                           matchesCompleted:
 *                             type: integer
 *                             example: 3
 *                           status:
 *                             type: string
 *                             enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *                             example: "IN_PROGRESS"
 *                           currentMatchNumber:
 *                             type: integer
 *                             example: 4
 *                           isFinished:
 *                             type: boolean
 *                             example: false
 *                           winnerTeamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: integer
 *                       example: 25
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/series',
    validateRequest(listQuickSeriesQuerySchema, 'query'),
    QuickSeriesController.listUserSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}:
 *   put:
 *     tags: [Quick-PT]
 *     summary: Update Tournament Series
 *     description: Update tournament series details like name, scoring configuration, or status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "series_clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               seriesName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 pattern: '^[a-zA-Z0-9\s\-_]+$'
 *                 example: "BGMI Championship Series - Updated"
 *               game:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "BGMI"
 *               totalMatches:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 20
 *                 example: 7
 *               status:
 *                 type: string
 *                 enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *                 example: "IN_PROGRESS"
 *               positionPointsConfig:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 0
 *                   maximum: 100
 *                 minItems: 10
 *                 maxItems: 10
 *                 example: [20, 15, 12, 10, 8, 6, 4, 2, 1, 0]
 *               killPointsValue:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 10
 *                 example: 2
 *               scoringDescription:
 *                 type: string
 *                 maxLength: 200
 *                 example: "Updated tournament scoring rules"
 *     responses:
 *       200:
 *         description: Tournament Series updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tournament Series updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     seriesName:
 *                       type: string
 *                       example: "BGMI Championship Series - Updated"
 *                     game:
 *                       type: string
 *                       example: "BGMI"
 *                     totalMatches:
 *                       type: integer
 *                       example: 7
 *                     status:
 *                       type: string
 *                       example: "IN_PROGRESS"
 *                     positionPointsConfig:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [20, 15, 12, 10, 8, 6, 4, 2, 1, 0]
 *                     killPointsValue:
 *                       type: integer
 *                       example: 2
 *                     scoringDescription:
 *                       type: string
 *                       example: "Updated tournament scoring rules"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       404:
 *         description: Tournament Series not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.put('/series/:id',
    validateRequest(quickSeriesParamsSchema, 'params'),
    validateRequest(updateQuickSeriesSchema, 'body'),
    QuickSeriesController.updateTournamentSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete Tournament Series
 *     description: Permanently delete tournament series and all associated data (matches, leaderboards)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "series_clx123abc456"
 *     responses:
 *       200:
 *         description: Tournament Series deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Tournament Series deleted successfully"
 *       404:
 *         description: Tournament Series not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Tournament series not found"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete('/series/:id',
    validateRequest(quickSeriesParamsSchema, 'params'),
    QuickSeriesController.deleteTournamentSeries
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/leaderboard:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get Tournament Series Leaderboard
 *     description: Retrieve current leaderboard with team standings and aggregated scores across all completed matches
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament Series ID
 *         example: "clx123abc456"
 *     responses:
 *       200:
 *         description: Tournament Series leaderboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Series leaderboard retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     seriesId:
 *                       type: string
 *                     leaderboardData:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           totalPoints:
 *                             type: number
 *                             example: 85
 *                           matchesPlayed:
 *                             type: integer
 *                             example: 3
 *                           bestPosition:
 *                             type: integer
 *                             example: 1
 *                           worstPosition:
 *                             type: integer
 *                             example: 5
 *                           totalKills:
 *                             type: integer
 *                             example: 45
 *                           averagePosition:
 *                             type: number
 *                             example: 2.3
 *                           matchResults:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 matchOrder:
 *                                   type: integer
 *                                 quickMatchId:
 *                                   type: string
 *                                 position:
 *                                   type: integer
 *                                 kills:
 *                                   type: integer
 *                                 points:
 *                                   type: integer
 *                                 bonusPoints:
 *                                   type: integer
 *                     lastUpdatedMatch:
 *                       type: integer
 *                       example: 3
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Tournament Series leaderboard not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Series leaderboard not found"
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/series/:id/leaderboard',
    validateRequest(quickSeriesParamsSchema, 'params'),
    QuickSeriesController.getSeriesLeaderboard
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/results/manual:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create manual result entry
 *     description: Manually enter team result without AI processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
quickPTRouter.post('/matches/:id/results/manual',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(createManualResultSchema, 'body'),
    QuickPTController.createManualResult
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{quickMatchId}/results/{resultId}:
 *   put:
 *     tags: [Quick-PT]  
 *     summary: Update manual result
 *     security:
 *       - bearerAuth: []
 */
quickPTRouter.put('/matches/:quickMatchId/results/:resultId',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(updateManualResultSchema, 'body'),
    QuickPTController.updateManualResult
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{quickMatchId}/results/{resultId}:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete result
 *     security:
 *       - bearerAuth: []
 */
quickPTRouter.delete('/matches/:quickMatchId/results/:resultId',
    validateRequest(manualResultParamsSchema, 'params'),
    QuickPTController.deleteResult
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/results:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get all results for a match
 *     security:
 *       - bearerAuth: []
 */
quickPTRouter.get('/matches/:id/results',
    validateRequest(manualResultParamsSchema, 'params'),
    QuickPTController.getMatchResults
);

// ========================================
// BULK MANUAL RESULT ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/results/bulk:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create multiple manual results in bulk
 *     description: Create multiple team results at once with validation and conflict checking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
quickPTRouter.post('/matches/:id/results/bulk',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(bulkCreateManualResultsSchema, 'body'), 
    QuickPTController.createBulkManualResults
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/results/bulk:
 *   put:
 *     tags: [Quick-PT]
 *     summary: Update multiple results in bulk
 *     description: Update multiple team results at once
 *     security:
 *       - bearerAuth: []
 */
quickPTRouter.put('/matches/:id/results/bulk',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(bulkUpdateManualResultsSchema, 'body'),
    QuickPTController.updateBulkManualResults
);

/**
 * @swagger  
 * /api/v1/quick-pt/matches/{id}/results/bulk:
 *   delete:
 *     tags: [Quick-PT]
 *     summary: Delete multiple results in bulk
 *     description: Delete multiple team results at once
 *     security:
 *       - bearerAuth: []
 */
quickPTRouter.delete('/matches/:id/results/bulk',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(bulkDeleteManualResultsSchema, 'body'),
    QuickPTController.deleteBulkManualResults
);

// ========================================
// TIE-BREAKING ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/conflicts/detect:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Detect points conflicts in match results
 *     description: Analyze match results to identify teams with identical points that need tie-breaking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceRefresh:
 *                 type: boolean
 *                 default: false
 *               includeResolved:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Conflicts detected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     hasConflicts:
 *                       type: boolean
 *                     conflictGroups:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Match not found
 */
quickPTRouter.post('/matches/:id/conflicts/detect',
    validateRequest(matchIdParamSchema, 'params'),
    validateRequest(detectConflictsSchema, 'body'),
    QuickPTController.detectPointsConflicts
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/conflicts/resolve:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Resolve points conflicts manually
 *     description: Manually resolve conflicts by providing custom team ordering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - conflictGroupId
 *               - userDefinedOrder
 *             properties:
 *               conflictGroupId:
 *                 type: string
 *                 format: uuid
 *               userDefinedOrder:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 minItems: 2
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Conflicts resolved successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Match not found
 */
quickPTRouter.post('/matches/:id/conflicts/resolve',
    validateRequest(matchIdParamSchema, 'params'),
    validateRequest(resolveConflictsSchema, 'body'),
    QuickPTController.resolvePointsConflicts
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/tie-breaking/rules:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Set tie-breaking rules for a match
 *     description: Configure automatic tie-breaking rules for resolving conflicts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rules
 *             properties:
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - type
 *                     - priority
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [KILL_POINTS, PLACEMENT_POINTS, TOTAL_POINTS, CUSTOM_FIELD, MANUAL]
 *                     priority:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 10
 *                     ascending:
 *                       type: boolean
 *                       default: false
 *                     fieldName:
 *                       type: string
 *                     description:
 *                       type: string
 *                 minItems: 1
 *                 maxItems: 5
 *               autoResolveEnabled:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Tie-breaking rules set successfully
 *       400:
 *         description: Invalid rule configuration
 *       404:
 *         description: Match not found
 */
quickPTRouter.post('/matches/:id/tie-breaking/rules',
    validateRequest(matchIdParamSchema, 'params'),
    validateRequest(tieBreakingRulesWithValidationSchema, 'body'),
    QuickPTController.setTieBreakingRules
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/tie-breaking/config:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get tie-breaking configuration for a match
 *     description: Retrieve current tie-breaking rules and configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *     responses:
 *       200:
 *         description: Tie-breaking configuration retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     entityId:
 *                       type: string
 *                       format: uuid
 *                     entityType:
 *                       type: string
 *                       enum: [match, series]
 *                     rules:
 *                       type: array
 *                     autoResolveEnabled:
 *                       type: boolean
 *       404:
 *         description: Match not found
 */
quickPTRouter.get('/matches/:id/tie-breaking/config',
    validateRequest(matchIdParamSchema, 'params'),
    QuickPTController.getTieBreakingConfig
);

// ========================================
// SERIES TIE-BREAKING ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/conflicts/detect:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Detect conflicts in series standings
 *     description: Analyze series standings to identify teams with identical points that need tie-breaking
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Series ID
 *     responses:
 *       200:
 *         description: Series conflicts detected successfully
 *       404:
 *         description: Series not found
 */
quickPTRouter.post('/series/:id/conflicts/detect',
    validateRequest(seriesIdParamSchema, 'params'),
    QuickPTController.detectSeriesConflicts
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/tie-breaking/rules:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Set tie-breaking rules for a series
 *     description: Configure automatic tie-breaking rules for series standings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Series ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rules
 *             properties:
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - type
 *                     - priority
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [KILL_POINTS, PLACEMENT_POINTS, TOTAL_POINTS, CUSTOM_FIELD, MANUAL]
 *                     priority:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 10
 *                     ascending:
 *                       type: boolean
 *                       default: false
 *                     fieldName:
 *                       type: string
 *                     description:
 *                       type: string
 *                 minItems: 1
 *                 maxItems: 5
 *               autoResolveEnabled:
 *                 type: boolean
 *                 default: true
 *               applyToAllMatches:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Series tie-breaking rules set successfully
 *       400:
 *         description: Invalid rule configuration
 *       404:
 *         description: Series not found
 */
quickPTRouter.post('/series/:id/tie-breaking/rules',
    validateRequest(seriesIdParamSchema, 'params'),
    validateRequest(setSeriesTieBreakingRulesSchema, 'body'),
    QuickPTController.setSeriesTieBreakingRules
);

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/tie-breaking/config:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Get tie-breaking configuration for a series
 *     description: Retrieve current series tie-breaking rules and configuration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Series ID
 *     responses:
 *       200:
 *         description: Series tie-breaking configuration retrieved
 *       404:
 *         description: Series not found
 */
quickPTRouter.get('/series/:id/tie-breaking/config',
    validateRequest(seriesIdParamSchema, 'params'),
    QuickPTController.getSeriesTieBreakingConfig
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/crops/generate:
 *   post:
 *     tags: [Quick-PT Crops]
 *     summary: Generate crops from screenshot
 *     description: |
 *       Processes a screenshot through Python AI API to generate crop images.
 *       
 *       **Process Flow:**
 *       1. Sends screenshot URL to Python AI API
 *       2. Python API generates and stores crops in R2 storage
 *       3. Backend stores crop metadata in database  
 *       4. Returns signed URLs for crop access (30-minute expiry)
 *       
 *       **Crop Types:**
 *       - `kill_feed`: Kill feed/elimination log crops
 *       - `leaderboard`: Match leaderboard/ranking crops
 *       - `attendance`: Player attendance list crops
 *       - Auto-detected if not specified
 *       
 *       **Authentication:** Requires valid JWT token
 *       **Authorization:** User must own the match
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Quick Match ID
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "12345678-1234-1234-1234-123456789012"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateCropsRequest'
 *           examples:
 *             basic:
 *               summary: Generate all crop types
 *               value:
 *                 screenshotUrl: "https://storage.example.com/screenshots/result_1703859600.png"
 *             specific:
 *               summary: Generate specific crop type
 *               value:
 *                 screenshotUrl: "https://storage.example.com/screenshots/result_1703859600.png"
 *                 cropType: "kill_feed"
 *     responses:
 *       201:
 *         description: Crops generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CropStorageResponse'
 *             examples:
 *               success:
 *                 summary: Successful crop generation
 *                 value:
 *                   success: true
 *                   message: "Crops generated successfully"
 *                   data:
 *                     crops:
 *                       - id: "clh1234567890abcdef"
 *                         cropType: "kill_feed"
 *                         signedUrl: "https://storage.example.com/crops/signed?token=..."
 *                         expiresAt: "2024-01-15T11:00:00.000Z"
 *                         cropMetadata: { x: 100, y: 150, width: 300, height: 200 }
 *                       - id: "clh0987654321fedcba"
 *                         cropType: "leaderboard"
 *                         signedUrl: "https://storage.example.com/crops/signed?token=..."
 *                         expiresAt: "2024-01-15T11:00:00.000Z"
 *                         cropMetadata: { x: 50, y: 300, width: 400, height: 250 }
 *                     totalCrops: 2
 *                   meta:
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                     version: "1.0"
 *       400:
 *         description: Validation error or crop generation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         description: Match not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
quickPTRouter.post(
    '/matches/:id/crops/generate',
    validateRequest(cropParamsSchema, 'params'),
    validateRequest(generateCropsSchema, 'body'),
    CropStorageController.generateCrops
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/crops:
 *   get:
 *     tags: [Quick-PT Crops]
 *     summary: Get all crops for a match
 *     description: |
 *       Retrieves all crop metadata for a match with fresh signed URLs.
 *       
 *       **Features:**
 *       - Returns all active crops for the match
 *       - Generates fresh signed URLs (30-minute expiry)
 *       - Includes crop metadata and coordinates
 *       - Cached for performance (10-minute cache TTL)
 *       
 *       **Authentication:** Requires valid JWT token
 *       **Authorization:** User must own the match
 *       
 *       **Signed URL Expiry:** 30 minutes from generation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Quick Match ID
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "12345678-1234-1234-1234-123456789012"
 *     responses:
 *       200:
 *         description: Crops retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CropStorageResponse'
 *             examples:
 *               with_crops:
 *                 summary: Match has crops available
 *                 value:
 *                   success: true
 *                   message: "Crops retrieved successfully"
 *                   data:
 *                     crops:
 *                       - id: "clh1234567890abcdef"
 *                         cropType: "kill_feed"
 *                         signedUrl: "https://storage.example.com/crops/signed?token=..."
 *                         expiresAt: "2024-01-15T11:00:00.000Z"
 *                         cropMetadata: { x: 100, y: 150, width: 300, height: 200 }
 *                     totalCrops: 1
 *                   meta:
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                     version: "1.0"
 *               no_crops:
 *                 summary: No crops available for match
 *                 value:
 *                   success: true
 *                   message: "Crops retrieved successfully"
 *                   data:
 *                     crops: []
 *                     totalCrops: 0
 *                   meta:
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                     version: "1.0"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         description: Match not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
quickPTRouter.get(
    '/matches/:id/crops',
    validateRequest(cropParamsSchema, 'params'),
    CropStorageController.getMatchCrops
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/crops/{cropId}/download:
 *   get:
 *     tags: [Quick-PT Crops]
 *     summary: Get fresh signed URL for specific crop
 *     description: |
 *       Generates a fresh signed URL for accessing a specific crop image.
 *       
 *       **Use Cases:**
 *       - Refresh expired signed URLs  
 *       - Direct crop access for Android/Web apps
 *       - Download specific crop images
 *       
 *       **Authentication:** Requires valid JWT token
 *       **Authorization:** User must own the match
 *       
 *       **Signed URL:** Valid for 30 minutes from generation
 *       **Compatible:** Android WebView and Web browsers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: Quick Match ID
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "12345678-1234-1234-1234-123456789012"
 *       - name: cropId
 *         in: path
 *         required: true
 *         description: Crop ID
 *         schema:
 *           type: string
 *           example: "clh1234567890abcdef"
 *     responses:
 *       200:
 *         description: Crop download URL generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Crop download URL generated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     cropId:
 *                       type: string
 *                       example: "clh1234567890abcdef"
 *                     signedUrl:
 *                       type: string
 *                       format: uri
 *                       example: "https://storage.example.com/crops/signed?token=..."
 *                       description: "Direct download URL valid for 30 minutes"
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:00:00.000Z"
 *                       description: "URL expiration timestamp"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *             examples:
 *               success:
 *                 summary: Successful URL generation
 *                 value:
 *                   success: true
 *                   message: "Crop download URL generated"
 *                   data:
 *                     cropId: "clh1234567890abcdef"
 *                     signedUrl: "https://storage.example.com/crops/signed?token=eyJ..."
 *                     expiresAt: "2024-01-15T11:00:00.000Z"
 *                   meta:
 *                     timestamp: "2024-01-15T10:30:00.000Z"
 *                     version: "1.0"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         description: Crop not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServerErrorResponse'
 */
quickPTRouter.get(
    '/matches/:id/crops/:cropId/download',
    validateRequest(cropDownloadParamsSchema, 'params'),
    CropStorageController.getCropDownloadUrl
);

export default quickPTRouter;