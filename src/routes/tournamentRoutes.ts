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
 *     summary: Get user tournaments
 *     description: Get all tournaments created by the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tournaments retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: integer
 *                   example: 5
 *       404:
 *         description: No tournaments found
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
 * /api/v1/tournaments:
 *   get:
 *     tags: [Tournaments]
 *     summary: Get user tournaments
 *     description: Get all tournaments created by the authenticated user
 *     security:
 *       - bearerAuth: []
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
 *                   example: "User tournaments retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Tournament'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Tournament CRUD Operations
tournamentRouter.get('/', TournamentController.getUserTournaments);                    // GET /tournaments

/**
 * @swagger
 * /api/v1/tournaments/create:
 *   post:
 *     tags: [Tournaments]
 *     summary: Create a new tournament
 *     description: Create a new tournament with the provided details
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTournamentRequest'
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
 *                     name:
 *                       type: string
 *                     game:
 *                       type: string
 *                     status:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
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
tournamentRouter.post('/create', 
    validateRequest(createTournamentSchema), 
    TournamentController.createTournament                                             // POST /tournaments/create
);

/**
 * @swagger
 * /api/v1/tournaments/get/{id}:
 *   get:
 *     tags: [Tournaments]
 *     summary: Get tournament by ID
 *     description: Get a specific tournament by its ID
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
 *         description: Tournament retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Tournament not found
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
