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
            scope: 'identify email guilds',
            ...(state && { state })
        });

        return `https://discord.com/oauth2/authorize?${params.toString()}`;
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

            // Debug logging for successful token exchange
            this.logger.debug('Successfully exchanged code for token:', {
                hasAccessToken: !!tokenData.access_token,
                hasRefreshToken: !!tokenData.refresh_token,
                tokenType: tokenData.token_type,
                expiresIn: tokenData.expires_in,
                scope: tokenData.scope,
                accessTokenPrefix: tokenData.access_token.substring(0, 10) + '...',
                accessTokenLength: tokenData.access_token.length
            });

            // Enhanced token exchange logging
            this.logger.info('🔑 TOKEN EXCHANGE SUCCESS');
            this.logger.info(`- Access Token Length: ${tokenData.access_token.length}`);
            this.logger.info(`- Token Type: ${tokenData.token_type}`);
            this.logger.info(`- Expires In: ${tokenData.expires_in} seconds`);
            this.logger.info(`- Scope: ${tokenData.scope}`);
            this.logger.info(`- Token Preview: ${tokenData.access_token.substring(0, 20)}...`);
            this.logger.info(`- Has Refresh Token: ${!!tokenData.refresh_token}`);

            return tokenData;
        } catch (error: any) {
            // Enhanced error logging for debugging
            if (error?.response || error?.request) {
                this.logger.error('Discord Token Exchange Error:', {
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                this.logger.error('Discord OAuth token exchange failed:', {
                    name: error instanceof Error ? error.name : 'Unknown',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Discord OAuth failed: ${errorMessage}`);
        }
    }

    static async getUser(accessToken: string): Promise<DiscordUser> {
        try {
            this.logger.debug('Making Discord API call with token:', {
                tokenLength: accessToken.length,
                tokenPrefix: accessToken.substring(0, 10) + '...',
                tokenSuffix: '...' + accessToken.substring(accessToken.length - 10),
                url: `${this.API_BASE}/users/@me`,
                fullToken: accessToken // REMOVE THIS AFTER DEBUGGING - SECURITY RISK
            });

            this.logger.debug('Request headers:', {
                Authorization: `Bearer ${accessToken.substring(0, 20)}...`,
                'User-Agent': 'PT-Maker-Backend/1.0'
            });

            this.logger.info('🚀 MAKING DISCORD API CALL');
            this.logger.info(`- URL: ${this.API_BASE}/users/@me`);
            this.logger.info(`- Token Length: ${accessToken.length}`);
            this.logger.info(`- Token Preview: ${accessToken.substring(0, 30)}...`);
            this.logger.info(`- Authorization Header: Bearer ${accessToken.substring(0, 30)}...`);
            this.logger.info(`- API Base: ${this.API_BASE}`);
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
            // Enhanced error logging for debugging
                        if (error?.response || error?.request) {
                this.logger.error('❌ DISCORD API ERROR DETAILS');
                this.logger.error(`- Status Code: ${error.response?.status || 'No Status'}`);
                this.logger.error(`- Status Text: ${error.response?.statusText || 'No Status Text'}`);
                this.logger.error(`- Request URL: ${error.config?.url || 'No URL'}`);
                this.logger.error(`- Request Method: ${error.config?.method || 'No Method'}`);
                this.logger.error(`- Error Message: ${error.message || 'No Message'}`);
                this.logger.error(`- Has Response: ${!!error.response}`);
                this.logger.error(`- Has Request: ${!!error.request}`);
                
                // Response data logging
                if (error.response?.data) {
                    try {
                        const responseData = typeof error.response.data === 'string' 
                            ? error.response.data 
                            : JSON.stringify(error.response.data, null, 2);
                        this.logger.error(`- Response Data: ${responseData}`);
                    } catch (e) {
                        this.logger.error(`- Response Data: [Unable to stringify response data]`);
                    }
                }
                
                // Request headers (without sensitive info)
                if (error.config?.headers) {
                    this.logger.error('- Request Headers:');
                    Object.keys(error.config.headers).forEach(key => {
                        if (key.toLowerCase() === 'authorization') {
                            this.logger.error(`  ${key}: Bearer ${error.config.headers[key].substring(7, 37)}...`);
                        } else {
                            this.logger.error(`  ${key}: ${error.config.headers[key]}`);
                        }
                    });
                }

                // Additional detailed logging
                this.logger.error('Full Discord API Error:', {
                    message: error.message,
                    isAxiosError: error.isAxiosError,
                    hasResponse: !!error.response,
                    hasRequest: !!error.request,
                    responseStatus: error.response?.status,
                    responseData: JSON.stringify(error.response?.data)
                });
                                // Error analysis
                this.logger.error('🔍 ERROR ANALYSIS:');
                if (error.response?.status === 401) {
                    this.logger.error('- 401 Unauthorized: Token is invalid, expired, or lacks required scopes');
                    this.logger.error('- Check: Discord app configuration, client secret, redirect URI');
                    this.logger.error('- Check: Token scopes include "identify email guilds"');
                } else if (error.response?.status === 403) {
                    this.logger.error('- 403 Forbidden: Token valid but lacks permissions');
                } else if (error.response?.status === 429) {
                    this.logger.error('- 429 Rate Limited: Too many requests');
                } else if (!error.response) {
                    this.logger.error('- Network Error: No response received from Discord');
                }
            } else {
                this.logger.error('Discord OAuth failed, Failed to get User:', {
                    name: error instanceof Error ? error.name : 'Unknown',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
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
            // Enhanced error logging for debugging
                   if (error?.response || error?.request) {
                this.logger.error('❌ DISCORD GUILDS API ERROR');
                this.logger.error(`- Status Code: ${error.response?.status || 'No Status'}`);
                this.logger.error(`- Status Text: ${error.response?.statusText || 'No Status Text'}`);
                this.logger.error(`- Request URL: ${error.config?.url || 'No URL'}`);
                this.logger.error(`- Error Message: ${error.message || 'No Message'}`);
                
                if (error.response?.data) {
                    try {
                        const responseData = typeof error.response.data === 'string' 
                            ? error.response.data 
                            : JSON.stringify(error.response.data, null, 2);
                        this.logger.error(`- Response Data: ${responseData}`);
                    } catch (e) {
                        this.logger.error(`- Response Data: [Unable to stringify]`);
                    }
                }
            } else {
                this.logger.error('Failed to get Guilds:', {
                    name: error instanceof Error ? error.name : 'Unknown',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
            }
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to get Discord guilds: ${errorMessage}`);
        }
    }
}