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
 *     description: File upload and management operations
 */

const uploadRouter = express.Router();

// Apply authentication to all upload routes
uploadRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/uploads/matches/{id}/screenshots/upload:
 *   post:
 *     tags: [Uploads]
 *     summary: Upload screenshots for a match
 *     description: Upload multiple screenshot files for a specific match (max 10 files, 10MB each)
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               screenshots:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Screenshot files (JPEG, PNG, WebP formats)
 *                 maxItems: 10
 *           encoding:
 *             screenshots:
 *               contentType: image/jpeg, image/png, image/webp
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
 *                   type: object
 *                   properties:
 *                     uploadId:
 *                       type: string
 *                       format: uuid
 *                     screenshots:
 *                       type: array
 *                       items:
 *                         type: object
 *                     count:
 *                       type: integer
 *       400:
 *         description: Validation error or file format error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Upload already in progress
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