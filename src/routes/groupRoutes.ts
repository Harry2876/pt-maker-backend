import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { GroupController } from '../controllers/groupController';
import { 
    createGroupSchema, 
    updateGroupSchema, 
    groupParamsSchema,
    tournamentGroupParamsSchema 
} from '../validations/groupValidation';

/**
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Group management operations
 */

const groupRouter = express.Router();

// Apply authentication to all group routes
groupRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/groups/tournaments/{tournamentId}/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Get all groups for a specific tournament
 *     description: |
 *       Retrieves all groups for a specific tournament that the authenticated user owns. Groups are used for organizing teams in group-stage tournaments.
 *       
 *       **Features:**
 *       - Returns complete group information including team limits
 *       - Shows qualification spots for each group
 *       - Includes synchronization status with database
 *       - Provides total group count for the tournament
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
 *         description: Tournament groups retrieved successfully
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
 *                   example: "Groups retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           name:
 *                             type: string
 *                             example: "Group A"
 *                             description: "Group name (usually A, B, C, etc.)"
 *                           maxTeams:
 *                             type: integer
 *                             example: 8
 *                             description: "Maximum number of teams allowed in this group"
 *                           qualificationSpots:
 *                             type: integer
 *                             example: 2
 *                             description: "Number of teams that qualify from this group to next stage"
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
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
 *                       example: 4
 *                       description: "Total number of groups in the tournament"
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
 *         description: No groups found for the tournament
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
 *                   example: "No groups found for the tournament"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Tournament has no groups created yet"
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
 *                   example: "Failed to retrieve groups"
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
// Tournament-specific group routes (nested resources)
groupRouter.get('/tournaments/:tournamentId/groups',
    validateRequest(tournamentGroupParamsSchema, 'params'),
    GroupController.getTournamentGroups
);

/**
 * @swagger
 * /api/v1/groups/tournaments/{tournamentId}/groups/create:
 *   post:
 *     tags: [Groups]
 *     summary: Create a new group for a tournament
 *     description: |
 *       Creates a new group for organizing teams within a tournament. Groups are used in group-stage tournaments for round-robin play before elimination rounds.
 *       
 *       **Features:**
 *       - Automatic group naming (A, B, C, etc.) if not specified
 *       - Configurable team limits and qualification spots
 *       - Tournament ownership validation
 *       - Prevents duplicate group creation
 *       
 *       **Validation Rules:**
 *       - Group name: 1-50 characters (optional, auto-generated if not provided)
 *       - Max teams: 2-32 teams per group
 *       - Qualification spots: 1 to maxTeams
 *       - User must own the tournament
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
 *               - maxTeams
 *               - qualificationSpots
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: "Group A"
 *                 description: "Group name (auto-generated if not provided)"
 *               maxTeams:
 *                 type: integer
 *                 minimum: 2
 *                 maximum: 32
 *                 example: 8
 *                 description: "Maximum number of teams in this group"
 *               qualificationSpots:
 *                 type: integer
 *                 minimum: 1
 *                 example: 2
 *                 description: "Number of teams that qualify from this group"
 *           examples:
 *             basic_group:
 *               summary: Basic group creation
 *               value:
 *                 maxTeams: 8
 *                 qualificationSpots: 2
 *             named_group:
 *               summary: Named group creation
 *               value:
 *                 name: "Champions Group"
 *                 maxTeams: 6
 *                 qualificationSpots: 3
 *     responses:
 *       201:
 *         description: Group created successfully
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
 *                   example: "Group created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     name:
 *                       type: string
 *                       example: "Group A"
 *                     maxTeams:
 *                       type: integer
 *                       example: 8
 *                     qualificationSpots:
 *                       type: integer
 *                       example: 2
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
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
 *         description: Validation error or business logic violation
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
 *                       example: "Max teams must be between 2 and 32"
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
 *                 invalid_teams:
 *                   summary: Invalid max teams
 *                   value:
 *                     success: false
 *                     message: "Max teams must be between 2 and 32"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Group team limit validation failed"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *                 invalid_qualification:
 *                   summary: Invalid qualification spots
 *                   value:
 *                     success: false
 *                     message: "Qualification spots cannot exceed max teams"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Qualification spots validation failed"
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
 *         description: Forbidden - User does not own the tournament
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
 *                   example: "Access denied"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "Only tournament owner can create groups"
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
 *         description: Tournament not found
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
 *                       example: "Tournament with specified ID does not exist"
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
 *                   example: "Failed to create group"
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
groupRouter.post('/tournaments/:tournamentId/groups/create', 
    validateRequest(tournamentGroupParamsSchema, 'params'),
    validateRequest(createGroupSchema),
    GroupController.createGroup                                              // POST /groups/tournaments/:tournamentId/groups/create
);

/**
 * @swagger
 * /api/v1/groups/get/{id}:
 *   get:
 *     tags: [Groups]
 *     summary: Get group details by ID
 *     description: |
 *       Retrieves detailed information for a specific group by its ID. Used for viewing group configuration, team assignments, and tournament context.
 *       
 *       **Features:**
 *       - Returns complete group information
 *       - Shows current team assignments and availability
 *       - Includes qualification and tournament details
 *       - Provides synchronization status
 *       
 *       **Access Control:**
 *       - User must be the tournament owner
 *       - Group must exist and be accessible
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
 *         description: "Group UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *     responses:
 *       200:
 *         description: Group details retrieved successfully
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
 *                   example: "Group retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     name:
 *                       type: string
 *                       example: "Group A"
 *                       description: "Group name"
 *                     maxTeams:
 *                       type: integer
 *                       example: 8
 *                       description: "Maximum number of teams allowed in this group"
 *                     qualificationSpots:
 *                       type: integer
 *                       example: 2
 *                       description: "Number of teams that qualify from this group"
 *                     currentTeamCount:
 *                       type: integer
 *                       example: 6
 *                       description: "Current number of teams assigned to this group"
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
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
 *         description: Invalid group ID format
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
 *                   example: "Invalid group ID format"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Group ID must be a valid UUID"
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
 *       403:
 *         description: Forbidden - User does not own the tournament
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
 *                   example: "Access denied"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "Only tournament owner can access group details"
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
 *         description: Group not found
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
 *                   example: "Group not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Group with specified ID does not exist"
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
 *                   example: "Failed to retrieve group"
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
// Individual group operations
groupRouter.get('/get/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.getGroupById                                             // GET /groups/get/:id
);

/**
 * @swagger
 * /api/v1/groups/update/{id}:
 *   put:
 *     tags: [Groups]
 *     summary: Update group configuration
 *     description: |
 *       Updates an existing group's configuration including name, team limits, and qualification spots. Used for modifying group settings during tournament setup.
 *       
 *       **Features:**
 *       - Update group name and display settings
 *       - Modify team capacity and qualification rules
 *       - Validation prevents conflicts with existing teams
 *       - Tournament ownership verification
 *       
 *       **Validation Rules:**
 *       - Group name: 1-50 characters (optional)
 *       - Max teams: Must be at least current team count
 *       - Qualification spots: Cannot exceed max teams
 *       - User must own the tournament
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
 *         description: "Group UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: "Group A - Elite"
 *                 description: "Updated group name"
 *               maxTeams:
 *                 type: integer
 *                 minimum: 2
 *                 maximum: 32  
 *                 example: 10
 *                 description: "Updated maximum number of teams (must be >= current team count)"
 *               qualificationSpots:
 *                 type: integer
 *                 minimum: 1
 *                 example: 3
 *                 description: "Updated number of qualification spots (must be <= maxTeams)"
 *           examples:
 *             update_name:
 *               summary: Update group name only
 *               value:
 *                 name: "Elite Group"
 *             update_capacity:
 *               summary: Update team capacity and qualifications
 *               value:
 *                 maxTeams: 12
 *                 qualificationSpots: 4
 *             full_update:
 *               summary: Update all group settings
 *               value:
 *                 name: "Champion's Group"
 *                 maxTeams: 8
 *                 qualificationSpots: 2
 *     responses:
 *       200:
 *         description: Group updated successfully
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
 *                   example: "Group updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     name:
 *                       type: string
 *                       example: "Elite Group"
 *                     maxTeams:
 *                       type: integer
 *                       example: 10
 *                     qualificationSpots:
 *                       type: integer
 *                       example: 3
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:30:00.000Z"
 *                     dbStatus:
 *                       type: string
 *                       example: "SYNCED"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T11:30:00.000Z"
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       400:
 *         description: Validation error or business logic violation
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
 *                       example: "Max teams cannot be less than current team count"
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
 *                 capacity_conflict:
 *                   summary: Cannot reduce capacity below current teams
 *                   value:
 *                     success: false
 *                     message: "Cannot reduce max teams below current team count"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Group currently has 8 teams, cannot set max to 6"
 *                       timestamp: "2024-01-15T11:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T11:30:00.000Z"
 *                       version: "1.0"
 *                 qualification_error:
 *                   summary: Invalid qualification spots
 *                   value:
 *                     success: false
 *                     message: "Qualification spots cannot exceed max teams"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Cannot have 5 qualification spots for 4 max teams"
 *                       timestamp: "2024-01-15T11:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T11:30:00.000Z"
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
 *         description: Forbidden - User does not own the tournament
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
 *                   example: "Access denied"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "Only tournament owner can update groups"
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
 *         description: Group not found
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
 *                   example: "Group not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Group with specified ID does not exist"
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
 *                   example: "Failed to update group"
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
groupRouter.put('/update/:id', 
    validateRequest(groupParamsSchema, 'params'),
    validateRequest(updateGroupSchema),
    GroupController.updateGroup                                              // PUT /groups/update/:id
);

/**
 * @swagger
 * /api/v1/groups/delete/{id}:
 *   delete:
 *     tags: [Groups]
 *     summary: Delete a tournament group
 *     description: |
 *       Permanently deletes a group from a tournament. This action removes all team assignments and cannot be undone.
 *       
 *       **Features:**
 *       - Complete group removal from tournament
 *       - Automatic team reassignment if needed
 *       - Tournament ownership validation
 *       - Cascade deletion of related data
 *       
 *       **Important Notes:**
 *       - This action is irreversible
 *       - All teams in the group will be unassigned
 *       - Group matches and results may be affected
 *       - Only tournament owner can delete groups
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
 *         description: "Group UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *     responses:
 *       200:
 *         description: Group deleted successfully
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
 *                   example: "Group deleted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedGroupId:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     affectedTeams:
 *                       type: integer
 *                       example: 6
 *                       description: "Number of teams that were unassigned from the group"
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T12:00:00.000Z"
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       400:
 *         description: Invalid group ID or cannot delete group
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
 *                   example: "Cannot delete group"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Cannot delete group with ongoing matches"
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
 *       403:
 *         description: Forbidden - User does not own the tournament
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
 *                   example: "Access denied"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "Only tournament owner can delete groups"
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
 *         description: Group not found
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
 *                   example: "Group not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Group with specified ID does not exist"
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
 *                   example: "Failed to delete group"
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
groupRouter.delete('/delete/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.deleteGroup                                              // DELETE /groups/delete/:id
);

export default groupRouter;