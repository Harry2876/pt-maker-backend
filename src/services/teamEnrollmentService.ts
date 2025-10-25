import { BaseService } from "./baseService";
import redis from "../config/redis";
import { QueueService } from "./queueService";
import { randomUUID } from "crypto";
import {
    TeamEnrollmentCache,
    CreateTeamEnrollmentData,
    UpdateTeamEnrollmentData,
    TeamPlayer,
    TeamActivityData,
    RateLimitData,
    TeamNameChangeData
} from "../types/teamEnrollment";

// Include interface for guild-level team lists (following your patterns)
interface GuildTeamListCache {
    teams: TeamEnrollmentCache[];
    totalCount: number;
    lastUpdated: string;
}

export class TeamEnrollmentService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes (same as your other services)

    // Main enrollment method (following your createTournament pattern)
    async enrollTeam(data: CreateTeamEnrollmentData): Promise<TeamEnrollmentCache | null> {
        try {
            // Generate team enrollment ID
            const enrollmentId = randomUUID();

            // Create the team enrollment object
            const teamEnrollment: TeamEnrollmentCache = {
                id: enrollmentId,
                guildId: data.guildId,
                teamName: data.teamName,
                leaderId: data.leaderId,
                leaderIgn: data.leaderIgn,
                leaderDiscord: data.leaderDiscord,
                players: data.players,
                isVerified: false,
                isComplete: false,
                enrollmentStep: 1,
                threadId: data.threadId,
                enrolledBy: data.enrolledBy,
                enrolledAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis immediately (following your patterns)
            await redis.hsetObject(`team_enrollment:${data.guildId}:${data.teamName}`, teamEnrollment);

            // Add to guild team set
            await redis.sadd(`guild:${data.guildId}:teams`, data.teamName);

            // Update cached team list intelligently
            await this.updateGuildTeamListCache(data.guildId, teamEnrollment, 'ADD');

            // Add to queue for database sync
            await QueueService.syncDiscordImmediately('TEAM_ENROLLMENT', enrollmentId, teamEnrollment, data.enrolledBy);

            this.logger.info(`Team ${data.teamName} enrolled in guild ${data.guildId} and queued for sync`);

            return teamEnrollment;
        } catch (error) {
            this.handleError(error, 'Enroll team');
            return null;
        }
    }

    // Get all teams for a guild (following your getUserTournaments pattern)
    async getTeamsByGuild(guildId: string): Promise<TeamEnrollmentCache[] | null> {
        try {
            // Check data in Redis cache first
            const cacheKey = `guild:${guildId}:teams:list`;
            const cachedTeams = await redis.getObject<GuildTeamListCache>(cacheKey);

            if (cachedTeams) {
                this.logger.info(`Fetched ${cachedTeams.teams.length} teams from cache for guild ${guildId}`);
                return cachedTeams.teams;
            }

            // Get team names from set
            const teamNames = await redis.smembers(`guild:${guildId}:teams`);

            if (teamNames.length === 0) {
                // Fallback to database if Redis is empty
                const dbTeams = await this.db.teamEnrollment.findMany({
                    where: { guildId },
                    orderBy: {
                        enrolledAt: 'desc'
                    }
                });

                // Populate Redis cache from database
                if (dbTeams.length > 0) {
                    await this.populateGuildTeamCache(guildId, dbTeams);
                }

                return dbTeams.map(team => ({
                    ...team,
                    players: team.players as unknown as TeamPlayer[],
                    enrolledAt: team.enrolledAt.toISOString(),
                    verifiedAt: team.verifiedAt?.toISOString(),
                    threadId: team.threadId || undefined,
                    dbStatus: 'SYNCED' as const
                }));
            }

            // Get team details from Redis
            const teams = await Promise.all(
                teamNames.map(async (teamName) => {
                    const team = await redis.hgetObject<TeamEnrollmentCache>(`team_enrollment:${guildId}:${teamName}`);
                    return team;
                })
            );

            // Filter out null results and cache the list
            const validTeams = teams.filter(t => t !== null) as TeamEnrollmentCache[];
            await redis.setObject(cacheKey, {
                teams: validTeams,
                totalCount: validTeams.length,
                lastUpdated: new Date().toISOString()
            }, this.CACHE_TTL);

            this.logger.info(`Fetched ${validTeams.length} teams for guild ${guildId}`);
            return validTeams;
        } catch (error) {
            this.handleError(error, 'Get teams by guild');
            return null;
        }
    }

    // Get team by name (following your getTournamentById pattern)
    async getTeamByName(guildId: string, teamName: string): Promise<TeamEnrollmentCache | null> {
        try {
            // Check Redis cache first
            const team = await redis.hgetObject<TeamEnrollmentCache>(`team_enrollment:${guildId}:${teamName}`);

            if (team) {
                this.logger.info(`Fetched team ${teamName} from guild ${guildId} from cache`);
                return team;
            }

            // Fallback to database
            const dbTeam = await this.db.teamEnrollment.findFirst({
                where: {
                    guildId,
                    teamName
                }
            });

            if (!dbTeam) {
                this.logger.warn(`Team ${teamName} not found in guild ${guildId}`);
                return null;
            }

            // Convert to cache format and store in Redis
            const teamCache: TeamEnrollmentCache = {
                ...dbTeam,
                players: dbTeam.players as unknown as TeamPlayer[],
                threadId: dbTeam.threadId || undefined,
                enrolledAt: dbTeam.enrolledAt.toISOString(),
                verifiedAt: dbTeam.verifiedAt?.toISOString(),
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`team_enrollment:${guildId}:${teamName}`, teamCache);

            this.logger.info(`Team ${teamName} fetched from database and cached`);
            return teamCache;
        } catch (error) {
            this.handleError(error, 'Get team by name');
            return null;
        }
    }

    // Update team (following your updateTournament pattern)
    async updateTeam(guildId: string, teamName: string, updateData: UpdateTeamEnrollmentData, updatedBy: string): Promise<TeamEnrollmentCache | null> {
        try {
            // Get current team
            const currentTeam = await this.getTeamByName(guildId, teamName);
            if (!currentTeam) {
                throw new Error('Team not found');
            }

            // Create updated team object
            const updatedTeam: TeamEnrollmentCache = {
                ...currentTeam,
                ...updateData,
                dbStatus: 'PENDING_SYNC'
            };

            // Handle team name change specifically
            if (updateData.teamName && updateData.teamName !== teamName) {
                // Remove old name from Redis
                await redis.hdel(`team_enrollment:${guildId}:${teamName}`);
                await redis.srem(`guild:${guildId}:teams`, teamName);

                // Add new name
                await redis.sadd(`guild:${guildId}:teams`, updateData.teamName);

                // Log name change for 15-day restriction tracking
                await this.logTeamNameChange({
                    teamId: currentTeam.id,
                    guildId,
                    oldName: teamName,
                    newName: updateData.teamName,
                    changedBy: updatedBy
                });
            }

            // Update Redis immediately
            const finalTeamName = updateData.teamName || teamName;
            await redis.hsetObject(`team_enrollment:${guildId}:${finalTeamName}`, updatedTeam);

            // Queue database sync
            await QueueService.queueDiscordSync({
                type: 'TEAM_ENROLLMENT_UPDATE',
                entityId: currentTeam.id,
                data: updateData,
                userId: updatedBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // Update cached team lists
            await this.updateGuildTeamListCache(guildId, updatedTeam, 'UPDATE');

            this.logger.info(`Team ${teamName} updated in guild ${guildId} by ${updatedBy}`);
            return updatedTeam;
        } catch (error) {
            this.handleError(error, 'Update team');
            return null;
        }
    }

    // Delete team enrollment
    async deleteTeam(guildId: string, teamName: string, deletedBy: string): Promise<boolean> {
        try {
            // Verify team exists
            const team = await this.getTeamByName(guildId, teamName);
            if (!team) {
                throw new Error('Team not found');
            }

            // Remove from Redis
            await redis.hdel(`team_enrollment:${guildId}:${teamName}`);
            await redis.srem(`guild:${guildId}:teams`, teamName);

            // Clear cached team list
            await redis.hdel(`guild:${guildId}:teams:list`);

            // Queue database deletion
            await QueueService.queueDiscordSync({
                type: 'TEAM_ENROLLMENT_DELETE',
                entityId: team.id,
                data: { deletedBy },
                userId: deletedBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            this.logger.info(`Team ${teamName} deleted from guild ${guildId} by ${deletedBy}`);
            return true;
        } catch (error) {
            this.handleError(error, 'Delete team');
            return false;
        }
    }

    // Get teams where user is leader (for leadership management)
    async getTeamsByLeader(guildId: string, leaderDiscord: string): Promise<TeamEnrollmentCache[] | null> {
        try {
            const allTeams = await this.getTeamsByGuild(guildId);
            if (!allTeams) return null;

            const leaderTeams = allTeams.filter(team => team.leaderDiscord === leaderDiscord);

            this.logger.info(`Found ${leaderTeams.length} teams led by ${leaderDiscord} in guild ${guildId}`);
            return leaderTeams;
        } catch (error) {
            this.handleError(error, 'Get teams by leader');
            return null;
        }
    }

    // Rate limiting methods
    async checkRateLimit(userId: string, guildId: string, action: 'enrollment' | 'leadership_management'): Promise<RateLimitData | null> {
        try {
            const rateLimitKey = `rate_limit:${guildId}:${userId}:${action}`;
            const rateLimit = await redis.getObject<RateLimitData>(rateLimitKey);

            if (rateLimit) {
                const now = new Date();
                const cooldownEnd = new Date(rateLimit.cooldownUntil);

                if (now < cooldownEnd) {
                    this.logger.info(`Rate limit active for user ${userId} in guild ${guildId} for action ${action}`);
                    return rateLimit;
                }
            }

            return null;
        } catch (error) {
            this.handleError(error, 'Check rate limit');
            return null;
        }
    }

    async setRateLimit(userId: string, guildId: string, action: 'enrollment' | 'leadership_management', cooldownMinutes: number = 30, isAdmin: boolean = false): Promise<void> {
        try {
            const rateLimitData: RateLimitData = {
                userId,
                guildId,
                action,
                lastAttempt: new Date().toISOString(),
                attemptCount: 1,
                cooldownUntil: new Date(Date.now() + (cooldownMinutes * 60 * 1000)).toISOString(),
                isAdmin
            };

            const rateLimitKey = `rate_limit:${guildId}:${userId}:${action}`;
            await redis.setObject(rateLimitKey, rateLimitData, cooldownMinutes * 60);

            // Also store in database for persistence
            await QueueService.syncDiscordImmediately('USER_RATE_LIMIT', `${userId}_${guildId}_${action}`, rateLimitData, userId);

            this.logger.info(`Rate limit set for user ${userId} in guild ${guildId} for action ${action} - ${cooldownMinutes} minutes`);
        } catch (error) {
            this.handleError(error, 'Set rate limit');
        }
    }

    // Private helper methods (following your patterns)
    private async updateGuildTeamListCache(guildId: string, team: TeamEnrollmentCache, operation: 'ADD' | 'UPDATE' | 'DELETE'): Promise<void> {
        try {
            const cacheKey = `guild:${guildId}:teams:list`;
            const cached = await redis.getObject<GuildTeamListCache>(cacheKey);

            if (cached) {
                let updatedTeams = [...cached.teams];

                switch (operation) {
                    case 'ADD':
                        updatedTeams.unshift(team); // Add to beginning (newest first)
                        break;
                    case 'UPDATE':
                        const index = updatedTeams.findIndex(t => t.id === team.id);
                        if (index !== -1) {
                            updatedTeams[index] = team;
                        }
                        break;
                    case 'DELETE':
                        updatedTeams = updatedTeams.filter(t => t.id !== team.id);
                        break;
                }

                await redis.setObject(cacheKey, {
                    teams: updatedTeams,
                    totalCount: updatedTeams.length,
                    lastUpdated: new Date().toISOString()
                }, this.CACHE_TTL);
            }
        } catch (error) {
            this.logger.warn(`Failed to update guild team list cache: ${error}`);
        }
    }

    private async populateGuildTeamCache(guildId: string, dbTeams: any[]): Promise<void> {
        try {
            // Convert and cache individual teams
            for (const dbTeam of dbTeams) {
                const teamCache: TeamEnrollmentCache = {
                    ...dbTeam,
                    players: dbTeam.players as TeamPlayer[],
                    enrolledAt: dbTeam.enrolledAt.toISOString(),
                    verifiedAt: dbTeam.verifiedAt?.toISOString(),
                    dbStatus: 'SYNCED'
                };

                await redis.hsetObject(`team_enrollment:${guildId}:${dbTeam.teamName}`, teamCache);
                await redis.sadd(`guild:${guildId}:teams`, dbTeam.teamName);
            }

            this.logger.info(`Populated Redis cache with ${dbTeams.length} teams for guild ${guildId}`);
        } catch (error) {
            this.logger.warn(`Failed to populate guild team cache: ${error}`);
        }
    }

    private async logTeamNameChange(data: TeamNameChangeData): Promise<void> {
        try {
            await QueueService.syncDiscordImmediately('TEAM_NAME_CHANGE', randomUUID(), data, data.changedBy);
            this.logger.info(`Team name change logged: ${data.oldName} -> ${data.newName} in guild ${data.guildId}`);
        } catch (error) {
            this.logger.warn(`Failed to log team name change: ${error}`);
        }
    }

    // Activity logging method
    async logTeamActivity(data: TeamActivityData): Promise<void> {
        try {
            const activityLog = {
                id: randomUUID(),
                ...data,
                timestamp: new Date().toISOString()
            };

            await QueueService.syncDiscordImmediately('TEAM_ACTIVITY_LOG', activityLog.id, activityLog, data.performedBy);
            this.logger.info(`Team activity logged: ${data.action} for team ${data.teamId} by ${data.performedBy}`);
        } catch (error) {
            this.handleError(error, 'Log team activity');
        }
    }

    // Get team activity history
    async getTeamActivityHistory(guildId: string, teamName: string): Promise<any[] | null> {
        try {
            // For now, return empty array since we need to implement database query
            // This would normally query the database for activity logs
            const cacheKey = `team_activity:${guildId}:${teamName}`;
            const cached = await redis.get(cacheKey);
            
            if (cached) {
                return JSON.parse(cached);
            }

            // In a real implementation, this would query the database
            // For now, return empty array to prevent errors
            const activities: any[] = [];
            
            // Cache the result
            await redis.set(cacheKey, JSON.stringify(activities), this.CACHE_TTL);
            
            return activities;
        } catch (error) {
            this.handleError(error, 'Get team activity history');
            return null;
        }
    }

    // Check if player is enrolled in any team in guild
async checkPlayerEnrollment(guildId: string, playerDiscord: string): Promise<{
    isEnrolled: boolean;
    teamName?: string;
    teamId?: string;
    playerRole?: string;
} | null> {
    try {
        // Check Redis cache first for guild teams
        const cachedTeams = await redis.hgetObject<GuildTeamListCache>(`guild:${guildId}:teams:list`);
        
        if (cachedTeams) {
            // Search through cached teams
            for (const team of cachedTeams.teams) {
                // Check if player is the leader
                if (team.leaderDiscord === playerDiscord) {
                    this.logger.info(`Player ${playerDiscord} found as leader of team ${team.teamName} in guild ${guildId}`);
                    return {
                        isEnrolled: true,
                        teamName: team.teamName,
                        teamId: team.id,
                        playerRole: 'leader'
                    };
                }
                
                // Check if player is in the players array
                const foundPlayer = team.players.find(player => 
                    player.discordId === playerDiscord || player.discordTag === playerDiscord
                );
                if (foundPlayer) {
                    this.logger.info(`Player ${playerDiscord} found in team ${team.teamName} in guild ${guildId}`);
                    return {
                        isEnrolled: true,
                        teamName: team.teamName,
                        teamId: team.id,
                        playerRole: foundPlayer.role || 'member'
                    };
                }
            }
            
            this.logger.info(`Player ${playerDiscord} not found in any cached teams for guild ${guildId}`);
            return { isEnrolled: false };
        }

        // Fallback to database if no cache - use simpler approach
        const dbTeams = await this.db.teamEnrollment.findMany({
            where: {
                guildId
            }
        });

        // Search through all teams for the player
        for (const team of dbTeams) {
            const players = team.players as unknown as TeamPlayer[];
            
            // Check if player is leader
            if (team.leaderDiscord === playerDiscord) {
                this.logger.info(`Player ${playerDiscord} found as leader of team ${team.teamName} from database`);
                return {
                    isEnrolled: true,
                    teamName: team.teamName,
                    teamId: team.id,
                    playerRole: 'leader'
                };
            }
            
            // Check if player is in players array
            const playerInTeam = players.find(player => 
                player.discordId === playerDiscord || player.discordTag === playerDiscord
            );
            
            if (playerInTeam) {
                this.logger.info(`Player ${playerDiscord} found in team ${team.teamName} from database`);
                return {
                    isEnrolled: true,
                    teamName: team.teamName,
                    teamId: team.id,
                    playerRole: playerInTeam?.role || 'member'
                };
            }
        }

        this.logger.info(`Player ${playerDiscord} not enrolled in any team in guild ${guildId}`);
        return { isEnrolled: false };
    } catch (error) {
        this.handleError(error, 'Check player enrollment');
        return null;
    }
}

    // Get team name change history for 15-day restriction
    async getTeamNameChangeHistory(guildId: string, teamName: string): Promise<{
        canChange: boolean;
        lastChangeDate?: string;
        nextAvailable?: string;
        changesCount: number;
    } | null> {
        try {
            // Check Redis cache first
            const cacheKey = `team_name_history:${guildId}:${teamName}`;
            const cached = await redis.getObject<any>(cacheKey);
            
            if (cached) {
                this.logger.info(`Team name change history for ${teamName} fetched from cache`);
                return cached;
            }

            // Fallback to database
            const nameChanges = await this.db.teamNameChange.findMany({
                where: {
                    guildId,
                    OR: [
                        { oldName: teamName },
                        { newName: teamName }
                    ]
                },
                orderBy: {
                    changedAt: 'desc'
                }
            });

            const now = new Date();
            const fifteenDaysAgo = new Date(now.getTime() - (15 * 24 * 60 * 60 * 1000));
            
            // Check if there's a change within 15 days
            const recentChange = nameChanges.find(change => 
                new Date(change.changedAt) > fifteenDaysAgo
            );

            const result = {
                canChange: !recentChange,
                lastChangeDate: recentChange?.changedAt.toISOString(),
                nextAvailable: recentChange ? 
                    new Date(new Date(recentChange.changedAt).getTime() + (15 * 24 * 60 * 60 * 1000)).toISOString() : 
                    undefined,
                changesCount: nameChanges.length
            };

            // Cache the result
            await redis.setObject(cacheKey, result, this.CACHE_TTL);

            this.logger.info(`Team name change history calculated for ${teamName} - can change: ${result.canChange}`);
            return result;
        } catch (error) {
            this.handleError(error, 'Get team name change history');
            return null;
        }
    }

    // Get all teams where user is a leader (for leadership management)
    async getUserTeams(guildId: string, userDiscordTag: string): Promise<{
        teams: TeamEnrollmentCache[];
        totalCount: number;
    } | null> {
        try {
            // Check Redis cache first for guild teams
            const cachedTeams = await redis.getObject<GuildTeamListCache>(`guild:${guildId}:teams:list`);
            
            if (cachedTeams) {
                // Filter teams where user is leader
                const userTeams = cachedTeams.teams.filter(team => 
                    team.leaderDiscord === userDiscordTag
                );

                this.logger.info(`Found ${userTeams.length} teams led by ${userDiscordTag} from cache`);
                return {
                    teams: userTeams,
                    totalCount: userTeams.length
                };
            }

            // Fallback to database
            const dbTeams = await this.db.teamEnrollment.findMany({
                where: {
                    guildId,
                    leaderDiscord: userDiscordTag
                },
                orderBy: {
                    enrolledAt: 'desc'
                }
            });

            // Convert to cache format
            const userTeams = dbTeams.map(team => ({
                ...team,
                players: team.players as unknown as TeamPlayer[],
                threadId: team.threadId || undefined,
                enrolledAt: team.enrolledAt.toISOString(),
                verifiedAt: team.verifiedAt?.toISOString(),
                dbStatus: 'SYNCED' as const
            }));

            this.logger.info(`Found ${userTeams.length} teams led by ${userDiscordTag} from database`);
            return {
                teams: userTeams,
                totalCount: userTeams.length
            };
        } catch (error) {
            this.handleError(error, 'Get user teams');
            return null;
        }
    }

    // Transfer team leadership to another member
    async transferTeamLeadership(guildId: string, teamName: string, transferData: {
        newLeaderDiscord: string;
        newLeaderIgn: string;
        transferredBy: string;
    }): Promise<TeamEnrollmentCache | null> {
        try {
            // Get current team
            const currentTeam = await this.getTeamByName(guildId, teamName);
            if (!currentTeam) {
                throw new Error('Team not found');
            }

            // Verify the new leader is in the team
            const isNewLeaderInTeam = currentTeam.players.some(player => 
                player.discordId === transferData.newLeaderDiscord || 
                player.discordTag === transferData.newLeaderDiscord
            );

            if (!isNewLeaderInTeam) {
                throw new Error('New leader must be a current team member');
            }

            // Create updated team with new leadership
            const updatedTeam: TeamEnrollmentCache = {
                ...currentTeam,
                leaderId: transferData.newLeaderDiscord, // Use Discord ID as leader ID
                leaderIgn: transferData.newLeaderIgn,
                leaderDiscord: transferData.newLeaderDiscord,
                dbStatus: 'PENDING_SYNC'
            };

            // Update Redis cache
            await redis.hsetObject(`team_enrollment:${guildId}:${teamName}`, updatedTeam);

            // Queue database sync
            await QueueService.queueDiscordSync({
                type: 'TEAM_ENROLLMENT_UPDATE',
                entityId: currentTeam.id,
                data: {
                    oldLeaderDiscord: currentTeam.leaderDiscord,
                    newLeaderDiscord: transferData.newLeaderDiscord,
                    newLeaderIgn: transferData.newLeaderIgn,
                    transferredBy: transferData.transferredBy
                },
                userId: transferData.transferredBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // Log team activity
            await this.logTeamActivity({
                teamId: currentTeam.id,
                guildId,
                action: 'leadership_transfer',
                performedBy: transferData.transferredBy,
                previousData: {
                    leaderDiscord: currentTeam.leaderDiscord,
                    leaderIgn: currentTeam.leaderIgn
                },
                newData: {
                    leaderDiscord: transferData.newLeaderDiscord,
                    leaderIgn: transferData.newLeaderIgn
                }
            });

            // Update cached team lists
            await this.updateGuildTeamListCache(guildId, updatedTeam, 'UPDATE');

            this.logger.info(`Leadership transferred for team ${teamName} in guild ${guildId} from ${currentTeam.leaderDiscord} to ${transferData.newLeaderDiscord}`);
            return updatedTeam;
        } catch (error) {
            this.handleError(error, 'Transfer team leadership');
            return null;
        }
    }

    // Update team players method
    async updateTeamPlayers(
        guildId: string, 
        teamName: string, 
        updatedPlayers: TeamPlayer[]
    ): Promise<{success: boolean, data?: any, error?: string}> {
        try {
            // Validate input
            if (!updatedPlayers || updatedPlayers.length === 0) {
                return { success: false, error: 'At least one player required' };
            }

            // Get existing team
            const existingTeam = await this.getTeamByName(guildId, teamName);
            if (!existingTeam) {
                return { success: false, error: 'Team not found' };
            }

            // Update team with new players
            const updatedTeam = await this.updateTeam(guildId, teamName, {
                players: updatedPlayers
            }, 'system');

            if (!updatedTeam) {
                return { success: false, error: 'Failed to update team players' };
            }

            // Log activity
            await this.logTeamActivity({
                teamId: existingTeam.id,
                guildId,
                action: 'player_change',
                performedBy: 'system',
                previousData: { players: existingTeam.players },
                newData: { players: updatedPlayers }
            });

            return { success: true, data: updatedTeam };
        } catch (error) {
            this.handleError(error, 'Update team players');
            return { success: false, error: 'Failed to update team players' };
        }
    }

    // Change team name method
    async changeTeamName(
        guildId: string, 
        oldTeamName: string, 
        newTeamName: string,
        changedBy: string
    ): Promise<{success: boolean, data?: any, error?: string}> {
        try {
            // Check 15-day limit
            const history = await this.getTeamNameChangeHistory(guildId, oldTeamName);
            if (history && !history.canChange) {
                return { 
                    success: false, 
                    error: `Cannot change team name. Next available: ${history.nextAvailable}` 
                };
            }

            // Get existing team
            const existingTeam = await this.getTeamByName(guildId, oldTeamName);
            if (!existingTeam) {
                return { success: false, error: 'Team not found' };
            }

            // Update team name
            const updatedTeam = await this.updateTeam(guildId, oldTeamName, {
                teamName: newTeamName
            }, changedBy);

            if (!updatedTeam) {
                return { success: false, error: 'Failed to change team name' };
            }

            // Log name change
            await this.logTeamNameChange({
                teamId: existingTeam.id,
                guildId,
                oldName: oldTeamName,
                newName: newTeamName,
                changedBy
            });

            return { success: true, data: updatedTeam };
        } catch (error) {
            this.handleError(error, 'Change team name');
            return { success: false, error: 'Failed to change team name' };
        }
    }
}

// Export singleton instance (following your pattern)
export const teamEnrollmentService = new TeamEnrollmentService();