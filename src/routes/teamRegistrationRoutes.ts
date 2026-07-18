import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TeamRegistrationController } from '../controllers/teamRegistrationController';
import { 
    createTeamRegistrationSchema, 
    updateTeamRegistrationSchema, 
    teamRegistrationParamsSchema,
    tournamentTeamRegistrationParamsSchema 
} from '../validations/teamRegistrationValidation';
import { groupParamsSchema } from '../validations/groupValidation';

/**
 * @swagger
 * tags:
 *   - name: Team Registrations
 *     description: Team registration management operations
 */

const teamRegistrationRouter = express.Router();

// Apply authentication to all team registration routes
teamRegistrationRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/team-registrations/tournaments/{tournamentId}/registrations:
 *   get:
 *     tags: [Team Registrations]
 *     summary: Get all team registrations for a tournament
 *     description: |
 *       Retrieves all team registrations for a specific tournament that the authenticated user owns. Used for managing tournament participants and tracking their status.
 *       
 *       **Features:**
 *       - Returns complete team registration information
 *       - Shows registration status (PENDING, CONFIRMED, QUALIFIED, ELIMINATED)
 *       - Includes group assignments for group-stage tournaments
 *       - Provides points tracking and final positions
 *       - Shows contact information for team communication
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
 *         description: Team registrations retrieved successfully
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
 *                   example: "Team registrations retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     registrations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                             description: "Team name as registered"
 *                           contactInfo:
 *                             type: string
 *                             example: "team.alpha@email.com"
 *                             description: "Team contact information (email/phone)"
 *                           registrationStatus:
 *                             type: string
 *                             enum: ["PENDING", "CONFIRMED", "QUALIFIED", "ELIMINATED"]
 *                             example: "CONFIRMED"
 *                             description: "Current registration/tournament status"
 *                           finalPosition:
 *                             type: integer
 *                             nullable: true
 *                             example: 3
 *                             description: "Final tournament position (null if ongoing)"
 *                           totalPoints:
 *                             type: number
 *                             example: 85
 *                             description: "Total points accumulated in the tournament"
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                             nullable: true
 *                             example: "789e0123-e45f-67g8-h901-234567890123"
 *                             description: "Group ID if tournament has group stages"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-16T14:20:00.000Z"
 *                           dbStatus:
 *                             type: string
 *                             enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                             example: "SYNCED"
 *                             description: "Database synchronization status"
 *                     count:
 *                       type: integer
 *                       example: 16
 *                       description: "Total number of team registrations"
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
 *         description: No team registrations found for the tournament
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
 *                   example: "No team registrations found for the tournament"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Tournament has no team registrations yet"
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
 *                   example: "Failed to retrieve team registrations"
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
// Tournament-specific team registration routes
teamRegistrationRouter.get('/tournaments/:tournamentId/registrations', 
    validateRequest(tournamentTeamRegistrationParamsSchema, 'params'),
    TeamRegistrationController.getTournamentTeamRegistrations               // GET /team-registrations/tournaments/:tournamentId/registrations
);

/**
 * @swagger
 * /api/v1/team-registrations/tournaments/{tournamentId}/registrations/create:
 *   post:
 *     tags: [Team Registrations]
 *     summary: Register a team for a tournament
 *     description: |
 *       Creates a new team registration for a specific tournament. Teams must register before participating in matches and tournaments.
 *       
 *       **Features:**
 *       - Team name validation and uniqueness check
 *       - Contact information management
 *       - Automatic status assignment (PENDING by default)
 *       - Tournament capacity validation
 *       - Entry fee handling (if applicable)
 *       
 *       **Validation Rules:**
 *       - Team name: 2-100 characters, unique within tournament
 *       - Contact info: Valid email or phone number format
 *       - Tournament must be open for registration
 *       - Must not exceed maximum team limit
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
 *               - teamName
 *               - contactInfo
 *             properties:
 *               teamName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "Team Alpha Warriors"
 *                 description: "Team name (must be unique within tournament)"
 *               contactInfo:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 100
 *                 example: "team.alpha@example.com"
 *                 description: "Team contact information (email or phone number)"
 *               registrationNotes:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Looking forward to competing!"
 *                 description: "Optional registration notes from the team"
 *           examples:
 *             basic_registration:
 *               summary: Basic team registration
 *               value:
 *                 teamName: "Team Alpha"
 *                 contactInfo: "team.alpha@example.com"
 *             detailed_registration:
 *               summary: Registration with notes
 *               value:
 *                 teamName: "Elite Gaming Squad"
 *                 contactInfo: "+1-555-123-4567"
 *                 registrationNotes: "Experienced team ready for competitive play"
 *     responses:
 *       201:
 *         description: Team registration created successfully
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
 *                   example: "Team registration created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     teamName:
 *                       type: string
 *                       example: "Team Alpha Warriors"
 *                     contactInfo:
 *                       type: string
 *                       example: "team.alpha@example.com"
 *                     registrationStatus:
 *                       type: string
 *                       enum: ["PENDING", "CONFIRMED", "QUALIFIED", "ELIMINATED"]
 *                       example: "PENDING"
 *                     finalPosition:
 *                       type: integer
 *                       nullable: true
 *                       example: null
 *                     totalPoints:
 *                       type: number
 *                       example: 0
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: null
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
 *         description: Validation error or registration not allowed
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
 *                       example: "Team name already exists in this tournament"
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
 *                 duplicate_team:
 *                   summary: Team name already exists
 *                   value:
 *                     success: false
 *                     message: "Team name already exists in this tournament"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "A team with this name is already registered"
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                     meta:
 *                       timestamp: "2024-01-15T10:30:00.000Z"
 *                       version: "1.0"
 *                 tournament_full:
 *                   summary: Tournament at capacity
 *                   value:
 *                     success: false
 *                     message: "Tournament registration is full"
 *                     error:
 *                       code: "VALIDATION_ERROR"
 *                       details: "Maximum team limit reached"
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
 *         description: Registration closed or forbidden
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
 *                   example: "Registration closed"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "Tournament registration has ended"
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
 *                   example: "Failed to create team registration"
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
teamRegistrationRouter.post('/tournaments/:tournamentId/registrations/create', 
    validateRequest(tournamentTeamRegistrationParamsSchema, 'params'),
    validateRequest(createTeamRegistrationSchema),
    TeamRegistrationController.createTeamRegistration                       // POST /team-registrations/tournaments/:tournamentId/registrations/create
);

/**
 * @swagger
 * /api/v1/team-registrations/groups/{groupId}/registrations:
 *   get:
 *     tags: [Team Registrations]
 *     summary: Get team registrations for a specific group
 *     description: |
 *       Retrieves all team registrations assigned to a specific group within a tournament. Used for managing group-stage competitions and viewing team assignments.
 *       
 *       **Features:**
 *       - Returns teams assigned to the specific group
 *       - Shows current standings and points
 *       - Includes qualification status and progress
 *       - Provides group-specific team statistics
 *       
 *       **Access Control:**
 *       - User must be the tournament owner
 *       - Group must exist and be accessible
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: "Group UUID identifier"
 *         example: "789e0123-e45f-67g8-h901-234567890123"
 *     responses:
 *       200:
 *         description: Group team registrations retrieved successfully
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
 *                   example: "Group team registrations retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     registrations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           teamName:
 *                             type: string
 *                             example: "Team Alpha"
 *                           contactInfo:
 *                             type: string
 *                             example: "team.alpha@example.com"
 *                           registrationStatus:
 *                             type: string
 *                             enum: ["PENDING", "CONFIRMED", "QUALIFIED", "ELIMINATED"]
 *                             example: "CONFIRMED"
 *                           finalPosition:
 *                             type: integer
 *                             nullable: true
 *                             example: 2
 *                             description: "Position within the group (null if ongoing)"
 *                           totalPoints:
 *                             type: number
 *                             example: 78
 *                             description: "Total points accumulated in group stage"
 *                           groupRanking:
 *                             type: integer
 *                             example: 1
 *                             description: "Current ranking within the group"
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                             example: "789e0123-e45f-67g8-h901-234567890123"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-16T14:20:00.000Z"
 *                           dbStatus:
 *                             type: string
 *                             enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                             example: "SYNCED"
 *                     groupInfo:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "789e0123-e45f-67g8-h901-234567890123"
 *                         name:
 *                           type: string
 *                           example: "Group A"
 *                         maxTeams:
 *                           type: integer
 *                           example: 8
 *                         qualificationSpots:
 *                           type: integer
 *                           example: 2
 *                         currentTeamCount:
 *                           type: integer
 *                           example: 6
 *                     count:
 *                       type: integer
 *                       example: 6
 *                       description: "Total number of teams in the group"
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
 *                       example: "Only tournament owner can access group registrations"
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
 *         description: No team registrations found for the group
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
 *                   example: "No team registrations found for the group"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Group has no team registrations yet"
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
 *                   example: "Failed to retrieve group team registrations"
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
// Group-specific team registration routes
teamRegistrationRouter.get('/groups/:groupId/registrations', 
    validateRequest(groupParamsSchema, 'params'),
    TeamRegistrationController.getGroupTeamRegistrations                    // GET /team-registrations/groups/:groupId/registrations
);

/**
 * @swagger
 * /api/v1/team-registrations/get/{id}:
 *   get:
 *     tags: [Team Registrations]
 *     summary: Get team registration details by ID
 *     description: |
 *       Retrieves detailed information for a specific team registration, including tournament context, status, and performance data.
 *       
 *       **Features:**
 *       - Complete team registration information
 *       - Tournament and group context
 *       - Current status and standings  
 *       - Performance metrics and points
 *       
 *       **Access Control:**
 *       - User must be the tournament owner or team contact
 *       - Registration must exist and be accessible
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
 *         description: "Team Registration UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *     responses:
 *       200:
 *         description: Team registration retrieved successfully
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
 *                   example: "Team registration retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     teamName:
 *                       type: string
 *                       example: "Team Alpha Warriors"
 *                     contactInfo:
 *                       type: string
 *                       example: "team.alpha@example.com"
 *                     registrationStatus:
 *                       type: string
 *                       enum: ["PENDING", "CONFIRMED", "QUALIFIED", "ELIMINATED"]
 *                       example: "CONFIRMED"
 *                     finalPosition:
 *                       type: integer
 *                       nullable: true
 *                       example: 3
 *                     totalPoints:
 *                       type: number
 *                       example: 85
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-16T14:20:00.000Z"
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
 *         description: Team registration not found
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
 *                   example: "Team registration not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Team registration with specified ID does not exist"
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
 *                   example: "Failed to retrieve team registration"
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
// Individual team registration operations
teamRegistrationRouter.get('/get/:id', 
    validateRequest(teamRegistrationParamsSchema, 'params'),
    TeamRegistrationController.getTeamRegistrationById                      // GET /team-registrations/get/:id
);

/**
 * @swagger
 * /api/v1/team-registrations/update/{id}:
 *   put:
 *     tags: [Team Registrations]
 *     summary: Update team registration details
 *     description: |
 *       Updates team registration information including team name, contact details, and status. Used for managing team information during tournament lifecycle.
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
 *         description: "Team Registration UUID identifier"
 *         example: "456e7890-e12c-34f5-b678-789012345678"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "Updated Team Name"
 *               contactInfo:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 100
 *                 example: "new.contact@example.com"
 *               registrationStatus:
 *                 type: string
 *                 enum: ["PENDING", "CONFIRMED", "QUALIFIED", "ELIMINATED"]
 *                 example: "CONFIRMED"
 *     responses:
 *       200:
 *         description: Team registration updated successfully
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
 *                   example: "Team registration updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     teamName:
 *                       type: string
 *                       example: "Updated Team Name"
 *                     contactInfo:
 *                       type: string
 *                       example: "new.contact@example.com"
 *                     registrationStatus:
 *                       type: string
 *                       example: "CONFIRMED"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-16T15:30:00.000Z"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-16T15:30:00.000Z"
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
 *                       example: "Team name already exists in tournament"
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
 *         description: Team registration not found
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
 *                   example: "Team registration not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Team registration with specified ID does not exist"
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
 *                   example: "Failed to update team registration"
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
teamRegistrationRouter.put('/update/:id', 
    validateRequest(teamRegistrationParamsSchema, 'params'),
    validateRequest(updateTeamRegistrationSchema),
    TeamRegistrationController.updateTeamRegistration                       // PUT /team-registrations/update/:id
);

teamRegistrationRouter.delete('/delete/:id',
    validateRequest(teamRegistrationParamsSchema, 'params'),
    TeamRegistrationController.deleteTeamRegistration
);

export default teamRegistrationRouter;