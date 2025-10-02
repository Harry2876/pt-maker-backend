import express from 'express';
import { LeaderboardController } from '../controllers/leaderboardController';
import { authenticateUser } from '../middleware/auth';

const router = express.Router();

/**
 * @swagger
 * /api/v1/leaderboards/tournament/{tournamentId}:
 *   get:
 *     summary: Get tournament leaderboard
 *     description: Retrieve the complete leaderboard for a specific tournament with all team rankings
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the tournament
 *         example: "clm8k9j0x0000xyz123abc456"
 *     responses:
 *       200:
 *         description: Tournament leaderboard retrieved successfully
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
 *                   example: "Tournament leaderboard retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/TournamentLeaderboard'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Tournament leaderboard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/tournament/:tournamentId', authenticateUser, LeaderboardController.getTournamentLeaderboard);

/**
 * @swagger
 * /api/v1/leaderboards/group/{groupId}:
 *   get:
 *     summary: Get group leaderboard
 *     description: Retrieve the leaderboard for a specific group within a tournament
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the group
 *         example: "clm8k9j0x0001xyz123abc789"
 *     responses:
 *       200:
 *         description: Group leaderboard retrieved successfully
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
 *                   example: "Group leaderboard retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/GroupLeaderboard'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Group leaderboard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/group/:groupId', authenticateUser, LeaderboardController.getGroupLeaderboard);

/**
 * @swagger
 * /api/v1/leaderboards/live/{tournamentId}:
 *   get:
 *     summary: Get live standings
 *     description: Retrieve real-time tournament standings with frequent updates
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the tournament
 *         example: "clm8k9j0x0000xyz123abc456"
 *     responses:
 *       200:
 *         description: Live standings retrieved successfully
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
 *                   example: "Live standings retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/LiveStandings'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Live standings not available
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/live/:tournamentId', authenticateUser, LeaderboardController.getLiveStandings);

/**
 * @swagger
 * /api/v1/leaderboards/refresh/{tournamentId}:
 *   post:
 *     summary: Refresh tournament leaderboard
 *     description: Force regeneration of tournament leaderboard data (handles large tournaments automatically)
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the tournament
 *         example: "clm8k9j0x0000xyz123abc456"
 *     requestBody:
 *       description: Refresh configuration options
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceRefresh:
 *                 type: boolean
 *                 default: true
 *                 description: Force complete regeneration of leaderboard
 *               includeGroups:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific group IDs to refresh (optional)
 *               notifyTeams:
 *                 type: boolean
 *                 default: false
 *                 description: Send notifications to teams about leaderboard update
 *               groupIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of group IDs for batch processing
 *               stageId:
 *                 type: string
 *                 description: Specific tournament stage ID
 *     responses:
 *       200:
 *         description: Leaderboard refresh completed successfully
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
 *                   example: "Leaderboard refreshed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     scale:
 *                       type: string
 *                       enum: [small, medium, large, massive]
 *                       example: "medium"
 *                     teamCount:
 *                       type: integer
 *                       example: 150
 *                     processingStrategy:
 *                       type: string
 *                       enum: [direct, batch, parallel]
 *                       example: "batch"
 *                     message:
 *                       type: string
 *                       example: "Leaderboard processing has been queued and will be available shortly"
 *       400:
 *         description: Bad request - Invalid parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Tournament not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/refresh/:tournamentId', authenticateUser, LeaderboardController.refreshLeaderboard);

/**
 * @swagger
 * /api/v1/leaderboards/search:
 *   post:
 *     summary: Search leaderboard entries
 *     description: Search and filter leaderboard entries across tournaments
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LeaderboardSearchFilters'
 *     responses:
 *       200:
 *         description: Leaderboard search completed successfully
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
 *                   example: "Leaderboard search completed"
 *                 data:
 *                   $ref: '#/components/schemas/LeaderboardSearchResult'
 *       400:
 *         description: Bad request - Invalid search parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/search', authenticateUser, LeaderboardController.searchLeaderboard);

/**
 * @swagger
 * /api/v1/leaderboards/top-performers/{tournamentId}:
 *   get:
 *     summary: Get tournament top performers
 *     description: Retrieve top performing teams based on different criteria
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the tournament
 *         example: "clm8k9j0x0000xyz123abc456"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           default: "10"
 *         description: Number of top performers to return
 *         example: "20"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [points, kills, wins, average]
 *           default: "points"
 *         description: Criteria for ranking top performers
 *         example: "kills"
 *     responses:
 *       200:
 *         description: Top performers retrieved successfully
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
 *                   example: "Top kills performers retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       example: "kills"
 *                     performers:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/LeaderboardEntry'
 *                     count:
 *                       type: integer
 *                       example: 20
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Tournament leaderboard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/top-performers/:tournamentId', authenticateUser, LeaderboardController.getTopPerformers);

/**
 * @swagger
 * /api/v1/leaderboards/stats/{tournamentId}:
 *   get:
 *     summary: Get leaderboard statistics
 *     description: Retrieve comprehensive statistics for tournament leaderboard
 *     tags: [Leaderboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the tournament
 *         example: "clm8k9j0x0000xyz123abc456"
 *     responses:
 *       200:
 *         description: Leaderboard statistics retrieved successfully
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
 *                   example: "Leaderboard statistics retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/LeaderboardStatistics'
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Tournament leaderboard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/stats/:tournamentId', authenticateUser, LeaderboardController.getLeaderboardStats);

export default router;