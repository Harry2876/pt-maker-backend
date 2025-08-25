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
 *     summary: Get tournament matches
 *     description: Get all matches for a specific tournament
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
 *         description: Matches retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: No matches found
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
 * /api/v1/matches/tournaments/{tournamentId}/matches:
 *   get:
 *     tags: [Matches]
 *     summary: Get tournament matches
 *     description: Get all matches for a specific tournament
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
 *                   example: "Tournament matches retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Match'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *     summary: Create match for tournament
 *     description: Create a new match for a specific tournament
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
 *             $ref: '#/components/schemas/CreateMatchRequest'
 *     responses:
 *       201:
 *         description: Match created successfully
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
 *     summary: Get match by ID
 *     description: Get a specific match by its ID
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
 *         description: Match retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Match not found
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