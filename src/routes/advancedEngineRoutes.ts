import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { AdvancedEngineController } from '../controllers/advancedEngineController';

/**
 * @swagger
 * tags:
 *   - name: Advanced Engine
 *     description: AI-powered screenshot processing and result extraction operations for tournament matches
 */

const advancedEngineRouter = express.Router();

// Apply authentication to all advanced engine routes
advancedEngineRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/advanced-engine/process:
 *   post:
 *     tags: [Advanced Engine]
 *     summary: Process match screenshots with AI
 *     description: |
 *       Process tournament match screenshots using AI to extract team slot mappings and match results.
 *       
 *       **Features:**
 *       - AI-powered screenshot analysis using Google Gemini
 *       - Automatic team slot extraction from lobby screenshots
 *       - Match result extraction from result screenshots
 *       - Confidence scoring for extracted data
 *       - Queue-based background processing
 *       - Real-time processing status updates
 *       
 *       **Processing Types:**
 *       - `FULL_AUTO`: Automatically extract slots and results from screenshots
 *       - `MANUAL_SLOTS`: Use manual slot assignments with result extraction
 *       - `RESULTS_ONLY`: Extract only match results from result screenshots
 *       
 *       **Access Control:**
 *       - User must own the tournament containing the match
 *       - Match must exist and be in PENDING_PROCESSING status
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - matchId
 *               - processingType
 *               - screenshots
 *             properties:
 *               matchId:
 *                 type: string
 *                 format: uuid
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *                 description: "ID of the match to process screenshots for"
 *               processingType:
 *                 type: string
 *                 enum: ["FULL_AUTO", "MANUAL_SLOTS", "RESULTS_ONLY"]
 *                 example: "FULL_AUTO"
 *                 description: "Type of processing to perform on screenshots"
 *               screenshots:
 *                 type: object
 *                 required:
 *                   - slotScreenshots
 *                   - resultScreenshots
 *                 properties:
 *                   slotScreenshots:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: url
 *                     example: ["https://storage.example.com/slot1.jpg", "https://storage.example.com/slot2.jpg"]
 *                     description: "URLs to slot assignment screenshots"
 *                   resultScreenshots:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: url
 *                     example: ["https://storage.example.com/result1.jpg", "https://storage.example.com/result2.jpg"]
 *                     description: "URLs to match result screenshots"
 *               manualSlots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     slotNumber:
 *                       type: integer
 *                       example: 1
 *                     teamName:
 *                       type: string
 *                       example: "Team Alpha"
 *                 description: "Manual slot assignments (required for MANUAL_SLOTS type)"
 *               metadata:
 *                 type: object
 *                 properties:
 *                   gameMode:
 *                     type: string
 *                     example: "Classic"
 *                   mapName:
 *                     type: string
 *                     example: "Erangel"
 *                   matchNumber:
 *                     type: integer
 *                     example: 1
 *                 description: "Additional context for AI processing"
 *     responses:
 *       201:
 *         description: Screenshot processing completed successfully
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
 *                   example: "Screenshot processing completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     processingId:
 *                       type: string
 *                       example: "proc_1640995200000_abc123def"
 *                     extractedData:
 *                       type: object
 *                       properties:
 *                         slotMappings:
 *                           type: array
 *                           items:
 *                             type: object
 *                         results:
 *                           type: array
 *                           items:
 *                             type: object
 *                         teamMappings:
 *                           type: array
 *                           items:
 *                             type: object
 *                     confidence:
 *                       type: object
 *                       properties:
 *                         overall:
 *                           type: number
 *                           example: 0.85
 *                         slotExtraction:
 *                           type: number
 *                           example: 0.90
 *                         resultExtraction:
 *                           type: number
 *                           example: 0.80
 *                     processingTime:
 *                       type: number
 *                       example: 45230
 *                       description: "Processing time in milliseconds"
 *       400:
 *         description: Invalid request or processing failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Match not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
advancedEngineRouter.post('/process', AdvancedEngineController.processScreenshots);

/**
 * @swagger
 * /api/v1/advanced-engine/status/{jobId}:
 *   get:
 *     tags: [Advanced Engine]
 *     summary: Get processing job status
 *     description: |
 *       Retrieve the current status of a specific AI processing job.
 *       
 *       **Features:**
 *       - Real-time job status tracking
 *       - Progress percentage and estimated completion time
 *       - Error details if processing failed
 *       - Job queue position and priority information
 *       
 *       **Job Statuses:**
 *       - `PENDING`: Job is queued for processing
 *       - `PROCESSING`: Job is currently being processed
 *       - `COMPLETED`: Job completed successfully
 *       - `FAILED`: Job failed with errors
 *       - `NOT_FOUND`: Job ID not found in system
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           example: "job_1640995200000_xyz789"
 *         description: "Unique job identifier returned from process endpoint"
 *     responses:
 *       200:
 *         description: Job status retrieved successfully
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
 *                   example: "Job status retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       example: "job_1640995200000_xyz789"
 *                     status:
 *                       type: string
 *                       enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "NOT_FOUND"]
 *                       example: "PROCESSING"
 *                     progress:
 *                       type: number
 *                       example: 75
 *                       description: "Completion percentage (0-100)"
 *                     estimatedTimeRemaining:
 *                       type: number
 *                       example: 30000
 *                       description: "Estimated remaining time in milliseconds"
 *                     startedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T10:00:00.000Z"
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T10:05:00.000Z"
 *                       description: "Present only if job is completed"
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Failed to extract team data from screenshot"]
 *                       description: "Present only if job failed"
 *       404:
 *         description: Processing job not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
advancedEngineRouter.get('/status/:jobId', AdvancedEngineController.getJobStatus);

/**
 * @swagger
 * /api/v1/advanced-engine/match/{matchId}/status:
 *   get:
 *     tags: [Advanced Engine]
 *     summary: Get match processing status
 *     description: |
 *       Retrieve the AI processing status for all jobs associated with a specific match.
 *       
 *       **Features:**
 *       - Complete processing history for the match
 *       - Current active job status
 *       - Processing confidence scores
 *       - Success/failure statistics
 *       - Latest extracted data availability
 *       
 *       **Use Cases:**
 *       - Check if match has been processed
 *       - Monitor ongoing processing jobs
 *       - Retrieve processing statistics
 *       - Validate data extraction quality
 *       
 *       **Access Control:**
 *       - User must own the tournament containing the match
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         description: "ID of the match to check processing status for"
 *     responses:
 *       200:
 *         description: Match processing status retrieved successfully
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
 *                   example: "Match processing status retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     matchId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     totalJobs:
 *                       type: integer
 *                       example: 3
 *                       description: "Total number of processing jobs for this match"
 *                     completedJobs:
 *                       type: integer
 *                       example: 2
 *                       description: "Number of successfully completed jobs"
 *                     failedJobs:
 *                       type: integer
 *                       example: 1
 *                       description: "Number of failed jobs"
 *                     activeJobs:
 *                       type: integer
 *                       example: 0
 *                       description: "Number of currently processing jobs"
 *                     status:
 *                       type: string
 *                       enum: ["NO_JOBS", "PROCESSING", "COMPLETED", "FAILED", "PARTIAL"]
 *                       example: "COMPLETED"
 *                       description: "Overall processing status for the match"
 *                     latestProcessingId:
 *                       type: string
 *                       example: "proc_1640995200000_abc123def"
 *                       description: "ID of the most recent processing job"
 *                     latestConfidence:
 *                       type: number
 *                       example: 0.85
 *                       description: "Confidence score of latest successful processing"
 *                     lastProcessedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T10:15:00.000Z"
 *                       description: "Timestamp of last successful processing"
 *                     hasProcessedData:
 *                       type: boolean
 *                       example: true
 *                       description: "Whether processed data is available for this match"
 *       404:
 *         description: No processing jobs found for this match or match not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
advancedEngineRouter.get('/match/:matchId/status', AdvancedEngineController.getMatchProcessingStatus);

/**
 * @swagger
 * /api/v1/advanced-engine/match/{matchId}/data:
 *   get:
 *     tags: [Advanced Engine]
 *     summary: Get processed data for match
 *     description: |
 *       Retrieve the AI-extracted and processed data for a specific match.
 *       
 *       **Features:**
 *       - Complete extracted slot mappings
 *       - Match result data with team performance
 *       - Team-to-result mappings and correlations
 *       - Confidence scores for all extracted data
 *       - Processing metadata and timestamps
 *       
 *       **Data Types:**
 *       - `slotMappings`: Team names mapped to slot positions
 *       - `results`: Match results with kills, placement, points
 *       - `teamMappings`: Correlation between slots and results
 *       - `confidence`: AI confidence scores for data quality
 *       
 *       **Access Control:**
 *       - User must own the tournament containing the match
 *       - Match must have completed processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         description: "ID of the match to retrieve processed data for"
 *       - in: query
 *         name: processingId
 *         required: false
 *         schema:
 *           type: string
 *           example: "proc_1640995200000_abc123def"
 *         description: "Specific processing ID to retrieve data for (optional)"
 *     responses:
 *       200:
 *         description: Processed data retrieved successfully
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
 *                   example: "Processed data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     processingId:
 *                       type: string
 *                       example: "proc_1640995200000_abc123def"
 *                     matchId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     slotMappings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotNumber:
 *                             type: integer
 *                             example: 1
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           confidence:
 *                             type: number
 *                             example: 0.95
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           placement:
 *                             type: integer
 *                             example: 1
 *                           kills:
 *                             type: integer
 *                             example: 15
 *                           points:
 *                             type: number
 *                             example: 25
 *                           confidence:
 *                             type: number
 *                             example: 0.90
 *                     teamMappings:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotNumber:
 *                             type: integer
 *                             example: 1
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           matchingConfidence:
 *                             type: number
 *                             example: 0.88
 *                     confidence:
 *                       type: object
 *                       properties:
 *                         overall:
 *                           type: number
 *                           example: 0.85
 *                         slotExtraction:
 *                           type: number
 *                           example: 0.90
 *                         resultExtraction:
 *                           type: number
 *                           example: 0.80
 *                     processedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-01T10:15:00.000Z"
 *       404:
 *         description: No processed data found for this match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Access denied - user doesn't own the match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
advancedEngineRouter.get('/match/:matchId/data', AdvancedEngineController.getProcessedData);

export default advancedEngineRouter;