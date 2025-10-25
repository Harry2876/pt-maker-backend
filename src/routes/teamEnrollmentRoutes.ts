import express from 'express';
import { TeamEnrollmentController } from '../controllers/teamEnrollmentController';
import { TeamManagementController } from '../controllers/teamManagementController';
import { validateRequest } from '../middleware/commonMiddleware';
import {
    createTeamEnrollmentSchema,
    updateTeamEnrollmentSchema,
    guildTeamParamsSchema,
    guildIdParamSchema,
    leaderParamsSchema,
    rateLimitParamsSchema,
    setRateLimitSchema,
    teamQuerySchema,
    getTeamNameHistoryParamsSchema,
    getUserTeamsParamsSchema,
    transferLeadershipSchema,
    updatePlayersSchema,
    changeTeamNameSchema
} from '../validations/teamEnrollmentValidation';

/**
 * @swagger
 * tags:
 *   - name: Team Enrollment
 *     description: Discord team enrollment and management endpoints
 */

const teamEnrollmentRouter = express.Router();

// ========================================
// TEAM ENROLLMENT ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/teams/{guildId}/enroll:
 *   post:
 *     tags: [Team Enrollment]
 *     summary: Create new team enrollment
 *     description: |
 *       Creates a new team enrollment for a Discord guild.
 *       
 *       **Features:**
 *       - Auto-generates unique team ID
 *       - Rate limiting per user/guild
 *       - Redis caching with database sync
 *       - Activity logging
 *       
 *       **Rate Limits:**
 *       - 3 enrollments per hour per user
 *       - Configurable by guild admins
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - teamName
 *               - leaderId
 *               - leaderIgn
 *               - leaderDiscord
 *               - players
 *             properties:
 *               teamName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 pattern: '^[a-zA-Z0-9\s\-_]+$'
 *                 description: Team display name
 *                 example: "Phantom Warriors"
 *               leaderId:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Discord ID of team leader
 *                 example: "123456789012345678"
 *               leaderIgn:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 16
 *                 description: Leader's in-game name
 *                 example: "PhantomLeader"
 *               leaderDiscord:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Leader's Discord ID (for verification)
 *                 example: "123456789012345678"
 *               players:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 items:
 *                   type: object
 *                   required:
 *                     - discordId
 *                     - ign
 *                   properties:
 *                     discordId:
 *                       type: string
 *                       pattern: '^\d{17,19}$'
 *                       description: Player's Discord ID
 *                       example: "987654321098765432"
 *                     ign:
 *                       type: string
 *                       minLength: 3
 *                       maxLength: 16
 *                       description: Player's in-game name
 *                       example: "PhantomPlayer1"
 *                     role:
 *                       type: string
 *                       enum: [player, substitute]
 *                       default: player
 *                       description: Player role in team
 *               threadId:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Discord thread ID for team discussions
 *                 example: "456789012345678901"
 *               enrolledBy:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Discord ID of user who enrolled the team
 *                 example: "123456789012345678"
 *     responses:
 *       201:
 *         description: Team enrollment created successfully
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
 *                   example: "Team enrollment created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     teamId:
 *                       type: string
 *                       example: "team_123456789012345678_phantomwarriors"
 *                     enrollmentStep:
 *                       type: number
 *                       example: 1
 *                     isVerified:
 *                       type: boolean
 *                       example: false
 *                     isComplete:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Invalid request data or rate limit exceeded
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.post(
    '/:guildId/enroll',
    validateRequest(guildIdParamSchema, 'params'),
    validateRequest(createTeamEnrollmentSchema),
    TeamEnrollmentController.createTeamEnrollment
);

/**
 * @swagger
 * /api/v1/teams/{guildId}:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get all teams for a guild
 *     description: |
 *       Retrieves all team enrollments for a specific Discord guild.
 *       
 *       **Features:**
 *       - Redis caching with 5-minute TTL
 *       - Filtering by verification status
 *       - Filtering by completion status
 *       - Filtering by enrollment step
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter by verification status
 *         example: "true"
 *       - in: query
 *         name: completed
 *         schema:
 *           type: string
 *           enum: ['true', 'false']
 *         description: Filter by completion status
 *         example: "false"
 *       - in: query
 *         name: step
 *         schema:
 *           type: string
 *           pattern: '^[1-5]$'
 *         description: Filter by enrollment step (1-5)
 *         example: "2"
 *     responses:
 *       200:
 *         description: Teams retrieved successfully
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
 *                   example: "Teams retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       teamId:
 *                         type: string
 *                         example: "team_123456789012345678_phantomwarriors"
 *                       teamName:
 *                         type: string
 *                         example: "Phantom Warriors"
 *                       guildId:
 *                         type: string
 *                         example: "123456789012345678"
 *                       leaderId:
 *                         type: string
 *                         example: "123456789012345678"
 *                       enrollmentStep:
 *                         type: number
 *                         example: 2
 *                       isVerified:
 *                         type: boolean
 *                         example: false
 *                       isComplete:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-10-25T10:30:00Z"
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId',
    validateRequest(guildIdParamSchema, 'params'),
    validateRequest(teamQuerySchema, 'query'),
    TeamEnrollmentController.getTeamsByGuild
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get specific team details
 *     description: |
 *       Retrieves detailed information for a specific team.
 *       
 *       **Features:**
 *       - Full team data including players
 *       - Activity history
 *       - Verification status
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Team name
 *         example: "Phantom Warriors"
 *     responses:
 *       200:
 *         description: Team details retrieved successfully
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/:teamName',
    validateRequest(guildTeamParamsSchema, 'params'),
    TeamEnrollmentController.getTeamByName
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}:
 *   put:
 *     tags: [Team Enrollment]
 *     summary: Update team enrollment
 *     description: |
 *       Updates an existing team enrollment.
 *       
 *       **Features:**
 *       - Partial updates supported
 *       - Activity logging
 *       - Auto-cache invalidation
 *       - Verification workflow support
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Current team name
 *         example: "Phantom Warriors"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 pattern: '^[a-zA-Z0-9\s\-_]+$'
 *                 description: New team name
 *                 example: "Elite Phantoms"
 *               leaderIgn:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 16
 *                 description: Updated leader IGN
 *                 example: "EliteLeader"
 *               players:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 10
 *                 description: Updated player list
 *               isVerified:
 *                 type: boolean
 *                 description: Verification status
 *                 example: true
 *               isComplete:
 *                 type: boolean
 *                 description: Completion status
 *                 example: false
 *               enrollmentStep:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Current enrollment step
 *                 example: 3
 *               threadId:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Updated thread ID
 *               verifiedAt:
 *                 type: string
 *                 format: date-time
 *                 description: Verification timestamp
 *     responses:
 *       200:
 *         description: Team updated successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.put(
    '/:guildId/:teamName',
    validateRequest(guildTeamParamsSchema, 'params'),
    validateRequest(updateTeamEnrollmentSchema),
    TeamEnrollmentController.updateTeamEnrollment
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}:
 *   delete:
 *     tags: [Team Enrollment]
 *     summary: Delete team enrollment
 *     description: |
 *       Deletes a team enrollment and all associated data.
 *       
 *       **Features:**
 *       - Soft delete with activity logging
 *       - Cache invalidation
 *       - Cleanup of related data
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Team name to delete
 *         example: "Phantom Warriors"
 *     responses:
 *       200:
 *         description: Team deleted successfully
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.delete(
    '/:guildId/:teamName',
    validateRequest(guildTeamParamsSchema, 'params'),
    TeamEnrollmentController.deleteTeamEnrollment
);

// ========================================
// TEAM MANAGEMENT ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/teams/{guildId}/leader/{leaderDiscord}:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get teams by leader
 *     description: |
 *       Retrieves all teams led by a specific Discord user.
 *       
 *       **Features:**
 *       - Cross-guild search capability
 *       - Leadership history
 *       - Team statistics
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: leaderDiscord
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Leader's Discord ID
 *         example: "987654321098765432"
 *     responses:
 *       200:
 *         description: Teams retrieved successfully
 *       404:
 *         description: No teams found for this leader
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/leader/:leaderDiscord',
    validateRequest(leaderParamsSchema, 'params'),
    TeamManagementController.getTeamsByLeader
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/activity/{teamName}:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get team activity history
 *     description: |
 *       Retrieves the complete activity log for a team.
 *       
 *       **Features:**
 *       - Chronological activity timeline
 *       - Action details and metadata
 *       - User attribution
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         description: Team name
 *         example: "Phantom Warriors"
 *     responses:
 *       200:
 *         description: Activity history retrieved successfully
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/activity/:teamName',
    validateRequest(guildTeamParamsSchema, 'params'),
    TeamManagementController.getTeamActivityHistory
);

// ========================================
// RATE LIMITING ROUTES
// ========================================

/**
 * @swagger
 * /api/v1/teams/{guildId}/rate-limit/{userId}/{action}:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Check user rate limit status
 *     description: |
 *       Checks the current rate limit status for a user and action type.
 *       
 *       **Features:**
 *       - Real-time rate limit checking
 *       - Remaining cooldown time
 *       - Action-specific limits
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: User's Discord ID
 *         example: "987654321098765432"
 *       - in: path
 *         name: action
 *         required: true
 *         schema:
 *           type: string
 *           enum: [enrollment, leadership_management]
 *         description: Action type to check
 *         example: "enrollment"
 *     responses:
 *       200:
 *         description: Rate limit status retrieved
 *       404:
 *         description: No rate limit data found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/rate-limit/:userId/:action',
    validateRequest(rateLimitParamsSchema, 'params'),
    TeamManagementController.checkRateLimit
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/rate-limit/{userId}/{action}:
 *   post:
 *     tags: [Team Enrollment]
 *     summary: Set user rate limit
 *     description: |
 *       Sets or updates rate limit for a specific user and action.
 *       
 *       **Features:**
 *       - Admin override capabilities
 *       - Custom cooldown periods
 *       - Audit logging
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: User's Discord ID
 *         example: "987654321098765432"
 *       - in: path
 *         name: action
 *         required: true
 *         schema:
 *           type: string
 *           enum: [enrollment, leadership_management]
 *         description: Action type
 *         example: "enrollment"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cooldownMinutes
 *             properties:
 *               cooldownMinutes:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 1440
 *                 description: Cooldown period in minutes (max 24 hours)
 *                 example: 180
 *               isAdmin:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this is an admin override
 *                 example: false
 *     responses:
 *       200:
 *         description: Rate limit set successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.post(
    '/:guildId/rate-limit/:userId/:action',
    validateRequest(rateLimitParamsSchema, 'params'),
    validateRequest(setRateLimitSchema),
    TeamManagementController.setRateLimit
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/teams/{teamName}/name-history:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get team name change history
 *     description: |
 *       Get team name change history to check 15-day restriction.
 *       
 *       **Features:**
 *       - Check if team can change name (15-day limit)
 *       - Get last change date and next available date
 *       - Count of total name changes
 *       
 *       **Used by Discord bot for:**
 *       - Team name change validation
 *       - 15-day restriction enforcement
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *         description: Team name to check history for
 *     responses:
 *       200:
 *         description: Team name change history retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 canChange:
 *                   type: boolean
 *                   description: Whether team can change name now
 *                 lastChangeDate:
 *                   type: string
 *                   format: date-time
 *                   description: Date of last name change
 *                 nextAvailable:
 *                   type: string
 *                   format: date-time
 *                   description: Next date when name change is allowed
 *                 changesCount:
 *                   type: integer
 *                   description: Total number of name changes
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/teams/:teamName/name-history',
    validateRequest(getTeamNameHistoryParamsSchema, 'params'),
    TeamEnrollmentController.getTeamNameChangeHistory
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/users/{discordTag}/teams:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Get teams where user is a leader
 *     description: |
 *       Get all teams where the specified user is a leader.
 *       
 *       **Features:**
 *       - Returns all teams led by the user
 *       - Used for leadership management
 *       - Cached response with database fallback
 *       
 *       **Used by Discord bot for:**
 *       - szLeadership command
 *       - Team management interface
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord guild ID
 *       - in: path
 *         name: discordTag
 *         required: true
 *         schema:
 *           type: string
 *         description: Discord tag of the user
 *     responses:
 *       200:
 *         description: User teams retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 teams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       teamName:
 *                         type: string
 *                       leader:
 *                         type: object
 *                       players:
 *                         type: array
 *                 totalCount:
 *                   type: integer
 *       404:
 *         description: No teams found for this user
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/users/:discordTag/teams',
    validateRequest(getUserTeamsParamsSchema, 'params'),
    TeamEnrollmentController.getUserTeams
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/players/{discordTag}/check:
 *   get:
 *     tags: [Team Enrollment]
 *     summary: Check if player is already enrolled
 *     description: |
 *       Check if a Discord user is already enrolled in any team within the guild.
 *       Used for duplicate enrollment prevention.
 *       
 *       **Features:**
 *       - Checks enrollment across all teams in guild
 *       - Returns team name and player role if enrolled
 *       - Redis caching for fast lookups
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: discordTag
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *         description: Discord user tag to check
 *         example: "PlayerUser#1234"
 *     responses:
 *       200:
 *         description: Player enrollment check completed
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
 *                   example: "Player enrollment found"
 *                 data:
 *                   type: object
 *                   properties:
 *                     isEnrolled:
 *                       type: boolean
 *                       example: true
 *                     teamName:
 *                       type: string
 *                       example: "Elite Phantoms"
 *                     playerRole:
 *                       type: string
 *                       example: "leader"
 *       400:
 *         description: Invalid request parameters
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.get(
    '/:guildId/players/:discordTag/check',
    validateRequest(getUserTeamsParamsSchema, 'params'), // Reusing same validation schema
    TeamEnrollmentController.checkPlayerEnrollment
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}/transfer-leadership:
 *   put:
 *     tags: [Team Enrollment]
 *     summary: Transfer team leadership
 *     description: |
 *       Transfer team leadership to another team member.
 *       
 *       **Features:**
 *       - Validates new leader is current team member
 *       - Updates leadership in cache and database
 *       - Logs transfer activity for audit trail
 *       - Queue synchronization with Discord
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *         description: Team name to transfer leadership for
 *         example: "Elite Phantoms"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newLeaderDiscordTag
 *               - newLeaderIgn
 *             properties:
 *               newLeaderDiscordTag:
 *                 type: string
 *                 minLength: 3
 *                 description: Discord tag of new leader
 *                 example: "NewLeader#1234"
 *               newLeaderIgn:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 16
 *                 description: In-game name of new leader
 *                 example: "NewLeaderIGN"
 *               currentLeaderDiscordTag:
 *                 type: string
 *                 description: Current leader Discord tag (for validation)
 *                 example: "CurrentLeader#5678"
 *               transferredBy:
 *                 type: string
 *                 description: Who performed the transfer (defaults to current leader)
 *                 example: "AdminUser#9999"
 *     responses:
 *       200:
 *         description: Leadership transferred successfully
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
 *                   example: "Leadership transferred successfully"
 *                 data:
 *                   type: object
 *                   description: Updated team enrollment data
 *       400:
 *         description: Transfer validation failed
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.put(
    '/:guildId/:teamName/transfer-leadership',
    validateRequest(guildTeamParamsSchema, 'params'),
    validateRequest(transferLeadershipSchema),
    TeamEnrollmentController.transferTeamLeadership
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}/update-players:
 *   put:
 *     tags: [Team Enrollment]
 *     summary: Update team players
 *     description: |
 *       Update the player list for a team.
 *       
 *       **Features:**
 *       - Updates complete player roster
 *       - Validates player data format
 *       - Logs player changes for audit trail
 *       - Updates cache and syncs to database
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *         description: Team name to update players for
 *         example: "Elite Phantoms"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - players
 *             properties:
 *               players:
 *                 type: array
 *                 minItems: 1
 *                 description: Updated player list
 *                 items:
 *                   type: object
 *                   properties:
 *                     ign:
 *                       type: string
 *                       description: Player in-game name
 *                       example: "PlayerIGN"
 *                     discordTag:
 *                       type: string
 *                       description: Player Discord tag
 *                       example: "Player#1234"
 *                     discordId:
 *                       type: string
 *                       description: Player Discord ID (optional)
 *                       example: "123456789012345678"
 *                     role:
 *                       type: string
 *                       description: Player role (optional)
 *                       example: "member"
 *     responses:
 *       200:
 *         description: Players updated successfully
 *       400:
 *         description: Invalid player data
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.put(
    '/:guildId/:teamName/update-players',
    validateRequest(guildTeamParamsSchema, 'params'),
    validateRequest(updatePlayersSchema),
    TeamEnrollmentController.updateTeamPlayers
);

/**
 * @swagger
 * /api/v1/teams/{guildId}/{teamName}/change-name:
 *   put:
 *     tags: [Team Enrollment]
 *     summary: Change team name
 *     description: |
 *       Change team name with 15-day rate limiting.
 *       
 *       **Features:**
 *       - 15-day cooldown between name changes
 *       - Validates new name format
 *       - Logs name change history
 *       - Updates all references and cache
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *       - in: path
 *         name: teamName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 3
 *           maxLength: 50
 *         description: Current team name
 *         example: "Elite Phantoms"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newTeamName
 *               - changedBy
 *             properties:
 *               newTeamName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 description: New team name
 *                 example: "Phoenix Rising"
 *               changedBy:
 *                 type: string
 *                 description: Who requested the name change
 *                 example: "TeamLeader#1234"
 *     responses:
 *       200:
 *         description: Team name changed successfully
 *       400:
 *         description: Name change not allowed (15-day limit) or invalid data
 *       404:
 *         description: Team not found
 *       500:
 *         description: Server error
 */
teamEnrollmentRouter.put(
    '/:guildId/:teamName/change-name',
    validateRequest(guildTeamParamsSchema, 'params'),
    validateRequest(changeTeamNameSchema),
    TeamEnrollmentController.changeTeamName
);

export default teamEnrollmentRouter;