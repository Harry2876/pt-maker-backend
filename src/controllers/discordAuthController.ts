import { Request, Response } from "express";
import { DiscordOAuthService } from "../services/discordOAuthService";
import { guildService } from "../services/guildService";
import { dbManager } from "../config/database";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/commonMiddleware";
import { ResponseHelper } from "../utils/responseHelper";
import logger from "../utils/logger";

const prisma = dbManager.getClient();

export class DiscordAuthController {

    // Get Discord OAuth authorization URL
   static getAuthURL(state?: string): string {
logger.info('🤖 GENERATING DISCORD BOT AUTHORIZATION URL');
    
    // Bot authorization requires bot scope + user scopes
    const params = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        redirect_uri: env.DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'bot identify guilds', // Added guilds scope
        permissions: '8' // Administrator permission
    });

    // Only add state if it's a valid string
    if (state && typeof state === 'string' && state !== '[object Object]') {
        params.set('state', state);
    }

    const authURL = `https://discord.com/oauth2/authorize?${params.toString()}`;
    
logger.info(`- Client ID: ${env.DISCORD_CLIENT_ID}`);
logger.info(`- Redirect URI: ${env.DISCORD_REDIRECT_URI}`);
logger.info(`- Scopes: bot identify guilds`);
logger.info(`- Permissions: 8`);
logger.info(`- State: ${state || 'none'}`);
logger.info(`- Generated URL: ${authURL}`);

    return authURL;
}

    // Handle Discord OAuth callback
    static handleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { code, state } = req.body;

            if (!code) {
                return res.status(400).json(ResponseHelper.validationError('Authorization code is required'));
            }

            // Exchange code for tokens
            const tokenData = await DiscordOAuthService.exchangeCodeForToken(code);

            // Get user info
            const discordUser = await DiscordOAuthService.getUser(tokenData.access_token);

            // Get user's guilds
            const guilds = await DiscordOAuthService.getUserGuilds(tokenData.access_token);

            // Store or update Discord user in database
            const user = await prisma.discordUser.upsert({
                where: { id: discordUser.id },
                create: {
                    id: discordUser.id,
                    username: discordUser.username,
                    discriminator: discordUser.discriminator,
                    email: discordUser.email,
                    avatar: discordUser.avatar,
                    verified: discordUser.verified || false,
                    locale: discordUser.locale,
                    mfaEnabled: discordUser.mfa_enabled || false
                },
                update: {
                    username: discordUser.username,
                    discriminator: discordUser.discriminator,
                    email: discordUser.email,
                    avatar: discordUser.avatar,
                    verified: discordUser.verified || false,
                    locale: discordUser.locale,
                    mfaEnabled: discordUser.mfa_enabled || false
                }
            });

            return res.json(ResponseHelper.success('Discord OAuth completed successfully', {
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    verified: user.verified
                },
                guilds: guilds.map(guild => ({
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon,
                    owner: guild.owner,
                    permissions: guild.permissions
                })),
                tokens: {
                    access_token: tokenData.access_token,
                    expires_in: tokenData.expires_in,
                    scope: tokenData.scope
                }
            }));

        } catch (error) {
            logger.error('Discord OAuth callback failed:', error);

            if (error instanceof Error && error.message.includes('Invalid token response')) {
                return res.status(400).json(ResponseHelper.validationError('Invalid authorization code'));
            }

            return res.status(500).json(ResponseHelper.serverError('OAuth authentication failed'));
        }
    });

    // Handle Discord OAuth callback via GET (when OAuth2 Code Grant is enabled)
    static handleOAuthCallbackGet = asyncHandler(async (req: Request, res: Response) => {
        try {
            const queryData = (req as any).validatedQuery || req.query;
            const { code, state, guild_id, permissions } = queryData;

            if (!code) {
                return res.status(400).json(ResponseHelper.validationError('Authorization code is required'));
            }

            // Exchange code for tokens
            const tokenData = await DiscordOAuthService.exchangeCodeForToken(code as string);

            // Get user info
            const discordUser = await DiscordOAuthService.getUser(tokenData.access_token);

            // Get user's guilds
            const guilds = await DiscordOAuthService.getUserGuilds(tokenData.access_token);

            // Store or update Discord user in database
            const user = await prisma.discordUser.upsert({
                where: { id: discordUser.id },
                create: {
                    id: discordUser.id,
                    username: discordUser.username,
                    discriminator: discordUser.discriminator,
                    email: discordUser.email,
                    avatar: discordUser.avatar,
                    verified: discordUser.verified || false,
                    locale: discordUser.locale,
                    mfaEnabled: discordUser.mfa_enabled || false
                },
                update: {
                    username: discordUser.username,
                    discriminator: discordUser.discriminator,
                    email: discordUser.email,
                    avatar: discordUser.avatar,
                    verified: discordUser.verified || false,
                    locale: discordUser.locale,
                    mfaEnabled: discordUser.mfa_enabled || false
                }
            });

            // If guild_id is provided, handle bot installation
            if (guild_id) {
                const guildData = guilds.find(g => g.id === guild_id);
                if (guildData) {
                    // Register guild with backend
                    await guildService.handleBotInstallation({
                        id: guild_id as string,
                        name: guildData.name,
                        icon: guildData.icon,
                        ownerId: discordUser.id,
                        memberCount: 0 // Bot will update this via webhook
                    });

                    logger.info(`Guild ${guildData.name} registered via OAuth callback`);
                }
            }

            // Return JSON response (pure backend)
            return res.json(ResponseHelper.success('Discord OAuth completed successfully', {
                user: {
                    id: user.id,
                    username: user.username,
                    avatar: user.avatar,
                    verified: user.verified
                },
                guild: guild_id ? {
                    id: guild_id,
                    registered: true
                } : null,
                redirectMethod: 'GET',
                tokens: {
                    access_token: tokenData.access_token,
                    expires_in: tokenData.expires_in,
                    scope: tokenData.scope
                }
            }));

        } catch (error) {
            logger.error('Discord OAuth GET callback failed:', error);

            if (error instanceof Error && error.message.includes('Invalid token response')) {
                return res.status(400).json(ResponseHelper.validationError('Invalid authorization code'));
            }

            return res.status(500).json(ResponseHelper.serverError('OAuth authentication failed'));
        }
    });

    // Authorize guild for bot usage
    static authorizeGuild = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { userId, permissions } = req.body;

            // Check if guild exists
            const existingGuild = await guildService.getGuildById(guildId);

            if (!existingGuild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Update guild authorization
            const result = await guildService.updateGuildSettings(guildId, {
                botEnabled: true
            });

            return res.json(ResponseHelper.success('Guild authorized successfully', result));

        } catch (error) {
            logger.error('Guild authorization failed:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to authorize guild'));
        }
    });

    // Get guild information
    static getGuildInfo = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;

            const guild = await guildService.getGuildById(guildId);

            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            return res.json(ResponseHelper.success('Guild information retrieved', {
                guild: {
                    id: guild.id,
                    name: guild.name,
                    icon: guild.icon,
                    memberCount: guild.memberCount,
                    botEnabled: guild.botEnabled,
                    isPremium: guild.isPremium,
                    commandPrefix: guild.commandPrefix,
                    createdAt: guild.createdAt
                }
            }));

        } catch (error) {
            logger.error('Failed to get guild info:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve guild information'));
        }
    });

    // Update guild premium status
    static updateGuildPremium = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { isPremium, premiumUntil } = req.body;

            const result = await guildService.updatePremiumStatus(
                guildId,
                isPremium,
                premiumUntil ? new Date(premiumUntil) : undefined
            );

            return res.json(ResponseHelper.success('Premium status updated successfully', result));

        } catch (error) {
            logger.error('Failed to update premium status:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to update premium status'));
        }
    });

    // Handle bot installation webhook
    static handleBotInstallation = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guild, user } = req.body;

            if (!guild || !guild.id) {
                return res.status(400).json(ResponseHelper.validationError('Invalid guild data'));
            }

            const result = await guildService.handleBotInstallation({
                id: guild.id,
                name: guild.name,
                icon: guild.icon,
                ownerId: guild.owner_id,
                memberCount: guild.member_count
            });

            return res.json(ResponseHelper.success('Bot installation processed', result));

        } catch (error) {
            logger.error('Bot installation failed:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to process bot installation'));
        }
    });
}