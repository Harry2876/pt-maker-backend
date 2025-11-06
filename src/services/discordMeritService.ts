import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    DiscordTeamMeritCache,
    CreateMeritData,
    UpdateMeritData,
    MeritAction,
    GuildMeritRankingsCache,
    MeritRankingsOptions,
} from "../types/discordRegistration";

export class DiscordMeritService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes
    private MERIT_CACHE_TTL = 600; // 10 minutes for merit data

    // Get team merit score
    async getTeamMerit(guildId: string, teamName: string): Promise<number> {
        try {
            const meritData = await redis.hgetObject<DiscordTeamMeritCache>(`merit:${guildId}:${teamName}`);
            
            if (meritData) {
                return meritData.currentMerit;
            }

            // Return default merit if no record exists
            return 100;
        } catch (error) {
            this.logger.warn(`Failed to get merit for team ${teamName}, using default: ${error}`);
            return 100;
        }
    }

    // Create or update team merit
    async updateTeamMerit(data: UpdateMeritData): Promise<DiscordTeamMeritCache | null> {
        try {
            const meritId = randomUUID();
            const now = new Date().toISOString();

            // Get existing merit record
            let existing = await redis.hgetObject<DiscordTeamMeritCache>(`merit:${data.guildId}:${data.teamName}`);
            
            if (!existing) {
                // Create new merit record
                existing = {
                    id: meritId,
                    guildId: data.guildId,
                    teamName: data.teamName,
                    currentMerit: 100, // Default starting merit
                    totalEarned: 0,
                    totalLost: 0,
                    lastAction: undefined,
                    lastUpdated: now,
                    updatedBy: data.updatedBy,
                    notes: undefined,
                    dbStatus: 'PENDING_SYNC'
                };
            }

            // Apply merit change
            const change = data.meritChange;
            const newMerit = Math.max(0, Math.min(1000, existing.currentMerit + change)); // Clamp between 0-1000
            
            if (change > 0) {
                existing.totalEarned += change;
            } else if (change < 0) {
                existing.totalLost += Math.abs(change);
            }

            existing.currentMerit = newMerit;
            existing.lastAction = data.action;
            existing.lastUpdated = now;
            existing.updatedBy = data.updatedBy;
            existing.notes = data.reason;
            existing.dbStatus = 'PENDING_SYNC';

            // Store in Redis
            await redis.hsetObject(`merit:${data.guildId}:${data.teamName}`, existing, this.MERIT_CACHE_TTL);
            
            // Add to guild merit sorted set for rankings
            await redis.zadd(`guild:${data.guildId}:merit_rankings`, newMerit, data.teamName);

            // Clear rankings cache
            await redis.delete(`guild:${data.guildId}:merit_rankings_cache`);

            // Queue for database sync
            await QueueService.syncDiscordImmediately('TEAM_MERIT', existing.id, existing, data.updatedBy);

            this.logger.info(`Merit updated for team ${data.teamName}: ${change > 0 ? '+' : ''}${change} (new: ${newMerit})`);
            
            return existing;
        } catch (error) {
            this.handleError(error, 'Update team merit');
            return null;
        }
    }

    // Get guild merit rankings
    async getGuildMeritRankings(guildId: string, options?: MeritRankingsOptions): Promise<GuildMeritRankingsCache | null> {
        try {
            const cachedResult = await redis.hgetObject<GuildMeritRankingsCache>(`guild:${guildId}:merit_rankings_cache`);
            if (cachedResult) {
                return cachedResult;
            }

            const limit = options?.limit || 50;
            const sortBy = options?.sortBy || 'currentMerit';

            // Get top teams by merit
            const teamNames = await redis.zrevrange(`guild:${guildId}:merit_rankings`, 0, limit - 1);
            const rankings: DiscordTeamMeritCache[] = [];
            let totalMerit = 0;

            for (const teamName of teamNames) {
                const meritData = await redis.hgetObject<DiscordTeamMeritCache>(`merit:${guildId}:${teamName}`);
                if (meritData) {
                    rankings.push(meritData);
                    totalMerit += meritData.currentMerit;
                }
            }

            // Sort by specified criteria if not currentMerit
            if (sortBy !== 'currentMerit') {
                rankings.sort((a, b) => {
                    switch (sortBy) {
                        case 'totalEarned':
                            return b.totalEarned - a.totalEarned;
                        case 'lastUpdated':
                            return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
                        default:
                            return b.currentMerit - a.currentMerit;
                    }
                });
            }

            const result: GuildMeritRankingsCache = {
                rankings,
                totalTeams: rankings.length,
                averageMerit: rankings.length > 0 ? Math.round(totalMerit / rankings.length) : 100,
                lastUpdated: new Date().toISOString()
            };

            // Cache result
            await redis.hsetObject(`guild:${guildId}:merit_rankings_cache`, result, this.CACHE_TTL);

            return result;
        } catch (error) {
            this.handleError(error, 'Get guild merit rankings');
            return null;
        }
    }

    // Process merit action (for automatic merit updates)
    async processMeritAction(guildId: string, teamName: string, action: MeritAction, updatedBy: string): Promise<boolean> {
        try {
            let meritChange = 0;
            let reason = '';

            // Define merit changes for different actions
            switch (action) {
                case 'GOOD_REGISTRATION':
                    meritChange = 5;
                    reason = 'Successful registration attendance';
                    break;
                case 'ATTENDED_MATCH':
                    meritChange = 10;
                    reason = 'Attended scheduled match';
                    break;
                case 'SLOT_WASTE':
                    meritChange = -20;
                    reason = 'Wasted assigned slot';
                    break;
                case 'BAN_VIOLATION':
                    meritChange = -50;
                    reason = 'Violated tournament rules';
                    break;
                case 'ADMIN_ADJUSTMENT':
                    // Merit change should be provided separately for manual adjustments
                    return false;
                default:
                    return false;
            }

            // Update merit
            const updateData: UpdateMeritData = {
                guildId,
                teamName,
                meritChange,
                action,
                reason,
                updatedBy
            };

            const result = await this.updateTeamMerit(updateData);
            return result !== null;
        } catch (error) {
            this.handleError(error, 'Process merit action');
            return false;
        }
    }
}

export const discordMeritService = new DiscordMeritService();