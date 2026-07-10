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
    listQuickScreenshotsQuerySchema,
    deleteQuickScreenshotSchema
} from '../validations/quickScreenshotValidation';
import {
    quickResultParamsSchema,
    exportPointsTableSchema
} from '../validations/quickResultValidation';
import {
    setTieBreakingRulesSchema,
    resolveConflictsSchema,
    resolveSeriesConflictsSchema,
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
    quickMatchResultParamsSchema,
    bulkCreateManualResultsSchema,
    bulkUpdateManualResultsSchema,
    bulkDeleteManualResultsSchema
} from '../validations/manualResultValidation';

import { CropStorageController } from '../controllers/cropStorageController';
import {
    cropParamsSchema
} from '../validations/cropValidation';
import { excelExportParamsSchema, excelExportSchema, excelExportSeriesParamsSchema } from '../validations/excelExportValidation';
import { TeamLogoPresetController } from '../controllers/teamLogoPresetController';
import { assignPresetEntrySchema } from '../validations/teamLogoPresetValidation';
import { slotListGraphicSchema } from '../validations/slotListValidation';
import { rosterGraphicSchema } from '../validations/rosterValidation';
import { top10GraphicSchema } from '../validations/top10Validation';
import { MediaAssetController } from '../controllers/mediaAssetController';
import { StoredFileController } from '../controllers/storedFileController';
import {
    storedFileParamsSchema,
    storedFileQuerySchema,
} from '../validations/storedFileValidation';
import multer from 'multer';

const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Allowed: jpeg, png, webp'));
        }
        cb(null, true);
    },
});

/**
 * @swagger
 * tags:
 *   - name: Quick-PT
 *     description: Quick Points Table generation for esports matches
 */

const quickPTRouter = express.Router();

quickPTRouter.get('/media/:assetId', authenticateUser, MediaAssetController.streamMedia);

quickPTRouter.get(
    '/files/:fileId',
    validateRequest(storedFileParamsSchema, 'params'),
    validateRequest(storedFileQuerySchema, 'query'),
    StoredFileController.streamFile,
);

// Apply authentication to all other Quick-PT routes
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
 *                       logoPresetEntryId:
 *                         type: string
 *                         nullable: true
 *                       matchLogoStorageUrl:
 *                         type: string
 *                         nullable: true
 *                       presetLogoStorageUrl:
 *                         type: string
 *                         nullable: true
 *                       logoStorageUrl:
 *                         type: string
 *                         nullable: true
 *                       previewUrl:
 *                         type: string
 *                         nullable: true
 *                         description: Signed /api/v1/quick-pt/files/{fileId}?exp=&sig= URL for effective logo
 *                       signedUrl:
 *                         type: string
 *                         nullable: true
 *                       signedLogoUrl:
 *                         type: string
 *                         nullable: true
 *                       expiresAt:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                       previewUrlExpiresInSeconds:
 *                         type: integer
 *                         nullable: true
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

quickPTRouter.delete(
    '/matches/:id/slots/:slotId',
    validateRequest(quickMatchParamsSchema, 'params'),  // validates :id only
    QuickPTController.deleteSlot
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
 *               - screenshots
 *             properties:
 *               screenshots:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Screenshot image files (PNG, JPG, JPEG, WebP) - Max 10 files, 10MB each
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
    validateRequest(deleteQuickScreenshotSchema, 'body'),
    QuickPTController.deleteScreenshot
);

// ========================================
// PROCESSING ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/process:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Process match screenshots with Python AI
 *     description: |
 *       Unified endpoint for all screenshot processing.
 *       - **ATTENDANCE** — batch OCR; detects slot numbers and player rosters.
 *       - **RESULT** — batch OCR; extracts ranks, per-player kills, matches slots, saves results.
 *       - **COMPLETE** (default) — runs ATTENDANCE then RESULT in sequence.
 *
 *       **Android — per-player finishes:** After RESULT/COMPLETE, read either:
 *       - `data.audit.saved[].playerResults[]` (summary audit), or
 *       - `data.results[].playerResults[]` (full persisted rows, same as GET /results).
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
 *               type:
 *                 type: string
 *                 enum: [ATTENDANCE, RESULT, COMPLETE]
 *                 default: COMPLETE
 *                 description: Which processing step to run
 *                 example: "COMPLETE"
 *     responses:
 *       200:
 *         description: Processing completed successfully
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
 *                 data:
 *                   oneOf:
 *                     - type: object
 *                       title: AttendanceProcessingResult
 *                       properties:
 *                         success: { type: boolean }
 *                         slotsDetected: { type: integer }
 *                         slotsCreated: { type: integer }
 *                         warnings: { type: array, items: { type: object } }
 *                         processingTimeMs: { type: integer }
 *                         audit:
 *                           type: object
 *                           properties:
 *                             ocrMode: { type: string, enum: [batch] }
 *                             imagesProcessed: { type: integer }
 *                             rawTeams: { type: integer }
 *                             mergedSlots: { type: integer }
 *                     - type: object
 *                       title: ResultProcessingResult
 *                       properties:
 *                         success: { type: boolean }
 *                         resultsCreated: { type: integer }
 *                         resultsProcessed: { type: integer }
 *                         warnings: { type: array, items: { type: object } }
 *                         processingTimeMs: { type: integer }
 *                         audit:
 *                           type: object
 *                           properties:
 *                             ocrMode: { type: string, enum: [per_image, batch, per_image_fallback] }
 *                             matched: { type: integer }
 *                             saved:
 *                               type: array
 *                               items:
 *                                 type: object
 *                                 properties:
 *                                   slotNumber: { type: integer }
 *                                   rank: { type: integer }
 *                                   teamName: { type: string }
 *                                   totalKills: { type: integer }
 *                                   matchScore: { type: string, example: "4/4" }
 *                                   playerResults:
 *                                     type: array
 *                                     items:
 *                                       type: object
 *                                       properties:
 *                                         playerName: { type: string }
 *                                         kills: { type: integer }
 *                         results:
 *                           type: array
 *                           description: Full match results with per-player kills
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               slotNumber: { type: integer }
 *                               teamName: { type: string }
 *                               rank: { type: integer }
 *                               totalKills: { type: integer }
 *                               totalPoints: { type: integer }
 *                               playerResults:
 *                                 type: array
 *                                 items:
 *                                   type: object
 *                                   properties:
 *                                     playerName: { type: string }
 *                                     kills: { type: integer }
 *                     - type: object
 *                       title: CompleteProcessingResult
 *                       properties:
 *                         success: { type: boolean }
 *                         attendanceResult: { type: object }
 *                         resultProcessingResult:
 *                           type: object
 *                           description: Same shape as ResultProcessingResult (includes results + audit.saved[].playerResults)
 *                         totalProcessingTimeMs: { type: integer }
 *                 meta:
 *                   type: object
 *       400:
 *         description: No screenshots found, wrong image type, or invalid type param
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/process',
    validateRequest(quickMatchParamsSchema, 'params'),
    QuickPTController.processImages
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
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           slotNumber:
 *                             type: integer
 *                             example: 1
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           position:
 *                             type: integer
 *                             example: 1
 *                           rank:
 *                             type: integer
 *                             example: 1
 *                           totalKills:
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
 *                           playerResults:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 playerName:
 *                                   type: string
 *                                   example: "Player1"
 *                                 kills:
 *                                   type: integer
 *                                   example: 5
 *                           status:
 *                             type: string
 *                             enum: [PENDING, PROCESSED, VERIFIED, MANUAL_ENTRY]
 *                           needsReview:
 *                             type: boolean
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     count:
 *                       type: integer
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
 *     summary: Generate and export standings image (full customization)
 *     description: |
 *       Generate a professional standings / points-table PNG by calling the Python AI service.
 *       Team logos are resolved automatically — match-specific logo takes priority over any preset logo.
 *
 *       **Logo resolution order:** match logo → preset entry logo → no logo (API placeholder)
 *
 *       **`tableHeaderLabelMode` values:**
 *       - `full`    — MATCHES / POSITION / FINISHES / TOTAL
 *       - `abbr`    — MAT / POS / FIN / TOT
 *       - `initial` — M / P / F / T
 *       - `compact` — M / PP / FP / T — hides WWCD column; chicken icons render inline after team name
 *
 *       **`font_customization` role keys:** `header_font`, `sponsor_font`, `organiser_font`,
 *       `table_header_font`, `table_data_font`, `team_name_font`, `footer_font`, `branding_font`
 *
 *       **Signed URLs** are valid for 30 minutes.
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 default: "tmplate_1"
 *                 description: Template name stored in R2 (e.g. tmplate_1, tmplate_2)
 *                 example: "tmplate_2"
 *               formatType:
 *                 type: string
 *                 default: "24_teams"
 *                 enum: ["8_teams", "16_teams", "24_teams"]
 *                 description: Must match actual number of teams in the match
 *               outputFilename:
 *                 type: string
 *                 description: Custom PNG output filename
 *                 example: "day1_standings.png"
 *               tableFontSize:
 *                 type: number
 *                 description: Font size for all data-row columns (px)
 *                 example: 75
 *               tableHeaderFontSize:
 *                 type: number
 *                 description: Font size for header row (px)
 *                 example: 65
 *               tableHeaderLabelMode:
 *                 type: string
 *                 enum: ["full", "abbr", "initial", "compact"]
 *                 description: Header label preset — use compact to show chicken icons inline
 *                 example: "compact"
 *               tableHeaderColumnPadding:
 *                 type: number
 *                 description: Minimum spacing between header labels (0–80)
 *                 example: 12
 *               rowHeightAdjust:
 *                 type: number
 *                 description: Add/subtract px from each row height (-200 to 200)
 *                 example: -30
 *               teamLogoSize:
 *                 type: number
 *                 description: Square logo size in px (8–200)
 *                 example: 155
 *               teamLogoSizeAdjust:
 *                 type: number
 *                 description: Fine-tune logo size after teamLogoSize (-80 to 80)
 *                 example: 0
 *               teamLogoGap:
 *                 type: number
 *                 description: Gap between logo and team name (0–80)
 *                 example: 4
 *               teamShiftRight:
 *                 type: number
 *                 description: Shift logo + name + icon block to the right (0–500)
 *                 example: 80
 *               chickenDinnerIconSize:
 *                 type: number
 *                 description: Win icon size in px (8–200)
 *                 example: 140
 *               chickenIconGap:
 *                 type: number
 *                 description: Gap after team name before win icon (0–40)
 *                 example: 8
 *               eventName:
 *                 type: string
 *                 description: Override event name text
 *                 example: "BGMI FINALS — DAY 2"
 *               organiserName:
 *                 type: string
 *                 description: Override organiser name text
 *                 example: "Scrymz Esports"
 *               sponsorName:
 *                 type: string
 *                 description: Override sponsor name text
 *                 example: "Powered by XYZ"
 *               elementOverrides:
 *                 type: object
 *                 description: |
 *                   Patch font size/color on named header/footer elements.
 *                   Valid keys: event_name, sponsor_name, organiser_name, week_info, day_info, live_indicator
 *                 example:
 *                   event_name: { size: 85, color: "#FFFFFF" }
 *                   sponsor_name: { size: 55, color: "#FFD700" }
 *               columnOverrides:
 *                 type: object
 *                 description: |
 *                   Per-column font/color for headers and data rows.
 *                   Valid keys: rank, team_name, team, matches, position, kills, total
 *                 example:
 *                   rank: { color: "#E0E0E0" }
 *                   team_name: { color: "#FFB74D", weight: "bold" }
 *                   total: { color: "#FFD700", weight: "bold" }
 *               fontCustomization:
 *                 type: object
 *                 description: |
 *                   Override fonts per role. Use font IDs from GET /api/v1/quick-pt/fonts.
 *                   Each role supports: font_file, family, weight, size, color, alignment.
 *                 properties:
 *                   header_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "built_titling_bd.ttf" }
 *                       color: { type: string, example: "#FFFFFF" }
 *                   sponsor_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "agency.ttf" }
 *                       color: { type: string, example: "#FFD700" }
 *                   organiser_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "california.otf" }
 *                   table_header_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "akira_expanded.otf" }
 *                   table_data_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "coolvetica_rg.ttf" }
 *                   team_name_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "roboto_condensed_black.ttf" }
 *                       color: { type: string, example: "#FFB74D" }
 *                   footer_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "coolvetica_rg.ttf" }
 *                   branding_font:
 *                     type: object
 *                     properties:
 *                       font_file: { type: string, example: "agency_bold.ttf" }
 *                   global_size_multiplier:
 *                     type: number
 *                     minimum: 0.1
 *                     maximum: 10
 *                     description: Multiply all rendered font sizes
 *                     example: 1.0
 *               advancedConfig:
 *                 type: object
 *                 description: |
 *                   Partial JSON merged on top of templateConfigUrl. Use for one-off tweaks
 *                   without re-uploading coordinate JSON.
 *                 example:
 *                   header:
 *                     event_name: { text: "FINALS DAY 2", enabled: true }
 *               showBranding:
 *                 type: boolean
 *                 description: Show/hide the branding line defined in coordinate JSON
 *                 example: true
 *     responses:
 *       200:
 *         description: Standings image generated and exported successfully
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
 *                   example: "Standings exported successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pointsTableId:
 *                       type: string
 *                     signedImageUrl:
 *                       type: string
 *                       description: Signed URL for the first image (valid 30 min)
 *                     imageCount:
 *                       type: integer
 *                       description: 1 for ≤16 teams, 2 for 17-24 teams (overflow page)
 *                       example: 1
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           part: { type: integer }
 *                           label: { type: string, enum: [main, overflow] }
 *                           signedUrl: { type: string }
 *                           teamCount: { type: integer }
 *                     totalTeams:
 *                       type: integer
 *                     template:
 *                       type: string
 *                     formatType:
 *                       type: string
 *                     generationTimeMs:
 *                       type: integer
 *       400:
 *         description: No results available or validation error
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
 * /api/v1/quick-pt/series:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Create Tournament Series
 *     description: |
 *       Create a tournament series to group multiple matches and track overall standings.
 *
 *       Scoring is configured on each Quick Match — not on the series. Only
 *       `seriesName`, `game`, and `totalMatches` are accepted here.
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
 *     description: Update series name, game, planned match count, or status (no scoring fields)
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
 * /api/v1/quick-pt/series/{id}/export/excel:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Export series leaderboard to Excel
 *     description: Single-sheet Series Report (slot mapping, series details, aggregated rankings). Optional query param customFilename.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: customFilename
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Excel export generated
 *       400:
 *         description: No leaderboard data
 */

/**
 * @swagger
 * /api/v1/quick-pt/series/{id}/export:
 *   post:
 *     tags: [Quick-PT]
 *     summary: Export series overall standings image (full customization)
 *     description: |
 *       Generates a standings PNG for the full series leaderboard by calling the Python AI service.
 *       Same customization surface as match export — all logo, font, layout, and override fields apply.
 *       Team logos are resolved per slot (match logo → preset logo → none).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Series ID
 *         example: "clx123series456"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template:
 *                 type: string
 *                 default: "tmplate_1"
 *                 example: "tmplate_2"
 *               formatType:
 *                 type: string
 *                 default: "24_teams"
 *                 enum: ["8_teams", "16_teams", "24_teams"]
 *               outputFilename:
 *                 type: string
 *                 example: "series_overall_standings.png"
 *               tableFontSize:
 *                 type: number
 *                 example: 75
 *               tableHeaderFontSize:
 *                 type: number
 *                 example: 65
 *               tableHeaderLabelMode:
 *                 type: string
 *                 enum: ["full", "abbr", "initial", "compact"]
 *                 example: "compact"
 *               tableHeaderColumnPadding:
 *                 type: number
 *                 example: 12
 *               rowHeightAdjust:
 *                 type: number
 *                 example: -30
 *               teamLogoSize:
 *                 type: number
 *                 description: Square logo size in px (8–200)
 *                 example: 155
 *               teamLogoSizeAdjust:
 *                 type: number
 *                 description: Fine-tune after teamLogoSize (-80 to 80)
 *                 example: 0
 *               teamLogoGap:
 *                 type: number
 *                 description: Gap between logo and team name (0–80)
 *                 example: 4
 *               teamShiftRight:
 *                 type: number
 *                 description: Shift logo+name block right (0–500)
 *                 example: 80
 *               chickenDinnerIconSize:
 *                 type: number
 *                 description: Win icon size in px (8–200)
 *                 example: 140
 *               chickenIconGap:
 *                 type: number
 *                 description: Gap after team name before win icon (0–40)
 *                 example: 8
 *               eventName:
 *                 type: string
 *                 example: "OVERALL STANDINGS — SERIES 1"
 *               organiserName:
 *                 type: string
 *                 example: "Scrymz Esports"
 *               sponsorName:
 *                 type: string
 *                 example: "Powered by XYZ"
 *               elementOverrides:
 *                 type: object
 *                 description: "Valid keys: event_name, sponsor_name, organiser_name, week_info, day_info, live_indicator"
 *                 example:
 *                   event_name: { size: 85, color: "#FFFFFF" }
 *               columnOverrides:
 *                 type: object
 *                 description: "Valid keys: rank, team_name, team, matches, position, kills, total"
 *                 example:
 *                   total: { color: "#FFD700", weight: "bold" }
 *               fontCustomization:
 *                 type: object
 *                 description: Override fonts per role. Get font IDs from GET /api/v1/quick-pt/fonts
 *                 properties:
 *                   header_font: { type: object, properties: { font_file: { type: string }, color: { type: string } } }
 *                   sponsor_font: { type: object, properties: { font_file: { type: string }, color: { type: string } } }
 *                   organiser_font: { type: object, properties: { font_file: { type: string }, color: { type: string } } }
 *                   table_header_font: { type: object, properties: { font_file: { type: string } } }
 *                   table_data_font: { type: object, properties: { font_file: { type: string } } }
 *                   team_name_font: { type: object, properties: { font_file: { type: string }, color: { type: string } } }
 *                   footer_font: { type: object, properties: { font_file: { type: string } } }
 *                   branding_font: { type: object, properties: { font_file: { type: string } } }
 *                   global_size_multiplier: { type: number, minimum: 0.1, maximum: 10, example: 1.0 }
 *               advancedConfig:
 *                 type: object
 *                 description: Partial JSON merged on top of coordinate config for one-off tweaks
 *               showBranding:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Series standings image generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Series standings exported successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     seriesId: { type: string }
 *                     signedImageUrl: { type: string, description: "Signed URL valid 30 min" }
 *                     imageCount: { type: integer, example: 1 }
 *                     images:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           part: { type: integer }
 *                           label: { type: string, enum: [main, overflow] }
 *                           signedUrl: { type: string }
 *                           teamCount: { type: integer }
 *                     totalTeams: { type: integer }
 *                     template: { type: string }
 *                     formatType: { type: string }
 *                     generationTimeMs: { type: integer }
 *       400:
 *         description: No leaderboard data or validation error
 *       404:
 *         description: Series not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post('/series/:id/export',
    validateRequest(quickSeriesParamsSchema, 'params'),
    validateRequest(exportPointsTableSchema),
    QuickSeriesController.exportSeriesLeaderboard
);

quickPTRouter.get('/series/:id/export/excel',
    validateRequest(excelExportSeriesParamsSchema, 'params'),
    validateRequest(excelExportSchema, 'query'),
    QuickSeriesController.exportSeriesToExcel
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
 *         description: Quick Match ID
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
 *               - position
 *               - totalKills
 *             properties:
 *               slotNumber:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 25
 *                 example: 1
 *                 description: Team's slot number in the match
 *               teamName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Team Alpha"
 *                 description: Team name
 *               position:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 25
 *                 example: 1
 *                 description: Final placement/rank in match
 *               totalKills:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 99
 *                 example: 12
 *                 description: Total kills achieved by team
 *               playerResults:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - playerName
 *                     - kills
 *                   properties:
 *                     playerName:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 50
 *                       example: "Player1"
 *                     kills:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 99
 *                       example: 5
 *                 minItems: 1
 *                 maxItems: 4
 *                 description: Individual player kill breakdown (optional)
 *               entryNotes:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Manual entry due to OCR issues"
 *                 description: Optional notes about the entry
 *     responses:
 *       201:
 *         description: Manual result created successfully
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
 *                   example: "Manual result created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "result_xyz789"
 *                     slotNumber:
 *                       type: integer
 *                       example: 1
 *                     teamName:
 *                       type: string
 *                       example: "Team Alpha"
 *                     position:
 *                       type: integer
 *                       example: 1
 *                     totalKills:
 *                       type: integer
 *                       example: 12
 *                     positionPoints:
 *                       type: integer
 *                       example: 15
 *                     killPoints:
 *                       type: integer
 *                       example: 12
 *                     totalPoints:
 *                       type: integer
 *                       example: 27
 *                     source:
 *                       type: string
 *                       example: "MANUAL_ENTRY"
 *                     entryMethod:
 *                       type: string
 *                       example: "INDIVIDUAL"
 *       400:
 *         description: Validation error or constraint violation
 *       404:
 *         description: Quick Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post('/matches/:id/results/manual',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(createManualResultSchema, 'body'),
    QuickPTController.createManualResult
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
 *         description: Quick Match ID
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - results
 *             properties:
 *               results:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 25
 *                 items:
 *                   type: object
 *                   required:
 *                     - slotNumber
 *                     - teamName
 *                     - position
 *                     - totalKills
 *                   properties:
 *                     slotNumber:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 25
 *                       example: 1
 *                     teamName:
 *                       type: string
 *                       minLength: 2
 *                       maxLength: 50
 *                       example: "Team Alpha"
 *                     position:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 25
 *                       example: 1
 *                     totalKills:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 99
 *                       example: 12
 *                     playerResults:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           playerName:
 *                             type: string
 *                             example: "Player1"
 *                           kills:
 *                             type: integer
 *                             example: 5
 *                       maxItems: 4
 *                     entryNotes:
 *                       type: string
 *                       maxLength: 500
 *                       example: "Bulk import from spreadsheet"
 *                 example:
 *                   - slotNumber: 1
 *                     teamName: "Team Alpha"
 *                     position: 1
 *                     totalKills: 12
 *                   - slotNumber: 2
 *                     teamName: "Team Beta"
 *                     position: 2
 *                     totalKills: 10
 *               replaceExisting:
 *                 type: boolean
 *                 default: false
 *                 description: Replace all existing results for this match
 *                 example: false
 *               validateConstraints:
 *                 type: boolean
 *                 default: true
 *                 description: Validate position/slot conflicts before creation
 *                 example: true
 *     responses:
 *       201:
 *         description: Bulk results created successfully
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
 *                   example: "Bulk results created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     created:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Successfully created results
 *                     updated:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Updated results (empty for creation)
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                           code:
 *                             type: string
 *                           message:
 *                             type: string
 *                       description: Validation or processing errors
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 2
 *                         successful:
 *                           type: integer
 *                           example: 2
 *                         failed:
 *                           type: integer
 *                           example: 0
 *       207:
 *         description: Bulk operation completed with partial success
 *       400:
 *         description: Validation error or all operations failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - updates
 *             properties:
 *               updates:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 25
 *                 items:
 *                   type: object
 *                   required:
 *                     - resultId
 *                     - data
 *                   properties:
 *                     resultId:
 *                       type: string
 *                       format: uuid
 *                       example: "result_abc123"
 *                       description: ID of result to update
 *                     data:
 *                       type: object
 *                       properties:
 *                         teamName:
 *                           type: string
 *                           minLength: 2
 *                           maxLength: 50
 *                           example: "Team Alpha Updated"
 *                         position:
 *                           type: integer
 *                           minimum: 1
 *                           maximum: 25
 *                           example: 2
 *                         totalKills:
 *                           type: integer
 *                           minimum: 0
 *                           maximum: 99
 *                           example: 15
 *                         playerResults:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               playerName:
 *                                 type: string
 *                                 example: "Player1"
 *                               kills:
 *                                 type: integer
 *                                 example: 8
 *                           maxItems: 4
 *                         entryNotes:
 *                           type: string
 *                           maxLength: 500
 *                           example: "Updated from final review"
 *                       description: At least one field must be provided for each update
 *                 example:
 *                   - resultId: "result_abc123"
 *                     data:
 *                       position: 2
 *                       totalKills: 15
 *                   - resultId: "result_xyz789"
 *                     data:
 *                       teamName: "Team Beta Updated"
 *                       totalKills: 18
 *     responses:
 *       200:
 *         description: Bulk results updated successfully
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
 *                   example: "Bulk results updated successfully"
 *                 data:
 *                   type: object
 *                   description: Bulk operation result details
 *       207:
 *         description: Bulk update completed with partial success
 *       400:
 *         description: Validation error or all updates failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
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
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Quick Match ID
 *         example: "clx123abc456"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resultIds
 *             properties:
 *               resultIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 25
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["result_abc123", "result_xyz789"]
 *                 description: Array of result IDs to delete
 *     responses:
 *       200:
 *         description: Bulk results deleted successfully
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
 *                   example: "Bulk results deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 2
 *                         successful:
 *                           type: integer
 *                           example: 2
 *                         failed:
 *                           type: integer
 *                           example: 0
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 *                       description: Deletion errors if any
 *       400:
 *         description: Validation error or all deletions failed
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.delete('/matches/:id/results/bulk',
    validateRequest(manualResultParamsSchema, 'params'),
    validateRequest(bulkDeleteManualResultsSchema, 'body'),
    QuickPTController.deleteBulkManualResults
);

// Single result routes — registered AFTER bulk so Express doesn't
// consume the literal path segment "bulk" as a :resultId value.
quickPTRouter.put('/matches/:quickMatchId/results/:resultId',
    validateRequest(quickMatchResultParamsSchema, 'params'),
    validateRequest(updateManualResultSchema, 'body'),
    QuickPTController.updateManualResult
);

quickPTRouter.delete('/matches/:quickMatchId/results/:resultId',
    validateRequest(quickMatchResultParamsSchema, 'params'),
    QuickPTController.deleteResult
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

quickPTRouter.post('/series/:id/conflicts/resolve',
    validateRequest(seriesIdParamSchema, 'params'),
    validateRequest(resolveSeriesConflictsSchema, 'body'),
    QuickPTController.resolveSeriesConflicts
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
 * /api/v1/quick-pt/matches/{id}/crops:
 *   get:
 *     tags: [Quick-PT Crops]
 *     summary: Get all crops for a match (with auto-processing)
 *     description: |
 *       **⭐ MAIN CROP ENDPOINT** - Auto-processes all unprocessed screenshots and returns all crops.
 *       
 *       **Workflow:**
 *       1. Finds all unprocessed attendance/result screenshots
 *       2. Calls separate Python AI endpoints:
 *          - `/api/v1/crops/attendance` for attendance images
 *          - `/api/v1/crops/results` for result images  
 *       3. Stores crop metadata in database
 *       4. Returns organized crops with fresh signed URLs
 *       
 *       **Features:**
 *       - Auto-processing of unprocessed screenshots
 *       - Separate optimized endpoints for attendance vs results
 *       - Crops organized by type (attendance/result/all)
 *       - Fresh signed URLs (30-minute expiry)
 *       - Redis caching (10-minute TTL)
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
 *     responses:
 *       200:
 *         description: Crops retrieved successfully (with auto-processing)
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
 *                   example: "Crops retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     crops:
 *                       type: object
 *                       properties:
 *                         attendance:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "clh1234567890abcdef"
 *                               cropType:
 *                                 type: string
 *                                 example: "attendance"
 *                               signedUrl:
 *                                 type: string
 *                                 format: uri
 *                                 example: "https://storage.example.com/crops/signed?token=..."
 *                               expiresAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-01-15T11:00:00.000Z"
 *                               cropMetadata:
 *                                 type: object
 *                                 example: { "detected_players": 24 }
 *                         result:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "clh0987654321fedcba"
 *                               cropType:
 *                                 type: string
 *                                 example: "result"
 *                               signedUrl:
 *                                 type: string
 *                                 format: uri
 *                                 example: "https://storage.example.com/crops/signed?token=..."
 *                               expiresAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-01-15T11:00:00.000Z"
 *                               cropMetadata:
 *                                 type: object
 *                                 example: { "detected_teams": 12 }
 *                         all:
 *                           type: array
 *                           items:
 *                             type: object
 *                           description: "Combined array of attendance + result crops"
 *                     totalCrops:
 *                       type: integer
 *                       example: 15
 *                     attendanceCount:
 *                       type: integer
 *                       example: 5
 *                     resultCount:
 *                       type: integer
 *                       example: 10
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
 * /api/v1/quick-pt/matches/{id}/crops/download:
 *   get:
 *     tags: [Quick-PT Crops]
 *     summary: Get bulk download URLs for all crops organized by category
 *     description: |
 *       Gets download URLs for all crops in a match organized by attendance/result categories.
 *       
 *       **Key Features:**
 *       - Auto-processes unprocessed screenshots
 *       - Returns crops organized by attendance/result
 *       - Generates fresh signed URLs for all crops
 *       - Single endpoint for all crop downloads
 *       
 *       **Authentication:** Requires valid JWT token
 *       **Authorization:** User must own the match
 *       
 *       **Signed URLs:** Valid for 30 minutes from generation
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
 *     responses:
 *       200:
 *         description: Bulk crop download URLs retrieved successfully
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
 *                   example: "Crop download URLs retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     downloads:
 *                       type: object
 *                       properties:
 *                         attendance:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "crop123"
 *                               cropType:
 *                                 type: string
 *                                 example: "attendance"
 *                               downloadUrl:
 *                                 type: string
 *                                 format: uri
 *                                 example: "https://storage.example.com/crops/signed?token=..."
 *                               expiresAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-01-15T11:00:00.000Z"
 *                               filename:
 *                                 type: string
 *                                 example: "attendance_crop123.jpg"
 *                               cropMetadata:
 *                                 type: object
 *                                 example: { "detected_players": 24 }
 *                         result:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: "crop456"
 *                               cropType:
 *                                 type: string
 *                                 example: "result"
 *                               downloadUrl:
 *                                 type: string
 *                                 format: uri
 *                                 example: "https://storage.example.com/crops/signed?token=..."
 *                               expiresAt:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2024-01-15T11:00:00.000Z"
 *                               filename:
 *                                 type: string
 *                                 example: "result_crop456.jpg"
 *                               cropMetadata:
 *                                 type: object
 *                                 example: { "detected_teams": 12 }
 *                         all:
 *                           type: array
 *                           items:
 *                             type: object
 *                           description: "Combined array of all attendance + result crops"
 *                     totalCrops:
 *                       type: integer
 *                       example: 15
 *                     attendanceCount:
 *                       type: integer
 *                       example: 5
 *                     resultCount:
 *                       type: integer
 *                       example: 10
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied - user doesn't own the match
 *       400:
 *         description: Failed to get crop download URLs
 *       500:
 *         description: Internal server error
 */
quickPTRouter.get(
    '/matches/:id/crops/download',
    validateRequest(cropParamsSchema, 'params'),
    CropStorageController.getBulkCropDownloadUrls
);

// ========================================
// TEMPLATE ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/templates:
 *   get:
 *     tags: [Quick-PT Templates]
 *     summary: Get all available template images
 *     description: |
 *       Retrieve all available template images organized by category from R2 storage.
 *       
 *       **Features:**
 *       - Templates organized by format (16_teams, 24_teams, 32_teams, etc.)
 *       - Signed URLs with 30-minute expiry for secure access
 *       - Cached results for improved performance
 *       - Automatic URL refresh for cached data
 *       
 *       **Use Cases:**
 *       - Display template selection UI in mobile app
 *       - Preview available design options
 *       - Template picker for points table generation
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
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
 *                   example: "Templates retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     templates:
 *                       type: object
 *                       properties:
 *                         16_teams:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "template1"
 *                               signedUrl:
 *                                 type: string
 *                                 example: "https://storage.com/signed?token=..."
 *                               previewUrl:
 *                                 type: string
 *                                 example: "https://storage.com/preview?token=..."
 *                               category:
 *                                 type: string
 *                                 example: "16_teams"
 *                               fullPath:
 *                                 type: string
 *                                 example: "16_teams/template1"
 *                         24_teams:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "template1"
 *                               signedUrl:
 *                                 type: string
 *                                 example: "https://storage.com/signed?token=..."
 *                               previewUrl:
 *                                 type: string
 *                                 example: "https://storage.com/preview?token=..."
 *                               category:
 *                                 type: string
 *                                 example: "24_teams"
 *                               fullPath:
 *                                 type: string
 *                                 example: "24_teams/template1"
 *                         32_teams:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/TemplateInfo'
 *                     totalTemplates:
 *                       type: integer
 *                       example: 15
 *                       description: Total number of templates across all categories
 *                     cacheExpiry:
 *                       type: integer
 *                       example: 1733323200000
 *                       description: Unix timestamp when cache expires
 *       401:
 *         description: Unauthorized
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
 *                   example: "Authentication failed"
 *       500:
 *         description: Server error while fetching templates
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
 *                   example: "Failed to fetch template images"
 */
quickPTRouter.get('/templates', QuickPTController.getAvailableTemplates);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/export/excel:
 *   get:
 *     tags: [Quick-PT]
 *     summary: Export match results to Excel
 *     description: |
 *       Single-sheet workbook (`Match Report`) with team/slot mapping, minimal match details,
 *       and complete results for all teams. Optional query param `customFilename`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: customFilename
 *         required: false
 *         schema:
 *           type: string
 *           maxLength: 100
 *     responses:
 *       200:
 *         description: Excel export generated successfully
 *       400:
 *         description: No results found for this match
 *       404:
 *         description: Match not found
 */
quickPTRouter.get(
    '/matches/:id/export/excel',
    validateRequest(excelExportParamsSchema, 'params'),
    validateRequest(excelExportSchema, 'query'),
    QuickPTController.exportToExcel
);

// ========================================
// GRAPHICS — FONTS, LOGOS & NEW GRAPHIC TYPES
// ========================================

/**
 * @swagger
 * /api/v1/quick-pt/fonts:
 *   get:
 *     tags: [Quick-PT Graphics]
 *     summary: List all bundled fonts available for customization
 *     description: |
 *       Returns all fonts bundled in the Python AI service that can be used in
 *       `fontCustomization.*.font_file` for standings, slot-list, roster, and top-10 graphics.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Font list retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     fonts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string, example: "akira_expanded" }
 *                           filename: { type: string, example: "akira_expanded.otf" }
 *                           display_name: { type: string, example: "Akira Expanded" }
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.get('/fonts', QuickPTController.getFontsList);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/media:
 *   get:
 *     tags: [Quick-PT Graphics]
 *     summary: List export media history for a match
 *     description: |
 *       Returns all stored media assets (standings, slot-list, roster, top-10) for a match,
 *       newest first. Re-fetch any item via GET /quick-pt/media/{assetId}.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [STANDINGS, SLOT_LIST, ROSTER, TOP_10]
 *         description: Optional filter by asset type
 *     responses:
 *       200:
 *         description: Media history retrieved
 *       404:
 *         description: Match not found
 */
quickPTRouter.get(
    '/matches/:id/media',
    validateRequest(quickMatchParamsSchema, 'params'),
    MediaAssetController.listMatchMedia,
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots/{slotNumber}/logo:
 *   post:
 *     tags: [Quick-PT Graphics]
 *     summary: Upload a match-specific team logo for a slot
 *     description: |
 *       Uploads a logo image for a specific slot in a match.
 *       This logo overrides any preset logo assigned to the slot during standings/graphic generation.
 *       Stored in R2 under `logos/matches/{matchId}/slot_{slotNumber}.{ext}`.
 *
 *       **Logo resolution priority:** match logo > preset entry logo > no logo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *       - in: path
 *         name: slotNumber
 *         required: true
 *         schema:
 *           type: integer
 *         description: Slot number (1-based)
 *         example: 3
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Team logo image (JPEG, PNG, or WebP — max 5 MB)
 *     responses:
 *       200:
 *         description: Logo uploaded and attached to slot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Match logo attached" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     slotId: { type: string }
 *                     slotNumber: { type: integer }
 *                     logoStorageUrl: { type: string, description: "Raw R2/CDN URL (Python generation)" }
 *                     fileId: { type: string }
 *                     previewUrl: { type: string, description: "Signed /files/ preview URL" }
 *                     signedUrl: { type: string }
 *                     signedLogoUrl: { type: string, description: "Deprecated alias of previewUrl" }
 *                     expiresAt: { type: string, format: date-time }
 *                     previewUrlExpiresInSeconds: { type: integer }
 *       400:
 *         description: No file uploaded or invalid file type
 *       404:
 *         description: Slot not found
 *       401:
 *         description: Unauthorized
 *   delete:
 *     tags: [Quick-PT Graphics]
 *     summary: Remove the match-specific logo from a slot
 *     description: Deletes the match-specific logo from R2 and clears the logo reference on the slot. The preset logo (if any) will be used instead.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *       - in: path
 *         name: slotNumber
 *         required: true
 *         schema:
 *           type: integer
 *         description: Slot number
 *     responses:
 *       200:
 *         description: Match logo removed
 *       404:
 *         description: Slot not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/slots/:slotNumber/logo',
    logoUpload.single('logo'),
    QuickPTController.attachMatchLogo
);
quickPTRouter.delete(
    '/matches/:id/slots/:slotNumber/logo',
    QuickPTController.removeMatchLogo
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/graphics/slot-list:
 *   post:
 *     tags: [Quick-PT Graphics]
 *     summary: Generate slot-list graphic for a match
 *     description: |
 *       Generates a slot-list PNG showing team slots, names, and logos.
 *       Match ID is in the path (same pattern as POST /matches/{id}/export).
 *
 *       Pass `template` + `formatType` from GET /quick-pt/templates.
 *       Node resolves and re-signs template URLs; slot data is loaded from DB.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SlotListGraphicRequest'
 *     responses:
 *       200:
 *         description: Slot-list graphic generated
 *       400:
 *         description: No slots or validation error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/graphics/slot-list',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(slotListGraphicSchema),
    QuickPTController.generateMatchSlotList
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/graphics/roster:
 *   post:
 *     tags: [Quick-PT Graphics]
 *     summary: Generate team roster graphic for a match
 *     description: |
 *       Generates a team roster PNG. Match ID is in the path.
 *       Pass `template` + `formatType` from GET /quick-pt/templates.
 *       Splits into multiple images when team count exceeds template capacity.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RosterGraphicRequest'
 *     responses:
 *       200:
 *         description: Roster graphic generated
 *       400:
 *         description: No slots or validation error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/graphics/roster',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(rosterGraphicSchema),
    QuickPTController.generateMatchRoster
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/graphics/top-10:
 *   post:
 *     tags: [Quick-PT Graphics]
 *     summary: Generate top-10 rankings graphic for a match
 *     description: |
 *       Generates a top-10 rankings PNG from match results.
 *       Match ID is in the path. Pass `template` + `formatType` from GET /quick-pt/templates.
 *       Node sorts results by total points (desc), takes top 10, and forwards raw R2 template URLs to Python.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Top10GraphicRequest'
 *     responses:
 *       200:
 *         description: Top-10 rankings graphic generated
 *       400:
 *         description: No results or validation error
 *       404:
 *         description: Match not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/graphics/top-10',
    validateRequest(quickMatchParamsSchema, 'params'),
    validateRequest(top10GraphicSchema),
    QuickPTController.generateMatchTop10
);

/**
 * @swagger
 * /api/v1/quick-pt/matches/{id}/slots/{slotId}/preset:
 *   post:
 *     tags: [Quick-PT Graphics]
 *     summary: Assign a preset entry logo to a slot
 *     description: |
 *       Links a `TeamLogoPresetEntry` (from a user-owned preset) to a slot.
 *       The entry's logo will be used when generating graphics unless a match-specific logo is also present.
 *
 *       Preset entries are managed via `POST /api/v1/quick-pt/logo-presets/{presetId}/entries`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot Assignment ID (not slot number)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [presetEntryId]
 *             properties:
 *               presetEntryId:
 *                 type: string
 *                 description: ID of the TeamLogoPresetEntry to assign
 *                 example: "entry_abc123"
 *     responses:
 *       200:
 *         description: Preset entry assigned to slot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Preset entry assigned to slot" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     slotId: { type: string }
 *                     presetEntryId: { type: string }
 *                     teamName: { type: string }
 *                     logoUrl: { type: string }
 *       400:
 *         description: Validation error
 *       404:
 *         description: Slot or preset entry not found
 *       401:
 *         description: Unauthorized
 *   delete:
 *     tags: [Quick-PT Graphics]
 *     summary: Remove the preset entry assignment from a slot
 *     description: Unlinks the preset entry from the slot. Match-specific logo (if any) is unaffected.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quick Match ID
 *       - in: path
 *         name: slotId
 *         required: true
 *         schema:
 *           type: string
 *         description: Slot Assignment ID
 *     responses:
 *       200:
 *         description: Preset entry removed from slot
 *       404:
 *         description: Slot not found
 *       401:
 *         description: Unauthorized
 */
quickPTRouter.post(
    '/matches/:id/slots/:slotId/preset',
    validateRequest(assignPresetEntrySchema),
    TeamLogoPresetController.assignPresetEntry
);
quickPTRouter.delete(
    '/matches/:id/slots/:slotId/preset',
    TeamLogoPresetController.removePresetEntry
);

/**
 * @swagger
 * components:
 *   schemas:
 *     FontRoleConfig:
 *       type: object
 *       description: Font override for a single role. Use font IDs from GET /api/v1/quick-pt/fonts.
 *       properties:
 *         font_file:
 *           type: string
 *           description: Font filename or ID from the bundled fonts list
 *           example: "akira_expanded.otf"
 *         family:
 *           type: string
 *           example: "Roboto"
 *         weight:
 *           type: string
 *           example: "bold"
 *         size:
 *           type: number
 *           description: Override font size (px)
 *           example: 48
 *         color:
 *           type: string
 *           description: Hex color code
 *           example: "#FFB74D"
 *         alignment:
 *           type: string
 *           enum: [left, center, right]
 *           example: "center"
 *     FontCustomization:
 *       type: object
 *       description: Font overrides per role. All roles are optional.
 *       properties:
 *         header_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         sponsor_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         organiser_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         table_header_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         table_data_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         team_name_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         slot_number_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         rank_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         footer_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         branding_font:
 *           $ref: '#/components/schemas/FontRoleConfig'
 *         global_size_multiplier:
 *           type: number
 *           minimum: 0.1
 *           maximum: 10
 *           description: Multiply all rendered font sizes by this factor
 *           example: 1.0
 */

export default quickPTRouter;
