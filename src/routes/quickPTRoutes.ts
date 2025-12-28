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

import { QuickSeriesController } from '../controllers/quickSeriesController';
import {
    createQuickSeriesSchema,
    addMatchToSeriesSchema,
    quickSeriesParamsSchema,
    updateQuickSeriesSchema,
    listQuickSeriesQuerySchema
} from '../validations/quickSeriesValidation';

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
    validateRequest(uploadQuickScreenshotSchema), // Validate body (pageNumber)
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
 *     summary: Generate and export points table
 *     description: Generate formatted points table image via Python API and save to R2
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
 *                 description: Visual template for the points table
 *                 default: default
 *                 example: "default"
 *     responses:
 *       200:
 *         description: Points table generated and exported successfully
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
 *                   example: "Points table exported successfully"
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
 *                       items:
 *                         type: object
 *                         properties:
 *                           rank:
 *                             type: integer
 *                           teamName:
 *                             type: string
 *                           position:
 *                             type: integer
 *                           kills:
 *                             type: integer
 *                           totalPoints:
 *                             type: integer
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
 *     summary: Get Python AI API health status
 *     description: Get overall health status of the Python AI processing API
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
 *                       example: "healthy"
 *                     message:
 *                       type: string
 *                       example: "All systems operational"
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
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateQuickSeries'
 *     responses:
 *       201:
 *         description: Tournament Series created successfully
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AddMatchToSeries'
 *     responses:
 *       201:
 *         description: Match added to series successfully
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
 *     description: List all matches that belong to this tournament series
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Series matches retrieved successfully
 *       404:
 *         description: Tournament Series not found
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tournament Series retrieved successfully
 *       404:
 *         description: Tournament Series not found
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [CREATED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         description: Filter by series status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Tournament Series list retrieved successfully
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateQuickSeries'
 *     responses:
 *       200:
 *         description: Tournament Series updated successfully
 *       404:
 *         description: Tournament Series not found
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tournament Series deleted successfully
 *       404:
 *         description: Tournament Series not found
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
export default quickPTRouter;