import express from 'express';
import { z } from 'zod';
import { GuildMemberController } from '../controllers/guildMemberController';
import { BotStateController } from '../controllers/botStateController';
import { DiscordAuthController } from '../controllers/discordAuthController';
import { validateRequest } from '../middleware/commonMiddleware';
import {
    discordOAuthSchema,
    guildIdParamSchema,
    guildAuthSchema,
    createGuildMemberSchema,
    updateGuildMemberSchema,
    guildMemberParamsSchema,
    botStateParamsSchema,
    bulkBotStateSchema,
    botStateFilterSchema,
    bulkCreateMembersSchema,
    updateGuildPremiumSchema,
    discordOAuthGetCallbackSchema,
    botStateHistoryQuerySchema
} from '../validations/discordValidation';

/**
 * @swagger
 * tags:
 *   - name: Discord Integration
 *     description: Discord bot and OAuth integration endpoints
 */

const discordRouter = express.Router();

discordRouter.get('/test', (req, res) => {
    console.log('🎯 SIMPLE TEST ROUTE HIT!');
    res.json({ message: 'Discord router is working!', path: req.path, url: req.url });
});

/**
 * @swagger
 * /api/v1/discord/oauth/url:
 *   get:
 *     tags: [Discord Integration]
 *     summary: Get Discord OAuth authorization URL
 *     description: |
 *       Generates a Discord OAuth authorization URL for user authentication.
 *       
 *       **Features:**
 *       - Supports custom state parameter for CSRF protection
 *       - Includes required scopes: identify, email, guilds
 *       - URL expires in 10 minutes
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Optional state parameter for CSRF protection
 *         example: "csrf_token_123"
 *     responses:
 *       200:
 *         description: Authorization URL generated successfully
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
 *                   example: "Discord authorization URL generated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     authURL:
 *                       type: string
 *                       example: "https://discord.com/oauth2/authorize?..."
 *                     expiresIn:
 *                       type: number
 *                       example: 600
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["identify", "email", "guilds"]
 *       500:
 *         description: Server error
 */
discordRouter.get('/oauth/url', DiscordAuthController.getAuthURL);

/**
 * @swagger
 * /api/v1/discord/bot/invite:
 *   get:
 *     tags: [Discord Integration]
 *     summary: Get Discord Bot Invite URL
 *     description: |
 *       Generates a Discord bot invite URL for adding the bot to servers.
 *       
 *       **Features:**
 *       - Configurable bot permissions
 *       - Direct server invitation link
 *       - No OAuth flow required for bot invitation
 *     parameters:
 *       - in: query
 *         name: permissions
 *         schema:
 *           type: string
 *         description: Bot permissions (numeric string)
 *         example: "8"
 *     responses:
 *       200:
 *         description: Bot invite URL generated successfully
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
 *                   example: "Bot invite URL generated"
 *                 data:
 *                   type: object
 *                   properties:
 *                     inviteURL:
 *                       type: string
 *                       example: "https://discord.com/oauth2/authorize?client_id=...&scope=bot&permissions=8"
 *                     instructions:
 *                       type: string
 *                       example: "Share this URL with Discord server owners to add the bot"
 *                     permissions:
 *                       type: string
 *                       example: "8"
 *       500:
 *         description: Server error
 */
discordRouter.get('/bot/invite', DiscordAuthController.getBotInviteURL);

/**
 * @swagger
 * /api/v1/discord/oauth/callback:
 *   post:
 *     tags: [Discord Integration]
 *     summary: Handle Discord OAuth callback
 *     description: |
 *       Processes the Discord OAuth callback with authorization code.
 *       
 *       **Features:**
 *       - Exchanges authorization code for access token
 *       - Retrieves user information and guilds
 *       - Stores user data in database
 *       - Returns user info and accessible guilds
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: Discord authorization code
 *                 example: "discord_auth_code_here"
 *               state:
 *                 type: string
 *                 description: Optional state parameter for verification
 *                 example: "csrf_token_123"
 *     responses:
 *       200:
 *         description: OAuth completed successfully
 *       400:
 *         description: Invalid authorization code
 *       500:
 *         description: OAuth authentication failed
 */
discordRouter.post('/oauth/callback',
    validateRequest(discordOAuthSchema),
    DiscordAuthController.handleOAuthCallback
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}:
 *   get:
 *     tags: [Discord Integration]
 *     summary: Get guild information
 *     description: Retrieves detailed information about a Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *         example: "123456789012345678"
 *     responses:
 *       200:
 *         description: Guild information retrieved successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId',
    validateRequest(guildIdParamSchema, 'params'),
    DiscordAuthController.getGuildInfo
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/authorize:
 *   post:
 *     tags: [Discord Integration]
 *     summary: Authorize guild for bot usage
 *     description: Authorizes a Discord guild to use the bot with specific permissions
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Discord user ID authorizing the guild
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of permissions to grant
 *     responses:
 *       200:
 *         description: Guild authorized successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Authorization failed
 */
discordRouter.post('/guilds/:guildId/authorize',
    validateRequest(guildIdParamSchema, 'params'),
    DiscordAuthController.authorizeGuild
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/premium:
 *   put:
 *     tags: [Discord Integration]
 *     summary: Update guild premium status
 *     description: Updates the premium subscription status for a Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - isPremium
 *             properties:
 *               isPremium:
 *                 type: boolean
 *                 description: Premium status
 *                 example: true
 *               premiumUntil:
 *                 type: string
 *                 format: date-time
 *                 description: Premium expiration date (ISO 8601)
 *                 example: "2024-12-31T23:59:59Z"
 *     responses:
 *       200:
 *         description: Premium status updated successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Update failed
 */
discordRouter.put('/guilds/:guildId/premium',
    validateRequest(guildIdParamSchema, 'params'),
    validateRequest(updateGuildPremiumSchema),
    DiscordAuthController.updateGuildPremium
);

/**
 * @swagger
 * /api/v1/discord/webhooks/bot-install:
 *   post:
 *     tags: [Discord Integration]
 *     summary: Handle bot installation webhook
 *     description: |
 *       Webhook endpoint for Discord to notify when the bot is installed to a guild.
 *       This is called automatically by Discord when someone adds your bot to their server.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - guild
 *             properties:
 *               guild:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   icon:
 *                     type: string
 *                   owner_id:
 *                     type: string
 *                   member_count:
 *                     type: number
 *               user:
 *                 type: object
 *                 description: User who installed the bot
 *     responses:
 *       200:
 *         description: Bot installation processed successfully
 *       400:
 *         description: Invalid guild data
 *       500:
 *         description: Installation processing failed
 */
discordRouter.post('/webhooks/bot-install', DiscordAuthController.handleBotInstallation);

/**
 * @swagger
 * /api/v1/discord/webhooks/bot-removal:
 *   post:
 *     tags: [Discord Webhooks]
 *     summary: Handle bot removal webhook
 *     description: |
 *       Webhook endpoint for Discord to notify when the bot is removed from a guild.
 *       Tracks bot state and updates guild settings accordingly.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               guild:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *               user:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *             required:
 *               - guild
 *     responses:
 *       200:
 *         description: Bot removal processed successfully
 *       400:
 *         description: Invalid guild data
 *       500:
 *         description: Removal processing failed
 */
discordRouter.post('/webhooks/bot-removal', DiscordAuthController.handleBotRemoval);


discordRouter.get('/oauth/callback',
    validateRequest(discordOAuthGetCallbackSchema, 'query'),
    DiscordAuthController.handleOAuthCallbackGet
);

// Guild Members Management Routes

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members:
 *   get:
 *     tags: [Discord Guild Members]
 *     summary: Get all members in a guild
 *     description: Retrieves all members for a specific Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     responses:
 *       200:
 *         description: Guild members retrieved successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/members',
    validateRequest(guildIdParamSchema, 'params'),
    GuildMemberController.getGuildMembers
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members/count:
 *   get:
 *     tags: [Discord Guild Members]
 *     summary: Get member count for a guild
 *     description: Returns the total number of members in a guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     responses:
 *       200:
 *         description: Member count retrieved successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/members/count',
    validateRequest(guildIdParamSchema, 'params'),
    GuildMemberController.getGuildMemberCount
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members/{memberId}:
 *   get:
 *     tags: [Discord Guild Members]
 *     summary: Get specific guild member
 *     description: Retrieves details of a specific guild member
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild member ID
 *     responses:
 *       200:
 *         description: Guild member retrieved successfully
 *       404:
 *         description: Guild member not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/members/:memberId',
    validateRequest(guildMemberParamsSchema, 'params'),
    GuildMemberController.getGuildMember
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members:
 *   post:
 *     tags: [Discord Guild Members]
 *     summary: Add member to guild
 *     description: Adds a new member to a Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 pattern: '^\d{17,19}$'
 *                 description: Discord user ID
 *               nickname:
 *                 type: string
 *                 maxLength: 32
 *                 description: Member nickname
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of role IDs
 *     responses:
 *       201:
 *         description: Guild member added successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Guild not found
 *       409:
 *         description: Member already exists
 *       500:
 *         description: Server error
 */
discordRouter.post('/guilds/:guildId/members',
    validateRequest(guildIdParamSchema, 'params'),
    validateRequest(createGuildMemberSchema),
    GuildMemberController.addGuildMember
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members/{memberId}:
 *   put:
 *     tags: [Discord Guild Members]
 *     summary: Update guild member
 *     description: Updates a guild member's information
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild member ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 maxLength: 32
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *               isAdmin:
 *                 type: boolean
 *               canManageTournaments:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Guild member updated successfully
 *       404:
 *         description: Guild member not found
 *       500:
 *         description: Server error
 */
discordRouter.put('/guilds/:guildId/members/:memberId',
    validateRequest(guildMemberParamsSchema, 'params'),
    validateRequest(updateGuildMemberSchema),
    GuildMemberController.updateGuildMember
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members/{memberId}:
 *   delete:
 *     tags: [Discord Guild Members]
 *     summary: Remove guild member
 *     description: Removes a member from a Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guild member ID
 *     responses:
 *       200:
 *         description: Guild member removed successfully
 *       404:
 *         description: Guild member not found
 *       500:
 *         description: Server error
 */
discordRouter.delete('/guilds/:guildId/members/:memberId',
    validateRequest(guildMemberParamsSchema, 'params'),
    GuildMemberController.removeGuildMember
);

// Bot State Management Routes

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/bot-state:
 *   get:
 *     tags: [Discord Bot State]
 *     summary: Get current bot state for a guild
 *     description: Retrieves the current bot state and history for a specific Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     responses:
 *       200:
 *         description: Bot state retrieved successfully
 *       404:
 *         description: Guild not found or no bot state found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/bot-state',
    validateRequest(botStateParamsSchema, 'params'),
    BotStateController.getBotState
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/bot-state/history:
 *   get:
 *     tags: [Discord Bot State]
 *     summary: Get bot state history for a guild
 *     description: Retrieves the state change history for a specific Discord guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *         description: Number of history records to retrieve (default 10, max 100)
 *     responses:
 *       200:
 *         description: Bot state history retrieved successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/bot-state/history',
    validateRequest(botStateParamsSchema, 'params'),
    validateRequest(botStateHistoryQuerySchema, 'query'),
    BotStateController.getBotStateHistory
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/bot-active:
 *   get:
 *     tags: [Discord Bot State]
 *     summary: Check if bot is active in guild
 *     description: Quick check to determine if the bot is currently active in a guild
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     responses:
 *       200:
 *         description: Bot active status retrieved successfully
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.get('/guilds/:guildId/bot-active',
    validateRequest(botStateParamsSchema, 'params'),
    BotStateController.checkBotActive
);

/**
 * @swagger
 * /api/v1/discord/bot-states/bulk-check:
 *   post:
 *     tags: [Discord Bot State]
 *     summary: Bulk check bot states for multiple guilds
 *     description: |
 *       Check bot states for multiple guilds in a single request.
 *       Maximum 50 guild IDs per request for performance.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - guildIds
 *             properties:
 *               guildIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   pattern: '^\d{17,19}$'
 *                 minItems: 1
 *                 maxItems: 50
 *                 description: Array of Discord guild IDs to check
 *     responses:
 *       200:
 *         description: Bulk bot state check completed successfully
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Server error
 */
discordRouter.post('/bot-states/bulk-check',
    validateRequest(bulkBotStateSchema),
    BotStateController.bulkCheckBotStates
);

/**
 * @swagger
 * /api/v1/discord/bot-analytics:
 *   get:
 *     tags: [Discord Bot State]
 *     summary: Get bot state analytics
 *     description: Retrieves comprehensive bot state analytics and statistics
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [ACTIVE, REMOVED, REINSTALLED, PERMISSION_CHANGED, SUSPENDED, MAINTENANCE]
 *         description: Filter analytics by specific bot state
 *     responses:
 *       200:
 *         description: Bot analytics retrieved successfully
 *       500:
 *         description: Server error
 */
discordRouter.get('/bot-analytics',
    validateRequest(botStateFilterSchema, 'query'),
    BotStateController.getBotAnalytics
);

/**
 * @swagger
 * /api/v1/discord/bot-states/{state}/guilds:
 *   get:
 *     tags: [Discord Bot State]
 *     summary: Get guilds by bot state
 *     description: Retrieves all guilds that have a specific bot state
 *     parameters:
 *       - in: path
 *         name: state
 *         required: true
 *         schema:
 *           type: string
 *           enum: [ACTIVE, REMOVED, REINSTALLED, PERMISSION_CHANGED, SUSPENDED, MAINTENANCE]
 *         description: Bot state to filter by
 *     responses:
 *       200:
 *         description: Guilds by bot state retrieved successfully
 *       400:
 *         description: Invalid bot state
 *       500:
 *         description: Server error
 */
discordRouter.get('/bot-states/:state/guilds',
    BotStateController.getGuildsByBotState
);

/**
 * @swagger
 * /api/v1/discord/guilds/{guildId}/members/bulk-sync:
 *   post:
 *     tags: [Discord Guild Members]
 *     summary: Bulk sync guild members
 *     description: |
 *       Bulk synchronization of guild members when bot joins a guild.
 *       Efficiently syncs up to 500 members in one request.
 *     parameters:
 *       - in: path
 *         name: guildId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{17,19}$'
 *         description: Discord guild ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - members
 *             properties:
 *               members:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - userId
 *                   properties:
 *                     userId:
 *                       type: string
 *                       pattern: '^\d{17,19}$'
 *                       description: Discord user ID
 *                     nickname:
 *                       type: string
 *                       maxLength: 32
 *                       description: Member nickname
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of role IDs
 *                     joinedAt:
 *                       type: string
 *                       format: date-time
 *                       description: When member joined guild
 *                 minItems: 1
 *                 maxItems: 500
 *                 description: Array of members to sync
 *     responses:
 *       201:
 *         description: Guild members synced successfully
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: Guild not found
 *       500:
 *         description: Server error
 */
discordRouter.post('/guilds/:guildId/members/bulk-sync',
    validateRequest(guildIdParamSchema, 'params'),
    validateRequest(bulkCreateMembersSchema),
    GuildMemberController.bulkSyncGuildMembers
);

export default discordRouter;