import axios from 'axios';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    email?: string;
    avatar?: string;
    verified?: boolean;
    locale?: string;
    mfa_enabled?: boolean;
}

export interface DiscordGuild {
    id: string;
    name: string;
    icon?: string;
    owner: boolean;
    permissions: string;
    features: string[];
}

export class DiscordOAuthService {
    private static readonly API_BASE = 'https://discord.com/api/v10';
    private static logger = logger;

    static getAuthURL(state?: string): string {
        const params = new URLSearchParams({
            client_id: env.DISCORD_CLIENT_ID,
            redirect_uri: env.DISCORD_REDIRECT_URI,
            response_type: 'code',
            scope: 'bot identify guilds',
            permissions: '8'
        });

        if (state && typeof state === 'string' && state !== '[object Object]') {
            params.set('state', state);
        }

        const authURL = `https://discord.com/oauth2/authorize?${params.toString()}`;
        this.logger.info('Generated Discord bot authorization URL');
        return authURL;
    }

    static getBotInviteURL(permissions?: string): string {
        const params = new URLSearchParams({
            client_id: env.DISCORD_CLIENT_ID,
            scope: 'bot applications.commands',
            permissions: permissions || '8'
        });

        const inviteURL = `https://discord.com/oauth2/authorize?${params.toString()}`;
        this.logger.info('Generated bot invite URL');
        return inviteURL;
    }

    static async exchangeCodeForToken(code: string): Promise<{
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
        scope: string;
    }> {
        try {
            const response = await axios.post(
                `${this.API_BASE}/oauth2/token`,
                new URLSearchParams({
                    client_id: env.DISCORD_CLIENT_ID,
                    client_secret: env.DISCORD_CLIENT_SECRET,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: env.DISCORD_REDIRECT_URI,
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            const tokenData = response.data as {
                access_token: string;
                token_type: string;
                expires_in: number;
                refresh_token: string;
                scope: string;
            };

            if (!tokenData.access_token || !tokenData.refresh_token) {
                this.logger.error('Invalid token response from Discord:', tokenData);
                throw new Error('Invalid token response from Discord');
            }

            return tokenData;
        } catch (error: any) {
            if (error?.response || error?.request) {
                this.logger.error(`Discord token exchange failed: ${error.response?.status} - ${error.message}`);
            } else {
                this.logger.error('Discord OAuth token exchange failed:', error.message);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Discord OAuth failed: ${errorMessage}`);
        }
    }

    static async getUser(accessToken: string): Promise<DiscordUser> {
        try {
            const response = await axios.get(`${this.API_BASE}/users/@me`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            const userData = response.data as DiscordUser;

            // Validate required fields
            if (!userData.id || !userData.username) {
                this.logger.error('Invalid user response from Discord:', userData);
                throw new Error('Invalid user response from Discord');
            }

            return userData;
        } catch (error: any) {
            if (error?.response || error?.request) {
                this.logger.error(`Discord API Error: ${error.response?.status} - ${error.message}`);
            } else {
                this.logger.error('Discord OAuth failed:', error.message);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to get Discord user: ${errorMessage}`);
        }
    }

    static async getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
        try {
            const response = await axios.get(`${this.API_BASE}/users/@me/guilds`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            const guildsData = response.data as DiscordGuild[];

            // Validate it's an array
            if (!Array.isArray(guildsData)) {
                this.logger.error('Invalid guilds response from Discord:', guildsData);
                throw new Error('Invalid guilds response from Discord');
            }

            return guildsData;
        } catch (error: any) {
            if (error?.response || error?.request) {
                this.logger.error(`Discord Guilds API Error: ${error.response?.status} - ${error.message}`);
            } else {
                this.logger.error('Failed to get Discord guilds:', error.message);
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to get Discord guilds: ${errorMessage}`);
        }
    }
}