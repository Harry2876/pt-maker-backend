import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TournamentStageController } from '../controllers/tournamentStageController';
import {
    createStageSchema,
    updateStageSchema,
    stageParamsSchema,
    tournamentStageParamsSchema
} from '../validations/tournamentStageValidation';

/**
 * @swagger
 * tags:
 *   - name: Tournament Stages
 *     description: Multi-stage tournament management operations
 */

const tournamentStageRouter = express.Router();

// Apply authentication to all tournament stage routes
tournamentStageRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/tournament-stages/tournaments/{tournamentId}/stages:
 *   post:
 *     tags: [Tournament Stages]
 *     summary: Create a new tournament stage
 *     description: Creates a new stage for multi-round tournaments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - stageNumber
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Quarter Finals"
 *               stageNumber:
 *                 type: integer
 *                 example: 2
 *               totalGroups:
 *                 type: integer
 *                 default: 1
 *               qualificationSpots:
 *                 type: integer
 *                 default: 8
 *               stageFormat:
 *                 type: string
 *                 enum: ["ELIMINATION", "ROUND_ROBIN"]
 *                 default: "ELIMINATION"
 *     responses:
 *       201:
 *         description: Tournament stage created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Tournament not found
 */
tournamentStageRouter.post('/tournaments/:tournamentId/stages',
    validateRequest(tournamentStageParamsSchema, 'params'),
    validateRequest(createStageSchema, 'body'),
    TournamentStageController.createStage
);

/**
 * @swagger
 * /api/v1/tournament-stages/tournaments/{tournamentId}/stages:
 *   get:
 *     tags: [Tournament Stages]
 *     summary: Get all stages for a tournament
 *     description: Retrieves all stages for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tournament stages retrieved successfully
 *       404:
 *         description: No stages found or tournament not found
 *       401:
 *         description: Unauthorized
 */
tournamentStageRouter.get('/tournaments/:tournamentId/stages',
    validateRequest(tournamentStageParamsSchema, 'params'),
    TournamentStageController.getTournamentStages
);

/**
 * @swagger
 * /api/v1/tournament-stages/stages/{stageId}:
 *   get:
 *     tags: [Tournament Stages]
 *     summary: Get stage by ID
 *     description: Retrieves a specific tournament stage by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Stage retrieved successfully
 *       404:
 *         description: Stage not found
 *       401:
 *         description: Unauthorized
 */
tournamentStageRouter.get('/stages/:stageId',
    validateRequest(stageParamsSchema, 'params'),
    TournamentStageController.getStageById
);
/**
 * @swagger
 * /api/v1/tournament-stages/stages/{stageId}:
 *   put:
 *     tags: [Tournament Stages]
 *     summary: Update tournament stage
 *     description: Updates an existing tournament stage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               totalGroups:
 *                 type: integer
 *               qualificationSpots:
 *                 type: integer
 *               stageFormat:
 *                 type: string
 *                 enum: ["ELIMINATION", "ROUND_ROBIN"]
 *               isActive:
 *                 type: boolean
 *               isCompleted:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Stage updated successfully
 *       404:
 *         description: Stage not found
 *       401:
 *         description: Unauthorized
 */
tournamentStageRouter.put('/stages/:stageId',
    validateRequest(stageParamsSchema, 'params'),
    validateRequest(updateStageSchema, 'body'),
    TournamentStageController.updateStage
);

/**
 * @swagger
 * /api/v1/tournament-stages/stages/{stageId}:
 *   delete:
 *     tags: [Tournament Stages]
 *     summary: Delete tournament stage
 *     description: Deletes a tournament stage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Stage deleted successfully
 *       404:
 *         description: Stage not found
 *       401:
 *         description: Unauthorized
 */
tournamentStageRouter.delete('/stages/:stageId',
    validateRequest(stageParamsSchema, 'params'),
    TournamentStageController.deleteStage
);

/**
 * @swagger
 * /api/v1/tournament-stages/stages/{stageId}/advance:
 *   post:
 *     tags: [Tournament Stages]
 *     summary: Advance to next tournament stage
 *     description: Completes current stage and activates the next stage
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Stage advanced successfully
 *       400:
 *         description: Cannot advance stage at this time
 *       404:
 *         description: Stage not found
 *       401:
 *         description: Unauthorized
 */
tournamentStageRouter.post('/stages/:stageId/advance',
    validateRequest(stageParamsSchema, 'params'),
    TournamentStageController.advanceStage
);

export default tournamentStageRouter;