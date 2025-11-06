import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    DiscordRegistrationDelayCache,
    CreateDelayData,
    GuildDelayCache,
    CreateMeritData
} from "../types/discordRegistration";

export class DiscordDelayService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Set registration delay
    async setRegistrationDelay(data: CreateDelayData): Promise<DiscordRegistrationDelayCache | null> {
        try {
            const delayId = randomUUID();
            const now = new Date().toISOString();
            const expiresAt = new Date(Date.now() + (data.delayMinutes * 60 * 1000)).toISOString();

            const delay: DiscordRegistrationDelayCache = {
                id: delayId,
                guildId: data.guildId,
                teamName: data.teamName || undefined,
                delayType: data.delayType || 'REGISTRATION_COOLDOWN',
                delayMinutes: data.delayMinutes,
                reason: data.reason,
                expiresAt,
                setBy: data.createdBy,
                setByName: `User ${data.createdBy}`,
                isActive: true,
                createdAt: now,
                createdBy: data.createdBy,
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`delay:${delayId}`, delay, this.CACHE_TTL);

            // Add to guild delays
            await redis.sadd(`guild:${data.guildId}:delays`, delayId);

            // If team-specific delay, add mapping
            if (data.teamName) {
                await redis.set(`guild:${data.guildId}:team:${data.teamName}:delay`, delayId, data.delayMinutes * 60);
            } else {
                // Global delay for the guild
                await redis.set(`guild:${data.guildId}:global_delay`, delayId, data.delayMinutes * 60);
            }

            // Clear cache
            await redis.delete(`guild:${data.guildId}:delays_cache`);

            // Queue for database sync
            await QueueService.syncDiscordImmediately('REGISTRATION_DELAY', delayId, delay, data.createdBy);

            this.logger.info(`Registration delay set: ${data.delayMinutes} minutes for ${data.teamName || 'all teams'}`);

            return delay;
        } catch (error) {
            this.handleError(error, 'Set registration delay');
            return null;
        }
    }

    // Check if team/guild has active delay
    async checkRegistrationDelay(guildId: string, teamName?: string): Promise<DiscordRegistrationDelayCache | null> {
        try {
            // Check team-specific delay first
            if (teamName) {
                const teamDelayId = await redis.get(`guild:${guildId}:team:${teamName}:delay`);
                if (teamDelayId) {
                    const delay = await redis.hgetObject<DiscordRegistrationDelayCache>(`delay:${teamDelayId}`);
                    if (delay && delay.isActive && new Date(delay.expiresAt) > new Date()) {
                        return delay;
                    }
                }
            }

            // Check global guild delay
            const globalDelayId = await redis.get(`guild:${guildId}:global_delay`);
            if (globalDelayId) {
                const delay = await redis.hgetObject<DiscordRegistrationDelayCache>(`delay:${globalDelayId}`);
                if (delay && delay.isActive && new Date(delay.expiresAt) > new Date()) {
                    return delay;
                }
            }

            return null;
        } catch (error) {
            this.handleError(error, 'Check registration delay');
            return null;
        }
    }

    // Remove/expire delay
    async removeRegistrationDelay(guildId: string, delayId: string, removedBy: string): Promise<boolean> {
        try {
            const delay = await redis.hgetObject<DiscordRegistrationDelayCache>(`delay:${delayId}`);
            if (!delay || delay.guildId !== guildId) {
                throw new Error('Delay not found');
            }

            // Mark as inactive
            delay.isActive = false;
            delay.dbStatus = 'PENDING_SYNC';

            // Update in Redis
            await redis.hsetObject(`delay:${delayId}`, delay, this.CACHE_TTL);

            // Remove from mappings
            if (delay.teamName) {
                await redis.delete(`guild:${guildId}:team:${delay.teamName}:delay`);
            } else {
                await redis.delete(`guild:${guildId}:global_delay`);
            }

            // Clear cache
            await redis.delete(`guild:${guildId}:delays_cache`);

            // Queue for database sync
            await QueueService.syncDiscordImmediately('REGISTRATION_DELAY', delayId, { removedBy }, removedBy);

            this.logger.info(`Registration delay removed: ${delayId}`);

            return true;
        } catch (error) {
            this.handleError(error, 'Remove registration delay');
            return false;
        }
    }

    // Get guild delays
    async getGuildDelays(guildId: string): Promise<GuildDelayCache | null> {
        try {
            const cachedResult = await redis.hgetObject<GuildDelayCache>(`guild:${guildId}:delays_cache`);
            if (cachedResult) {
                return cachedResult;
            }

            const delayIds = await redis.smembers(`guild:${guildId}:delays`);
            const delays: DiscordRegistrationDelayCache[] = [];

            for (const delayId of delayIds) {
                const delay = await redis.hgetObject<DiscordRegistrationDelayCache>(`delay:${delayId}`);
                if (delay) {
                    delays.push(delay);
                }
            }

            const activeCount = delays.filter(d => d.isActive && new Date(d.expiresAt) > new Date()).length;

            const result: GuildDelayCache = {
                delays,
                totalCount: delays.length,
                activeCount,
                lastUpdated: new Date().toISOString()
            };

            // Cache result
            await redis.hsetObject(`guild:${guildId}:delays_cache`, result, this.CACHE_TTL);

            return result;
        } catch (error) {
            this.handleError(error, 'Get guild delays');
            return null;
        }
    }
}

export const discordDelayService = new DiscordDelayService();