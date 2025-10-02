import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TournamentController } from '../controllers/tournamentController';
import { 
    createTournamentSchema, 
    updateTournamentSchema, 
    tournamentParamsSchema 
} from '../validations/tournamentValidation';

/**
 * @swagger
 * tags:
 *   - name: Tournaments
 *     description: Tournament management operations
 */

const tournamentRouter = express.Router();

// Apply authentication to all tournament routes
tournamentRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/tournaments:
 *   get:
 *     tags: [Tournaments]
 *     summary: Get all tournaments created by authenticated user
 *     description: |
 *       Retrieves all tournaments created by the authenticated user with complete tournament details.
 *       
 *       **Features:**
 *       - Returns tournaments with full metadata
 *       - Includes tournament status and stage information
 *       - Shows registration and collaboration settings
 *       - Provides count of total tournaments
 *       - Supports pagination, filtering, sorting, and search
 *       
 *       **Response Structure:**
 *       - Success: Returns tournaments array with count in data object
 *       - No tournaments: Returns 404 with appropriate message
 *       
 *       **Pagination:**
 *       - Default: 20 tournaments per page
 *       - Maximum: 100 tournaments per page
 *       
 *       **Filtering:**
 *       - Filter by game type, status, or tournament format
 *       
 *       **Sorting:**
 *       - Sort by creation date, name, or status
 *       - Default: newest first (createdAt desc)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of tournaments per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Search tournaments by name or game
 *         example: "BGMI Championship"
 *       - in: query
 *         name: game
 *         schema:
 *           type: string
 *           maxLength: 50
 *         description: Filter by specific game
 *         example: "BGMI"
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [UPCOMING, ONGOING, COMPLETED]
 *         description: Filter by tournament status
 *         example: "ONGOING"
 *       - in: query
 *         name: tournamentFormat
 *         schema:
 *           type: string
 *           enum: [ELIMINATION, ROUND_ROBIN, MIXED]
 *         description: Filter by tournament format
 *         example: "ELIMINATION"
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, name, status, prizePool, maxTeams]
 *           default: createdAt
 *         description: Field to sort by
 *         example: "createdAt"
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order (ascending or descending)
 *         example: "desc"
 *       - in: query
 *         name: minPrizePool
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Filter tournaments with prize pool greater than or equal to this amount
 *         example: 1000
 *       - in: query
 *         name: maxPrizePool
 *         schema:
 *           type: number
 *           minimum: 0
 *         description: Filter tournaments with prize pool less than or equal to this amount
 *         example: 50000
 *     responses:
 *       200:
 *         description: User tournaments retrieved successfully
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
 *                   example: "User tournaments fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournaments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
 *                           name:
 *                             type: string
 *                             example: "Epic Gaming Championship 2024"
 *                           game:
 *                             type: string
 *                             example: "Valorant"
 *                           tournamentType:
 *                             type: string
 *                             enum: ["TOURNAMENT"]
 *                             example: "TOURNAMENT"
 *                           maxTeams:
 *                             type: integer
 *                             example: 32
 *                           entryFee:
 *                             type: number
 *                             example: 500
 *                           prizePool:
 *                             type: number
 *                             example: 15000
 *                           status:
 *                             type: string
 *                             enum: ["UPCOMING", "ONGOING", "COMPLETED"]
 *                             example: "UPCOMING"
 *                           totalStages:
 *                             type: integer
 *                             example: 3
 *                           currentStage:
 *                             type: integer
 *                             example: 1
 *                           tournamentFormat:
 *                             type: string
 *                             enum: ["ELIMINATION", "ROUND_ROBIN", "MIXED"]
 *                             example: "ELIMINATION"
 *                           maxTeamsPerGroup:
 *                             type: integer
 *                             example: 8
 *                           allowCollaborators:
 *                             type: boolean
 *                             example: true
 *                           userId:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                     count:
 *                       type: integer
 *                       example: 5
 *                       description: "Number of tournaments in current page"
 *                     total:
 *                       type: integer
 *                       example: 47
 *                       description: "Total number of tournaments matching filters"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                           description: "Current page number"
 *                         limit:
 *                           type: integer
 *                           example: 20
 *                           description: "Number of items per page"
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *                           description: "Total number of pages"
 *                         hasNext:
 *                           type: boolean
 *                           example: true
 *                           description: "Whether there are more pages"
 *                         hasPrev:
 *                           type: boolean
 *                           example: false
 *                           description: "Whether there are previous pages"
 *                     filters:
 *                       type: object
 *                       properties:
 *                         applied:
 *                           type: object
 *                           description: "Currently applied filters"
 *                           example: { "status": "ONGOING", "game": "BGMI" }
 *                         search:
 *                           type: string
 *                           example: "Championship"
 *                           description: "Applied search query"
 *                     sorting:
 *                       type: object
 *                       properties:
 *                         sortBy:
 *                           type: string
 *                           example: "createdAt"
 *                         sortOrder:
 *                           type: string
 *                           example: "desc"
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
 *       404:
 *         description: No tournaments found for the user
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
 *                   example: "No tournaments found for the user"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "User has not created any tournaments yet"
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
 *                   example: "Failed to retrieve tournaments"
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
// Tournament CRUD Operations
tournamentRouter.get('/', TournamentController.getUserTournaments);                    // GET /tournaments

/**
 * @swagger
 * /api/v1/tournaments/create:
 *   post:
 *     tags: [Tournaments]
 *     summary: Create a new tournament
 *     description: |
 *       Creates a new tournament with the specified configuration. The tournament is automatically associated with the authenticated user as the creator.
 *       
 *       **Features:**
 *       - Tournament name validation (3-100 characters, alphanumeric + spaces/hyphens/underscores)
 *       - Game name validation (2-50 characters)
 *       - Optional entry fee and prize pool configuration
 *       - Flexible team limits (1-1000 teams)
 *       - Status management (UPCOMING by default)
 *       
 *       **Validation Rules:**
 *       - Tournament name: 3-100 characters, no special characters except - and _
 *       - Game name: 2-50 characters
 *       - Max teams: 1-1000 (optional, integer)
 *       - Entry fee and prize pool: Must be positive numbers (optional)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - game
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 pattern: '^[a-zA-Z0-9\s\-_]+$'
 *                 example: "Epic Gaming Championship 2024"
 *                 description: "Tournament name (3-100 chars, alphanumeric + spaces/hyphens/underscores only)"
 *               game:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 example: "Valorant"
 *                 description: "Game name for the tournament"
 *               tournamentType:
 *                 type: string
 *                 enum: ["TOURNAMENT"]
 *                 example: "TOURNAMENT"
 *                 description: "Tournament type (currently only TOURNAMENT supported)"
 *               maxTeams:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1000
 *                 example: 32
 *                 description: "Maximum number of teams that can participate"
 *               entryFee:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 500
 *                 description: "Entry fee per team (optional)"
 *               prizePool:
 *                 type: number
 *                 minimum: 0.01
 *                 example: 15000
 *                 description: "Total prize pool amount (optional)"
 *               status:
 *                 type: string
 *                 enum: ["UPCOMING", "ONGOING", "COMPLETED"]
 *                 example: "UPCOMING"
 *                 description: "Tournament status (defaults to UPCOMING)"
 *           examples:
 *             minimal_tournament:
 *               summary: Basic tournament creation
 *               value:
 *                 name: "Weekly Valorant Cup"
 *                 game: "Valorant"
 *             full_tournament:
 *               summary: Complete tournament with all fields
 *               value:
 *                 name: "Epic Gaming Championship 2024"
 *                 game: "Valorant"
 *                 tournamentType: "TOURNAMENT"
 *                 maxTeams: 32
 *                 entryFee: 500
 *                 prizePool: 15000
 *                 status: "UPCOMING"
 *     responses:
 *       201:
 *         description: Tournament created successfully
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
 *                   example: "Tournament created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     name:
 *                       type: string
 *                       example: "Epic Gaming Championship 2024"
 *                     game:
 *                       type: string
 *                       example: "Valorant"
 *                     tournamentType:
 *                       type: string
 *                       example: "TOURNAMENT"
 *                     maxTeams:
 *                       type: integer
 *                       example: 32
 *                     entryFee:
 *                       type: number
 *                       example: 500
 *                     prizePool:
 *                       type: number
 *                       example: 15000
 *                     status:
 *                       type: string
 *                       example: "UPCOMING"
 *                     totalStages:
 *                       type: integer
 *                       example: 1
 *                     currentStage:
 *                       type: integer
 *                       example: 0
 *                     tournamentFormat:
 *                       type: string
 *                       example: "ELIMINATION"
 *                     allowCollaborators:
 *                       type: boolean
 *                       example: false
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
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
 *                       example: "Tournament name must be at least 3 characters"
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
 *                 invalid_name:
 *                   summary: Invalid tournament name
 *                   value:
 *                     success: false
 *                     message: "Tournament name must be at least 3 characters"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Tournament name validation failed"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *                 invalid_teams:
 *                   summary: Invalid max teams value
 *                   value:
 *                     success: false
 *                     message: "Max teams must be between 1 and 1000"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Max teams validation failed"
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
 *                   example: "Failed to create tournament"
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
tournamentRouter.post('/create', 
    validateRequest(createTournamentSchema), 
    TournamentController.createTournament                                             // POST /tournaments/create
);

/**
 * @swagger
 * /api/v1/tournaments/get/{id}:
 *   get:
 *     tags: [Tournaments]
 *     summary: Get tournament details by ID
 *     description: |
 *       Retrieves complete details of a specific tournament by its ID. Only the tournament creator can access the tournament.
 *       
 *       **Security:**
 *       - User must be authenticated with valid JWT token
 *       - User must be the creator/owner of the tournament
 *       - Tournament ID must be valid UUID format
 *       
 *       **Response includes:**
 *       - Complete tournament configuration and metadata
 *       - Current status and stage information
 *       - Registration and collaboration settings
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
 *         description: "Tournament UUID identifier"
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Tournament retrieved successfully
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
 *                   example: "Tournament fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     name:
 *                       type: string
 *                       example: "Epic Gaming Championship 2024"
 *                     game:
 *                       type: string
 *                       example: "Valorant"
 *                     tournamentType:
 *                       type: string
 *                       enum: ["TOURNAMENT"]
 *                       example: "TOURNAMENT"
 *                     maxTeams:
 *                       type: integer
 *                       example: 32
 *                     entryFee:
 *                       type: number
 *                       example: 500
 *                     prizePool:
 *                       type: number
 *                       example: 15000
 *                     status:
 *                       type: string
 *                       enum: ["UPCOMING", "ONGOING", "COMPLETED"]
 *                       example: "UPCOMING"
 *                     totalStages:
 *                       type: integer
 *                       example: 3
 *                     currentStage:
 *                       type: integer
 *                       example: 1
 *                     tournamentFormat:
 *                       type: string
 *                       enum: ["ELIMINATION", "ROUND_ROBIN", "MIXED"]
 *                       example: "ELIMINATION"
 *                     maxTeamsPerGroup:
 *                       type: integer
 *                       example: 8
 *                     allowCollaborators:
 *                       type: boolean
 *                       example: true
 *                     registrationFields:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "field-1"
 *                           name:
 *                             type: string
 *                             example: "teamName"
 *                           type:
 *                             type: string
 *                             enum: ["text", "email", "phone", "number", "select"]
 *                             example: "text"
 *                           label:
 *                             type: string
 *                             example: "Team Name"
 *                           required:
 *                             type: boolean
 *                             example: true
 *                     userId:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
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
 *         description: Tournament not found or access denied
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
 *                   example: "Tournament not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Tournament does not exist or you don't have access"
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
 *                   example: "Failed to retrieve tournament"
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
tournamentRouter.get('/get/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    TournamentController.getTournamentById                                            // GET /tournaments/get/:id
);

/**
 * @swagger
 * /api/v1/tournaments/update/{id}:
 *   put:
 *     tags: [Tournaments]
 *     summary: Update tournament
 *     description: Update tournament details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTournamentRequest'
 *     responses:
 *       200:
 *         description: Tournament updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Tournament not found or not authorized
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
tournamentRouter.put('/update/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    validateRequest(updateTournamentSchema),
    TournamentController.updateTournament                                             // PUT /tournaments/:id
);

/**
 * @swagger
 * /api/v1/tournaments/delete/{id}:
 *   delete:
 *     tags: [Tournaments]
 *     summary: Delete tournament
 *     description: Delete a tournament by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Tournament deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Tournament not found or not authorized
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
tournamentRouter.delete('/delete/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    TournamentController.deleteTournament                                             // DELETE /tournaments/:id
);

export default tournamentRouter;
