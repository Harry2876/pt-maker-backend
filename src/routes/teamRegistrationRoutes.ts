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
 *     summary: Get tournament team registrations
 *     description: Get all team registrations for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Team registrations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: No team registrations found
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

/**
 * @swagger
 * /api/v1/team-registrations/tournaments/{tournamentId}/registrations:
 *   get:
 *     tags: [Team Registrations]
 *     summary: Get tournament team registrations
 *     description: Get all team registrations for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Tournament team registrations retrieved successfully
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
 *                   example: "Tournament team registrations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/TeamRegistration'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *     summary: Create team registration for tournament
 *     description: Create a new team registration for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
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
 *             $ref: '#/components/schemas/CreateTeamRegistrationRequest'
 *     responses:
 *       201:
 *         description: Team registration created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
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
 *     summary: Get group team registrations
 *     description: Get all team registrations for a specific group
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group team registrations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: No team registrations found
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
 *     summary: Get team registration by ID
 *     description: Get a specific team registration by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team Registration ID
 *     responses:
 *       200:
 *         description: Team registration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Team registration not found
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
 *     summary: Update team registration
 *     description: Update team registration details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Team Registration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTeamRegistrationRequest'
 *     responses:
 *       200:
 *         description: Team registration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Team registration not found or not authorized
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
teamRegistrationRouter.put('/update/:id', 
    validateRequest(teamRegistrationParamsSchema, 'params'),
    validateRequest(updateTeamRegistrationSchema),
    TeamRegistrationController.updateTeamRegistration                       // PUT /team-registrations/update/:id
);

export default teamRegistrationRouter;