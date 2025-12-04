import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { UploadController } from '../controllers/uploadController';
import { screenshotUpload, getUploadProgress } from '../middleware/fileUpload';
import { matchParamsSchema } from '../validations/matchValidation';

/**
 * @swagger
 * tags:
 *   - name: Uploads
 *     description: File upload and storage
 */

const uploadRouter = express.Router();

// Apply authentication to all upload routes
uploadRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/uploads/matches/{id}/screenshots/upload:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload match screenshots for AI processing
 *     description: |
 *       Upload multiple screenshot files for a specific match. Screenshots are processed by AI to extract match results and team information.
 *       
 *       **IMPORTANT:** Add `?type=ATTENDANCE_IMAGE` or `?type=RESULT_IMAGE` to the URL as a query parameter.
 *       
 *       **Request Format:**
 *       - URL: `/api/v1/uploads/matches/{id}/screenshots/upload?type=ATTENDANCE_IMAGE`
 *       - Body: multipart/form-data with screenshots field
 *       
 *       **File Requirements:**
 *       - Supported formats: JPEG, PNG, WebP
 *       - Maximum file size: 10MB per file
 *       - Maximum files: 10 screenshots per match
 *       - Files are uploaded to Cloudflare R2 storage
 *       
 *       **Screenshot Types:**
 *       - `ATTENDANCE_IMAGE`: Player attendance/participation list
 *       - `RESULT_IMAGE`: Match results/kill feed/leaderboard
 *       
 *       **AI Processing:**
 *       - Screenshots are automatically processed by AI
 *       - Extracts team names, scores, and match results
 *       - Updates match status to PROCESSED when complete
 *       - Results stored in match.processedData field
 *       
 *       **Security:**
 *       - User must be the tournament/match owner
 *       - Files are virus-scanned and validated
 *       - Automatic cleanup of malformed uploads
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: "Match UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ATTENDANCE_IMAGE, RESULT_IMAGE]
 *         description: Type of screenshot (ATTENDANCE_IMAGE for player list, RESULT_IMAGE for match results)
 *         example: "ATTENDANCE_IMAGE"
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
 *                 description: "Screenshot image files (JPEG, PNG, WebP formats)"
 *                 minItems: 1
 *                 maxItems: 10
 *           encoding:
 *             screenshots:
 *               contentType: image/jpeg, image/png, image/webp
 *               style: form
 *               explode: true
 *     responses:
 *       201:
 *         description: Screenshots uploaded successfully and queued for AI processing
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
 *                   type: object
 *                   properties:
 *                     screenshots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "789e0123-e45f-67g8-h901-234567890123"
 *                           originalName:
 *                             type: string
 *                             example: "match_result_screenshot.png"
 *                           fileName:
 *                             type: string
 *                             example: "match_456e7890_screenshot_1_20240115.png"
 *                           fileSize:
 *                             type: integer
 *                             example: 2048576
 *                             description: "File size in bytes"
 *                           mimeType:
 *                             type: string
 *                             example: "image/png"
 *                           type:
 *                             type: string
 *                             enum: ["ATTENDANCE_IMAGE", "RESULT_IMAGE"]
 *                             example: "RESULT_IMAGE"
 *                             description: "Screenshot type detected by AI"
 *                           storageUrl:
 *                             type: string
 *                             format: uri
 *                             example: "https://storage.example.com/screenshots/match_456e7890_screenshot_1.png"
 *                           isProcessed:
 *                             type: boolean
 *                             example: false
 *                             description: "AI processing status"
 *                           uploadedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           matchId:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                     uploadId:
 *                       type: string
 *                       format: uuid
 *                       example: "abc12345-d6e7-8f90-g123-456789012345"
 *                       description: "Unique upload session identifier"
 *                     count:
 *                       type: integer
 *                       example: 3
 *                       description: "Number of screenshots uploaded"
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
 *       400:
 *         description: Validation error or invalid file format
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
 *                   example: "Invalid file format or size"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Only JPEG, PNG, and WebP files up to 10MB are allowed"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *               examples:
 *                 invalid_format:
 *                   summary: Unsupported file format
 *                   value:
 *                     success: false
 *                     message: "Unsupported file format"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Only JPEG, PNG, and WebP formats are supported"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *                 file_too_large:
 *                   summary: File size exceeds limit
 *                   value:
 *                     success: false
 *                     message: "File size exceeds maximum limit"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Maximum file size is 10MB"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: "Auth Token Required"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     details:
 *                       type: string
 *                       example: "Valid JWT token required"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       404:
 *         description: Match not found or access denied
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
 *                   example: "Match not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Match does not exist or you don't have access"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       413:
 *         description: Payload too large
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
 *                   example: "Upload payload too large"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "PAYLOAD_TOO_LARGE"
 *                     details:
 *                       type: string
 *                       example: "Total upload size exceeds server limits"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       429:
 *         description: Upload already in progress for this match
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
 *                   example: "Upload already in progress for this match"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "RATE_LIMIT"
 *                     details:
 *                       type: string
 *                       example: "Please wait for current upload to complete"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       500:
 *         description: Server error during upload processing
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
 *                   example: "Failed to upload screenshots"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "INTERNAL_ERROR"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 */
// Screenshot upload routes
uploadRouter.post('/matches/:id/screenshots/upload',
    validateRequest(matchParamsSchema, 'params'),
    ...screenshotUpload, // This spreads the middleware array
    UploadController.uploadScreenshots
);

/**
 * @swagger
 * /api/v1/uploads/matches/{id}/screenshots:
 *   get:
 *     tags: [Uploads]
 *     summary: Get match screenshots
 *     description: Get all screenshots for a specific match
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Match ID
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
 *                       originalName:
 *                         type: string
 *                       s3Key:
 *                         type: string
 *                       s3Url:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 *       404:
 *         description: No screenshots found for this match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
uploadRouter.get('/matches/:id/screenshots',
    validateRequest(matchParamsSchema, 'params'),
    UploadController.getMatchScreenshots
);

/**
 * @swagger
 * /api/v1/uploads/screenshots/{id}/delete:
 *   delete:
 *     tags: [Uploads]
 *     summary: Delete screenshot
 *     description: Delete a specific screenshot by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Screenshot ID
 *     responses:
 *       200:
 *         description: Screenshot deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Screenshot not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to delete screenshot
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
uploadRouter.delete('/screenshots/:id/delete',
    UploadController.deleteScreenshot
);

/**
 * @swagger
 * /api/v1/uploads/progress/{uploadId}:
 *   get:
 *     tags: [Uploads]
 *     summary: Get upload progress
 *     description: Check the progress of a file upload operation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uploadId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Upload ID
 *     responses:
 *       200:
 *         description: Upload progress retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     uploadId:
 *                       type: string
 *                       format: uuid
 *                     status:
 *                       type: string
 *                       enum: [UPLOADING, PROCESSING, COMPLETED, FAILED]
 *                     progress:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 100
 *                     files:
 *                       type: array
 *                       items:
 *                         type: object
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                     lastUpdate:
 *                       type: string
 *                       format: date-time
 *                     error:
 *                       type: string
 *       404:
 *         description: Upload not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Upload progress checking
uploadRouter.get('/progress/:uploadId',
    getUploadProgress
);

export default uploadRouter;