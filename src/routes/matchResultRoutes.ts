import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { MatchResultController } from '../controllers/matchResultController';
import { 
    createMatchResultSchema, 
    updateMatchResultSchema, 
    verifyResultsSchema,
    publishResultsSchema,
    matchResultParamsSchema,
    calculateScoresSchema
} from '../validations/matchResultValidation';

/**
 * @swagger
 * tags:
 *   - name: Match Results
 *     description: Match result management operations
 */

const matchResultRouter = express.Router();

// Apply authentication to all match result routes
matchResultRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/matches/{matchId}/results:
 *   post:
 *     tags: [Match Results]
 *     summary: Create match result
 *     description: Create match result with team data (manual entry or screenshot)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
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
 *             type: object
 *             properties:
 *               screenshotUrl:
 *                 type: string
 *                 description: Optional screenshot URL for AI processing
 *               teamResults:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     teamRegistrationId:
 *                       type: string
 *                     teamName:
 *                       type: string
 *                     slotNumber:
 *                       type: integer
 *                     position:
 *                       type: integer
 *                       minimum: 1
 *                       maximum: 25
 *                     kills:
 *                       type: integer
 *                       minimum: 0
 *                     damage:
 *                       type: number
 *                     survivalTime:
 *                       type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Match result created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
matchResultRouter.post('/matches/:matchId/results',
    validateRequest(matchResultParamsSchema, 'params'),
    validateRequest(createMatchResultSchema, 'body'),
    MatchResultController.createMatchResult
);

/**
 * @swagger
 * /api/v1/matches/{matchId}/results:
 *   get:
 *     tags: [Match Results]
 *     summary: Get match results
 *     description: Get all results for a specific match
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: matchId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Match ID
 *     responses:
 *       200:
 *         description: Match results retrieved successfully
 *       404:
 *         description: No results found
 *       401:
 *         description: Unauthorized
 */
matchResultRouter.get('/matches/:matchId/results',
    validateRequest(matchResultParamsSchema, 'params'),
    MatchResultController.getMatchResults
);

/**
 * @swagger
 * /api/v1/results/{resultId}:
 *   get:
 *     tags: [Match Results]
 *     summary: Get match result by ID
 *     description: Get specific match result details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     responses:
 *       200:
 *         description: Match result retrieved successfully
 *       404:
 *         description: Result not found
 *       401:
 *         description: Unauthorized
 */
matchResultRouter.get('/results/:resultId',
    MatchResultController.getMatchResultById
);

/**
 * @swagger
 * /api/v1/results/{resultId}:
 *   put:
 *     tags: [Match Results]
 *     summary: Update match result
 *     description: Update match result data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamResults:
 *                 type: array
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Match result updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Result not found
 */
matchResultRouter.put('/results/:resultId',
    validateRequest(updateMatchResultSchema, 'body'),
    MatchResultController.updateMatchResult
);

/**
 * @swagger
 * /api/v1/results/{resultId}/verify:
 *   post:
 *     tags: [Match Results]
 *     summary: Verify match results
 *     description: Manually verify and correct match results
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               verificationStatus:
 *                 type: string
 *                 enum: [VERIFIED, REJECTED, NEEDS_REVIEW]
 *               teamCorrections:
 *                 type: array
 *               verifierNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Results verified successfully
 *       400:
 *         description: Verification failed
 */
matchResultRouter.post('/results/:resultId/verify',
    validateRequest(verifyResultsSchema, 'body'),
    MatchResultController.verifyResults
);

/**
 * @swagger
 * /api/v1/results/{resultId}/publish:
 *   post:
 *     tags: [Match Results]
 *     summary: Publish verified results
 *     description: Publish verified results to leaderboard and notify teams
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               publishToLeaderboard:
 *                 type: boolean
 *               notifyTeams:
 *                 type: boolean
 *               publishNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Results published successfully
 *       400:
 *         description: Publishing failed
 */
matchResultRouter.post('/results/:resultId/publish',
    validateRequest(publishResultsSchema, 'body'),
    MatchResultController.publishResults
);

/**
 * @swagger
 * /api/v1/results/{resultId}:
 *   delete:
 *     tags: [Match Results]
 *     summary: Delete match result
 *     description: Delete match result and all associated data
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resultId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Result ID
 *     responses:
 *       200:
 *         description: Match result deleted successfully
 *       404:
 *         description: Result not found
 */
matchResultRouter.delete('/results/:resultId',
    MatchResultController.deleteMatchResult
);

/**
 * @swagger
 * /api/v1/tournaments/{tournamentId}/calculate-scores:
 *   post:
 *     tags: [Match Results]
 *     summary: Calculate scores for team results
 *     description: Utility endpoint to calculate scores using tournament scoring rules
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
 *             type: object
 *             properties:
 *               teamResults:
 *                 type: array
 *     responses:
 *       200:
 *         description: Scores calculated successfully
 *       400:
 *         description: Calculation failed
 */
matchResultRouter.post('/tournaments/:tournamentId/calculate-scores',
    validateRequest(calculateScoresSchema, 'body'),
    MatchResultController.calculateScores
);

/**
 * @swagger
 * /api/v1/tournaments/{tournamentId}/results:
 *   get:
 *     tags: [Match Results]
 *     summary: Get tournament results summary
 *     description: Get all results for a tournament with leaderboard data
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
 *         description: Tournament results retrieved successfully
 */
matchResultRouter.get('/tournaments/:tournamentId/results',
    MatchResultController.getTournamentResults
);

export { matchResultRouter };