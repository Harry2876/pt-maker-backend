import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    DiscordTeamBanCache,
    BanTeamData,
    GuildBanCache
} from "../types/discordRegistration";
import { UpdateBucketMetadataJournalTableConfigurationCommand } from "@aws-sdk/client-s3";

export class DiscordBanService extends BaseService {
    private CACHE_TTL = 300;
    private BAN_CACHE_TTL = 600;

    async banTeam(data: BanTeamData): Promise<DiscordTeamBanCache | null> {
        try {
            const banId = randomUUID();
            const now = new Date().toISOString();

            //calculate end time for temporary bans 
            let endTime: string | undefined;
            if (data.punishmentType === 'TEMPORARY_BAN' && data.duration) {
                const endDate = new Date(Date.now() + (data.duration * 60 * 60 * 1000));
                endTime = endDate.toISOString();
            }

            const ban: DiscordTeamBanCache = {
                id: banId,
                guildId: data.guildId,
                teamName: data.teamName,
                punishmentType: data.punishmentType,
                reason: data.reason,
                bannedBy: data.bannedBy,
                bannedByName: data.bannedByName,
                bannedAt: now,
                endTime,
                isActive: true,
                dbStatus: 'PENDING_SYNC'
            };

            await redis.hsetObject(`team_ban:${banId}`, ban, this.BAN_CACHE_TTL);

            await redis.sadd(`guild:${data.guildId}:bans`, banId);

            await redis.set(`guild:${data.guildId}:team:${data.teamName}:ban`,banId, this.BAN_CACHE_TTL);

            await this.updateGuildBanListCache(data.guildId, ban, 'ADD');

            await QueueService.syncDiscordImmediately('TEAM_BAN', banId, ban, data.bannedBy);

            this.logger.info(`Team ${data.teamName} banned in guild ${data.guildId} by ${data.bannedBy}`);

            return ban;
        }catch(error){
            this.handleError(error, 'banTeam');
            return null;
        }
    }

    // Update guild ban list cache efficiently (following your updateListCache pattern)
    private async updateGuildBanListCache(guildId: string, ban: DiscordTeamBanCache, operation: 'ADD' | 'UPDATE' | 'DELETE'): Promise<void> {
        try {
            const cacheKey = `guild:${guildId}:bans_cache`;
            const cached = await redis.hgetObject<GuildBanCache>(cacheKey);

            if (cached) {
                let updatedBans = [...cached.bans];

                switch (operation) {
                    case 'ADD':
                        updatedBans.unshift(ban); // Add to beginning (newest first, following your pattern)
                        break;
                    case 'UPDATE':
                        const updateIndex = updatedBans.findIndex(b => b.id === ban.id);
                        if (updateIndex !== -1) {
                            updatedBans[updateIndex] = ban;
                        }
                        break;
                    case 'DELETE':
                        updatedBans = updatedBans.filter(b => b.id !== ban.id);
                        break;
                }

                const activeCount = updatedBans.filter(b => b.isActive).length;

                const updatedCache: GuildBanCache = {
                    bans: updatedBans,
                    totalCount: updatedBans.length,
                    activeCount,
                    lastUpdated: new Date().toISOString()
                };

                // Update cache with new list (following your setObject pattern)
                await redis.hsetObject(cacheKey, updatedCache, this.CACHE_TTL);
                this.logger.info(`Ban cache updated for guild ${guildId}, operation: ${operation}, ban: ${ban.id}`);
            } else {
                this.logger.debug(`No cached ban list found for guild ${guildId}, will be populated on next GET request`);
            }
        } catch (error) {
            this.logger.warn(`Failed to update guild ban list cache for guild ${guildId}:`, error);
        }
    }
        // Check if team is banned (following your efficient lookup patterns)
    async isTeamBanned(guildId: string, teamName: string): Promise<boolean> {
        try {
            const banId = await redis.get(`guild:${guildId}:team:${teamName}:ban`);
            if (!banId) return false;

            const ban = await redis.hgetObject<DiscordTeamBanCache>(`team_ban:${banId}`);
            if (!ban || !ban.isActive) return false;

            // Check if temporary ban has expired
            if (ban.endTime && new Date(ban.endTime) <= new Date()) {
                await this.expireBan(guildId, banId);
                return false;
            }

            return true;
        } catch (error) {
            this.handleError(error, 'Check team ban status');
            return false;
        }
    }

    // Get team ban info (following your getObject patterns)
    async getTeamBanInfo(guildId: string, teamName: string): Promise<DiscordTeamBanCache | null> {
        try {
            const banId = await redis.get(`guild:${guildId}:team:${teamName}:ban`);
            if (!banId) return null;

            const ban = await redis.hgetObject<DiscordTeamBanCache>(`team_ban:${banId}`);
            if (!ban) return null;

            // Check if temporary ban has expired
            if (ban.endTime && new Date(ban.endTime) <= new Date()) {
                await this.expireBan(guildId, banId);
                return null;
            }

            return ban;
        } catch (error) {
            this.handleError(error, 'Get team ban info');
            return null;
        }
    }

    // Expire ban (following your update patterns)
    async expireBan(guildId: string, banId: string, removedBy?: string): Promise<boolean> {
        try {
            const ban = await redis.hgetObject<DiscordTeamBanCache>(`team_ban:${banId}`);
            if (!ban || ban.guildId !== guildId) {
                throw new Error('Ban not found');
            }

            // Update ban object
            ban.isActive = false;
            ban.dbStatus = 'PENDING_SYNC';

            // Update in Redis
            await redis.hsetObject(`team_ban:${banId}`, ban, this.BAN_CACHE_TTL);

            // Remove team mapping
            await redis.delete(`guild:${guildId}:team:${ban.teamName}:ban`);

            // Update cache efficiently (following your pattern)
            await this.updateGuildBanListCache(guildId, ban, 'UPDATE');

            // Queue for database sync
            await QueueService.syncDiscordImmediately('TEAM_BAN', banId, { removedBy }, removedBy || 'system');

            this.logger.info(`Ban ${banId} expired/removed for team ${ban.teamName}`);
            return true;
        } catch (error) {
            this.handleError(error, 'Expire ban');
            return false;
        }
    }

        // Get guild bans (following your cache-first with populate pattern)
    async getGuildBans(guildId: string): Promise<GuildBanCache | null> {
        try {
            // 1. Check cache first (following your pattern)
            const cachedResult = await redis.hgetObject<GuildBanCache>(`guild:${guildId}:bans_cache`);
            if (cachedResult) {
                return cachedResult;
            }

            // 2. Cache miss - get from Redis sets and populate (following your pattern)
            const banIds = await redis.smembers(`guild:${guildId}:bans`);
            
            if (banIds.length === 0) {
                // 3. Fallback to database if no Redis data (following your pattern)
                const dbBans = await this.db.discordTeamBan.findMany({
                    where: { guildId },
                    orderBy: { bannedAt: 'desc' }
                });

                if (dbBans.length > 0) {
                    await this.populateGuildBanCache(guildId, dbBans);
                }

                return {
                    bans: dbBans.map(ban => ({
    id: ban.id,
    guildId: ban.guildId,
    teamName: ban.teamName,
    punishmentType: ban.punishmentType,
    reason: ban.reason,
    bannedBy: ban.bannedBy,
    bannedByName: ban.bannedByName,
    bannedAt: ban.bannedAt.toISOString(),
    endTime: ban.endTime?.toISOString(),
    isActive: ban.isActive,
    appealNotes: ban.appealNotes ?? undefined,
    dbStatus: 'SYNCED' as const
})),
                    totalCount: dbBans.length,
                    activeCount: dbBans.filter(b => b.isActive).length,
                    lastUpdated: new Date().toISOString()
                };
            }

            // 4. Get ban details from Redis (following your pattern)
            const bans: DiscordTeamBanCache[] = [];
            for (const banId of banIds) {
                const ban = await redis.hgetObject<DiscordTeamBanCache>(`team_ban:${banId}`);
                if (ban) {
                    // Check if temporary ban has expired
                    if (ban.endTime && new Date(ban.endTime) <= new Date() && ban.isActive) {
                        await this.expireBan(guildId, banId);
                        ban.isActive = false;
                    }
                    bans.push(ban);
                }
            }

            const activeCount = bans.filter(b => b.isActive).length;

            const result: GuildBanCache = {
                bans,
                totalCount: bans.length,
                activeCount,
                lastUpdated: new Date().toISOString()
            };

            // 5. Cache result (following your pattern)
            await redis.hsetObject(`guild:${guildId}:bans_cache`, result, this.CACHE_TTL);

            return result;
        } catch (error) {
            this.handleError(error, 'Get guild bans');
            return null;
        }
    }

    // Populate cache from database (following your populateCache pattern)
    private async populateGuildBanCache(guildId: string, dbBans: any[]): Promise<void> {
        try {
            const promises = dbBans.map(async (ban) => {
                const cacheBan: DiscordTeamBanCache = {
                    ...ban,
                    bannedAt: ban.bannedAt.toISOString(),
                    endTime: ban.endTime?.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`team_ban:${ban.id}`, cacheBan, this.BAN_CACHE_TTL);
                await redis.sadd(`guild:${guildId}:bans`, ban.id);
                
                // Add team mapping for quick lookup
                if (ban.isActive) {
                    await redis.set(`guild:${guildId}:team:${ban.teamName}:ban`, ban.id, this.BAN_CACHE_TTL);
                }
            });

            await Promise.all(promises);
            this.logger.info(`Populated ban cache for guild ${guildId} with ${dbBans.length} bans`);
        } catch (error) {
            this.logger.error('Failed to populate guild ban cache:', error);
        }
    }
}

export const discordBanService = new DiscordBanService();