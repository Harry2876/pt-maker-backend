import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { DiscordOAuthService } from "./discordOAuthService";
import { DiscordGuild, DiscordGuildMember, DiscordScrim, DiscordUser } from "@prisma/client";

type GuildWithIncludes = DiscordGuild & {
    owner: DiscordUser;
    members: (DiscordGuildMember & {
        user: DiscordUser;
    })[];
    scrims: DiscordScrim[];
};

export class GuildService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes (same as your other services)

    // Handle bot installation (when bot joins a guild)
    async handleBotInstallation(guildData: {
        id: string;
        name: string;
        icon?: string;
        ownerId: string;
        memberCount?: number;
    }) {
        try {
            // Create guild object
            const guild = {
                id: guildData.id,
                name: guildData.name,
                icon: guildData.icon,
                ownerId: guildData.ownerId,
                memberCount: guildData.memberCount || 0,
                botEnabled: true,
                isPremium: false,
                commandPrefix: 'sz',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis immediately (following your tournament service pattern)
            await redis.hsetObject(`guild:${guildData.id}`, guild);

            // Add to sync queue for database
            await QueueService.syncDiscordImmediately('DISCORD_GUILD', guildData.id, guild, guildData.ownerId);

            this.logger.info(`Guild ${guildData.id} registered for bot installation`);

            return guild;
        } catch (error) {
            this.handleError(error, 'Handle bot installation');
            return null;
        }
    }

    // Get guild by ID (cache-first approach like your tournament service)
    async getGuildById(guildId: string, useCache = true): Promise<GuildWithIncludes | null> {
        try {
            if (useCache) {
                // Check Redis cache first
                const cachedGuild = await redis.getObject(`guild:${guildId}`);
                if (cachedGuild) {
                    this.logger.info(`Guild ${guildId} fetched from cache`);
                    return cachedGuild as GuildWithIncludes;
                }
            }

            // Fallback to database
            const dbGuild = await this.db.discordGuild.findUnique({
                where: { id: guildId },
                include: {
                    owner: true,
                    members: {
                        include: {
                            user: true
                        }
                    },
                    scrims: true
                }
            });

            if (dbGuild && useCache) {
                // Cache the result
                await redis.setObject(`guild:${guildId}`, dbGuild, this.CACHE_TTL);
            }

            return dbGuild;
        } catch (error) {
            this.handleError(error, 'Get guild by ID');
            return null;
        }
    }

    // Update guild premium status
    async updatePremiumStatus(guildId: string, isPremium: boolean, premiumUntil?: Date, updatedBy?: string) {
        try {
            //Get guild owner ID if updatedBy not provided
            const guild = await this.getGuildById(guildId);
            const userId = updatedBy || guild?.ownerId || 'system';

            const updateData = {
                isPremium,
                premiumUntil,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Update Redis cache
            await redis.hsetObject(`guild:${guildId}`, updateData);

            // Queue for database sync
            await QueueService.queueDiscordSync({
                type: 'DISCORD_GUILD_UPDATE',
                entityId: guildId,
                data: updateData,
                userId: userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Guild ${guildId} premium status updated to ${isPremium}`);

            return { success: true, message: 'Premium status updated successfully' };
        } catch (error) {
            this.handleError(error, 'Update premium status');
            return null;
        }
    }

    // Update guild settings
    async updateGuildSettings(guildId: string, settings: {
        commandPrefix?: string;
        botEnabled?: boolean;
    }, updatedBy?: string) {
        try {
            //Get guild owner ID if updatedBy not provided
            const guild = await this.getGuildById(guildId);
            const userId = updatedBy || guild?.ownerId || 'system';
            const updateData = {
                ...settings,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Update Redis cache
            await redis.hsetObject(`guild:${guildId}`, updateData);

            // Queue for database sync
            await QueueService.queueDiscordSync({
                type: 'DISCORD_GUILD_UPDATE',
                entityId: guildId,
                data: updateData,
                userId: userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Guild ${guildId} settings updated`);

            return { success: true, message: 'Guild settings updated successfully' };
        } catch (error) {
            this.handleError(error, 'Update guild settings');
            return null;
        }
    }

    // Handle bot removal (when bot leaves a guild)
    async handleBotRemoval(guildId: string) {
        try {
            // Get guild owner ID for the removal action
            const guild = await this.getGuildById(guildId);
            const userId = guild?.ownerId || 'system';

            const updateData = {
                botEnabled: false,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Update Redis cache
            await redis.hsetObject(`guild:${guildId}`, updateData);

            await QueueService.queueDiscordSync({
                type: 'DISCORD_GUILD_UPDATE',
                entityId: guildId,
                data: updateData,
                userId: userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });
            this.logger.info(`Bot removed from guild ${guildId}`);

            return { success: true, message: 'Bot removal processed' };
        } catch (error) {
            this.handleError(error, 'Handle bot removal');
            return null;
        }
    }

    // Get all guilds for a user (for dashboard)
    async getUserGuilds(userId: string) {
        try {
            const guilds = await this.db.discordGuild.findMany({
                where: {
                    OR: [
                        { ownerId: userId },
                        {
                            members: {
                                some: {
                                    userId: userId
                                }
                            }
                        }
                    ]
                },
                include: {
                    _count: {
                        select: {
                            scrims: true,
                            members: true
                        }
                    }
                }
            });

            return guilds;
        } catch (error) {
            this.handleError(error, 'Get user guilds');
            return null;
        }
    }
}

// Export singleton instance (following your service pattern)
export const guildService = new GuildService();