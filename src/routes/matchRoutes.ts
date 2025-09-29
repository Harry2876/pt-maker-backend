import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { MatchController } from '../controllers/matchController';
import { 
    createMatchSchema, 
    updateMatchSchema, 
    matchParamsSchema,
    tournamentParamsSchema 
} from '../validations/matchValidation';

/**
 * @swagger
 * tags:
 *   - name: Matches
 *     description: Match management operations
 */

const matchRouter = express.Router();

// Apply authentication to all match routes
matchRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/matches/tournaments/{tournamentId}/matches:
 *   get:
 *     tags: [Matches]
 *     summary: Get all matches for a specific tournament
 *     description: |
 *       Retrieves all matches for a specific tournament that the authenticated user owns.
 *       
 *       **Features:**
 *       - Returns complete match information including processing status
 *       - Includes match dates, numbers, and group associations
 *       - Shows AI processing status for screenshot analysis
 *       - Provides total match count for the tournament
 *       
 *       **Access Control:**
 *       - User must be the tournament creator/owner
 *       - Tournament must exist and be accessible to the user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: "Tournament UUID identifier"
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Tournament matches retrieved successfully
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
 *                   example: "Matches retrieved successfully"
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
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           matchNumber:
 *                             type: integer
 *                             example: 1
 *                             description: "Sequential match number within tournament"
 *                           matchDate:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-20T15:00:00.000Z"
 *                             description: "Scheduled match date and time"
 *                           status:
 *                             type: string
 *                             enum: ["PENDING_PROCESSING", "PROCESSED", "ERROR"]
 *                             example: "PENDING_PROCESSING"
 *                             description: "AI processing status for match screenshots"
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                             nullable: true
 *                             example: "789e0123-e45f-67g8-h901-234567890123"
 *                             description: "Group ID if match is part of a group stage"
 *                           processedData:
 *                             type: object
 *                             nullable: true
 *                             description: "AI-processed results from screenshot analysis"
 *                             example: null
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           dbStatus:
 *                             type: string
 *                             enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                             example: "SYNCED"
 *                             description: "Database synchronization status"
 *                     count:
 *                       type: integer
 *                       example: 3
 *                       description: "Total number of matches in the tournament"
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
 *         description: Invalid tournament ID format
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
 *                   example: "Invalid tournament ID format"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Tournament ID must be a valid UUID"
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
 *         description: No matches found for the tournament
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
 *                   example: "No matches found for the tournament"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Tournament has no matches created yet"
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
 *         description: Server error
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
 *                   example: "Failed to retrieve matches"
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
// Tournament-specific match routes (nested resources)
matchRouter.get('/tournaments/:tournamentId/matches', 
    validateRequest(tournamentParamsSchema, 'params'),
    MatchController.getTournamentMatches                                     // GET /matches/tournaments/:tournamentId/matches
);

/**
 * @swagger
 * /api/v1/matches/tournaments/{tournamentId}/matches/create:
 *   post:
 *     tags: [Matches]
 *     summary: Create a new match for a tournament
 *     description: |
 *       Creates a new match within a specific tournament. The match is automatically associated with the tournament and the authenticated user as the creator.
 *       
 *       **Features:**
 *       - Sequential match numbering within tournament
 *       - Optional scheduled match date/time
 *       - Optional group association for group-stage tournaments
 *       - Automatic processing status initialization
 *       
 *       **Validation Rules:**
 *       - Match number: 1-100 (integer, positive)
 *       - Match date: ISO 8601 datetime format (optional)
 *       - Group ID: Valid UUID format (optional)
 *       
 *       **Access Control:**
 *       - User must be the tournament creator/owner
 *       - Tournament must exist and be accessible
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: "Tournament UUID identifier"
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - matchNumber
 *             properties:
 *               matchNumber:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 1
 *                 description: "Sequential match number within the tournament"
 *               matchDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2024-01-20T15:00:00.000Z"
 *                 description: "Scheduled match date and time (ISO 8601 format)"
 *               groupId:
 *                 type: string
 *                 format: uuid
 *                 example: "789e0123-e45f-67g8-h901-234567890123"
 *                 description: "Group ID if match is part of a group stage (optional)"
 *           examples:
 *             basic_match:
 *               summary: Basic match creation
 *               value:
 *                 matchNumber: 1
 *             scheduled_match:
 *               summary: Match with scheduled date
 *               value:
 *                 matchNumber: 2
 *                 matchDate: "2024-01-20T15:00:00.000Z"
 *             group_stage_match:
 *               summary: Group stage match
 *               value:
 *                 matchNumber: 3
 *                 matchDate: "2024-01-20T16:00:00.000Z"
 *                 groupId: "789e0123-e45f-67g8-h901-234567890123"
 *     responses:
 *       201:
 *         description: Match created successfully
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
 *                   example: "Match created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     matchNumber:
 *                       type: integer
 *                       example: 1
 *                     matchDate:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-20T15:00:00.000Z"
 *                     status:
 *                       type: string
 *                       enum: ["PENDING_PROCESSING", "PROCESSED", "ERROR"]
 *                       example: "PENDING_PROCESSING"
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                     processedData:
 *                       type: object
 *                       nullable: true
 *                       example: null
 *                       description: "AI-processed results (null for new matches)"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     dbStatus:
 *                       type: string
 *                       enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                       example: "SYNCED"
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
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Match number must be between 1 and 100"
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
 *                 invalid_match_number:
 *                   summary: Invalid match number
 *                   value:
 *                     success: false
 *                     message: "Match number must be between 1 and 100"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Match number validation failed"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *                 invalid_date:
 *                   summary: Invalid date format
 *                   value:
 *                     success: false
 *                     message: "Invalid date format"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Match date must be in ISO 8601 format"
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
 *       403:
 *         description: Forbidden - Tournament access denied
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
 *                   example: "Access denied to tournament"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "You are not the owner of this tournament"
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
 *         description: Server error
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
 *                   example: "Failed to create match"
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
matchRouter.post('/tournaments/:tournamentId/matches/create', 
    validateRequest(tournamentParamsSchema, 'params'),
    validateRequest(createMatchSchema),
    MatchController.createMatch                                              // POST /matches/tournaments/:tournamentId/matches/create
);

/**
 * @swagger
 * /api/v1/matches/get/{id}:
 *   get:
 *     tags: [Matches]
 *     summary: Get match details by ID
 *     description: |
 *       Retrieves complete details of a specific match by its ID. Only the tournament creator can access matches.
 *       
 *       **Security:**
 *       - User must be authenticated with valid JWT token
 *       - User must be the creator/owner of the tournament containing the match
 *       - Match ID must be valid UUID format
 *       
 *       **Response includes:**
 *       - Complete match configuration and metadata
 *       - AI processing status and results
 *       - Group association if applicable
 *       - Creation and modification timestamps
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
 *     responses:
 *       200:
 *         description: Match retrieved successfully
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
 *                   example: "Match retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     matchNumber:
 *                       type: integer
 *                       example: 1
 *                       description: "Sequential match number within tournament"
 *                     matchDate:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-20T15:00:00.000Z"
 *                       description: "Scheduled match date and time"
 *                     status:
 *                       type: string
 *                       enum: ["PENDING_PROCESSING", "PROCESSED", "ERROR"]
 *                       example: "PROCESSED"
 *                       description: "AI processing status for match screenshots"
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                       description: "Group ID if match is part of a group stage"
 *                     processedData:
 *                       type: object
 *                       nullable: true
 *                       description: "AI-processed results from screenshot analysis"
 *                       example:
 *                         teams:
 *                           - name: "Team Alpha"
 *                             score: 13
 *                           - name: "Team Beta"
 *                             score: 11
 *                         winner: "Team Alpha"
 *                         confidence: 0.95
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:45:00.000Z"
 *                     dbStatus:
 *                       type: string
 *                       enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                       example: "SYNCED"
 *                       description: "Database synchronization status"
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
 *         description: Invalid match ID format
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
 *                   example: "Invalid match ID format"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Match ID must be a valid UUID"
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
 *       500:
 *         description: Server error
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
 *                   example: "Failed to retrieve match"
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
// Individual match operations
matchRouter.get('/get/:id', 
    validateRequest(matchParamsSchema, 'params'),
    MatchController.getMatchById                                             // GET /matches/get/:id
);

/**
 * @swagger
 * /api/v1/matches/update/{id}:
 *   put:
 *     tags: [Matches]
 *     summary: Update match
 *     description: Update match details
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
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMatchRequest'
 *     responses:
 *       200:
 *         description: Match updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Match not found or not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
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
matchRouter.put('/update/:id', 
    validateRequest(matchParamsSchema, 'params'),
    validateRequest(updateMatchSchema),
    MatchController.updateMatch                                              // PUT /matches/update/:id
);

/**
 * @swagger
 * /api/v1/matches/delete/{id}:
 *   delete:
 *     tags: [Matches]
 *     summary: Delete match
 *     description: Delete a match by ID
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
 *         description: Match deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Match not found or not authorized
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
matchRouter.delete('/delete/:id', 
    validateRequest(matchParamsSchema, 'params'),
    MatchController.deleteMatch                                              // DELETE /matches/delete/:id
);

export default matchRouter;