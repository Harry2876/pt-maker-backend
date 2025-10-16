import express from 'express';
import { z } from 'zod'; 
import { DiscordAuthController } from '../controllers/discordAuthController';
import { validateRequest } from '../middleware/commonMiddleware';
import { 
    discordOAuthSchema, 
    guildIdParamSchema, 
    guildAuthSchema,
    updateGuildPremiumSchema,
    updateGuildSettingsSchema, 
    discordOAuthGetCallbackSchema
} from '../validations/discordValidation';

/**
 * @swagger
 * tags:
 *   - name: Discord Integration
 *     description: Discord bot and OAuth integration endpoints
 */

const discordRouter = express.Router();


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


discordRouter.get('/oauth/callback', 
    validateRequest(discordOAuthGetCallbackSchema, 'query'), 
    DiscordAuthController.handleOAuthCallbackGet
);

export default discordRouter;