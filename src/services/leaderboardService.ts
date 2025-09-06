import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    LeaderboardEntry,
    TournamentLeaderboard,
    GroupLeaderboard,
    LiveStandings,
    PlayerRanking,
    LeaderboardCache,
    CreateLeaderboardData,
    UpdateLeaderboardData,
    LeaderboardGenerationResult,
    LeaderboardSearchFilters,
    LeaderboardSearchResult
} from '../types/leaderboard';

export class LeaderboardService extends BaseService {
    private CACHE_TTL = 900; // 15 minutes for leaderboards
    private LIVE_CACHE_TTL = 60; // 1 minute for live standings

    // Generate tournament leaderboard
async generateTournamentLeaderboard(tournamentId: string): Promise<TournamentLeaderboard | null> {
    try {
        const startTime = Date.now();

        // Get tournament details with correct relationships
        const tournament = await this.db.tournament.findUnique({
            where: { id: tournamentId },
            include: {
                groups: {
                    include: {
                        teamRegistrations: true,
                        matches: {
                            include: {
                                matchResults: true
                            }
                        }
                    }
                }
            }
        });

        if (!tournament) {
            throw new Error('Tournament not found');
        }

        // Aggregate all team results across groups
        const teamStats = new Map<string, any>();

        for (const group of tournament.groups) {
            for (const teamReg of group.teamRegistrations) {
                if (!teamStats.has(teamReg.id)) {
                    teamStats.set(teamReg.id, {
                        teamRegistrationId: teamReg.id,
                        teamName: teamReg.teamName,
                        totalMatches: 0,
                        totalKills: 0,
                        totalPoints: 0,
                        positions: [],
                        wins: 0,
                        top5Finishes: 0,
                        top10Finishes: 0
                    });
                }

                // Process match results for this team
                for (const match of group.matches) {
                    const result = match.matchResults.find((r: any) => r.teamRegistrationId === teamReg.id);
                    if (result) {
                        const stats = teamStats.get(teamReg.id)!;
                        stats.totalMatches++;
                        stats.totalKills += result.totalKills;
                        stats.totalPoints += result.totalMatchPoints;
                        stats.positions.push(result.position);

                        if (result.position === 1) stats.wins++;
                        if (result.position <= 5) stats.top5Finishes++;
                        if (result.position <= 10) stats.top10Finishes++;
                    }
                }
            }
        }

        // Convert to leaderboard entries
        const entries: LeaderboardEntry[] = Array.from(teamStats.values()).map(stats => ({
            teamRegistrationId: stats.teamRegistrationId,
            teamName: stats.teamName,
            totalMatches: stats.totalMatches,
            totalKills: stats.totalKills,
            totalPoints: stats.totalPoints,
            averageKills: stats.totalMatches > 0 ? stats.totalKills / stats.totalMatches : 0,
            averagePosition: stats.positions.length > 0 ? 
                stats.positions.reduce((a: number, b: number) => a + b, 0) / stats.positions.length : 25,
            bestPosition: stats.positions.length > 0 ? Math.min(...stats.positions) : 25,
            wins: stats.wins,
            top5Finishes: stats.top5Finishes,
            top10Finishes: stats.top10Finishes,
            winRate: stats.totalMatches > 0 ? (stats.wins / stats.totalMatches) * 100 : 0,
            rank: 0, // Will be set after sorting
            lastUpdated: new Date().toISOString()
        }));

        // Sort by total points (descending), then by total kills (descending)
        entries.sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }
            return b.totalKills - a.totalKills;
        });

        // Assign ranks
        entries.forEach((entry, index) => {
            entry.rank = index + 1;
        });

        const leaderboard: TournamentLeaderboard = {
            tournamentId,
            tournamentName: tournament.name,
            totalTeams: entries.length,
            totalMatches: tournament.groups.reduce((total: number, group: any) => total + group.matches.length, 0),
            lastUpdated: new Date().toISOString(),
            entries,
            generatedAt: new Date().toISOString()
        };

        // Cache the leaderboard
        const cacheData: LeaderboardCache = {
            tournamentId,
            type: 'TOURNAMENT',
            data: leaderboard,
            generatedAt: leaderboard.generatedAt,
            expiresAt: new Date(Date.now() + this.CACHE_TTL * 1000).toISOString(),
            dbStatus: 'SYNCED'
        };

        await redis.hsetObject(`leaderboard:tournament:${tournamentId}`, cacheData);
        await redis.sadd('leaderboards:all', `tournament:${tournamentId}`);

        const processingTime = Date.now() - startTime;
        this.logger.info(`Tournament leaderboard generated for ${tournamentId} in ${processingTime}ms`);

        return leaderboard;

    } catch (error) {
        this.handleError(error, 'Generate tournament leaderboard');
        return null;
    }
}

// Get tournament leaderboard (from cache or generate)
    async getTournamentLeaderboard(tournamentId: string): Promise<TournamentLeaderboard | null> {
        try {
            // Check cache first
            const cached = await redis.hgetObject<LeaderboardCache>(`leaderboard:tournament:${tournamentId}`);
            
            if (cached && cached.data && new Date(cached.expiresAt) > new Date()) {
                return cached.data as TournamentLeaderboard;
            }

            // Generate fresh leaderboard
            return await this.generateTournamentLeaderboard(tournamentId);

        } catch (error) {
            this.handleError(error, 'Get tournament leaderboard');
            return null;
        }
    }

    // Generate group leaderboard
async generateGroupLeaderboard(groupId: string): Promise<GroupLeaderboard | null> {
    try {
        const group = await this.db.group.findUnique({
            where: { id: groupId },
            include: {
                tournament: true,
                teamRegistrations: true,
                matches: {
                    include: {
                        matchResults: true
                    }
                }
            }
        });

        if (!group) {
            throw new Error('Group not found');
        }

        // Similar logic to tournament leaderboard but for single group
        const teamStats = new Map<string, any>();

        for (const teamReg of group.teamRegistrations) {
            teamStats.set(teamReg.id, {
                teamRegistrationId: teamReg.id,
                teamName: teamReg.teamName,
                totalMatches: 0,
                totalKills: 0,
                totalPoints: 0,
                positions: [],
                wins: 0,
                top5Finishes: 0,
                top10Finishes: 0
            });

            for (const match of group.matches) {
                const result = match.matchResults.find((r: any) => r.teamRegistrationId === teamReg.id);
                if (result) {
                    const stats = teamStats.get(teamReg.id)!;
                    stats.totalMatches++;
                    stats.totalKills += result.totalKills;
                    stats.totalPoints += result.totalMatchPoints;
                    stats.positions.push(result.position);

                    if (result.position === 1) stats.wins++;
                    if (result.position <= 5) stats.top5Finishes++;
                    if (result.position <= 10) stats.top10Finishes++;
                }
            }
        }

        const entries: LeaderboardEntry[] = Array.from(teamStats.values()).map(stats => ({
            teamRegistrationId: stats.teamRegistrationId,
            teamName: stats.teamName,
            totalMatches: stats.totalMatches,
            totalKills: stats.totalKills,
            totalPoints: stats.totalPoints,
            averageKills: stats.totalMatches > 0 ? stats.totalKills / stats.totalMatches : 0,
            averagePosition: stats.positions.length > 0 ? 
                stats.positions.reduce((a: number, b: number) => a + b, 0) / stats.positions.length : 25,
            bestPosition: stats.positions.length > 0 ? Math.min(...stats.positions) : 25,
            wins: stats.wins,
            top5Finishes: stats.top5Finishes,
            top10Finishes: stats.top10Finishes,
            winRate: stats.totalMatches > 0 ? (stats.wins / stats.totalMatches) * 100 : 0,
            rank: 0,
            lastUpdated: new Date().toISOString()
        }));

        entries.sort((a, b) => b.totalPoints - a.totalPoints || b.totalKills - a.totalKills);
        entries.forEach((entry, index) => { entry.rank = index + 1; });

        const leaderboard: GroupLeaderboard = {
            groupId,
            groupName: group.name,
            tournamentId: group.tournamentId,
            totalTeams: entries.length,
            totalMatches: group.matches.length,
            lastUpdated: new Date().toISOString(),
            entries,
            generatedAt: new Date().toISOString()
        };

        // Cache it
        const cacheData: LeaderboardCache = {
            tournamentId: group.tournamentId,
            type: 'GROUP',
            groupId,
            data: leaderboard,
            generatedAt: leaderboard.generatedAt,
            expiresAt: new Date(Date.now() + this.CACHE_TTL * 1000).toISOString(),
            dbStatus: 'SYNCED'
        };

        await redis.hsetObject(`leaderboard:group:${groupId}`, cacheData);

        return leaderboard;

    } catch (error) {
        this.handleError(error, 'Generate group leaderboard');
        return null;
    }
}

    // Get live standings (real-time leaderboard)
    async getLiveStandings(tournamentId: string): Promise<LiveStandings | null> {
        try {
            // Check if we have fresh live standings
            const cached = await redis.hgetObject<LeaderboardCache>(`leaderboard:live:${tournamentId}`);
            
            if (cached && cached.data && new Date(cached.expiresAt) > new Date()) {
                return cached.data as LiveStandings;
            }

            // Generate fresh live standings
            const tournamentLeaderboard = await this.generateTournamentLeaderboard(tournamentId);
            
            if (!tournamentLeaderboard) return null;

            const liveStandings: LiveStandings = {
                ...tournamentLeaderboard,
                isLive: true,
                nextUpdateIn: this.LIVE_CACHE_TTL
            };

            // Cache with shorter TTL for live data
            const cacheData: LeaderboardCache = {
                tournamentId,
                type: 'LIVE',
                data: liveStandings,
                generatedAt: liveStandings.generatedAt,
                expiresAt: new Date(Date.now() + this.LIVE_CACHE_TTL * 1000).toISOString(),
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`leaderboard:live:${tournamentId}`, cacheData);

            return liveStandings;

        } catch (error) {
            this.handleError(error, 'Get live standings');
            return null;
        }
    }

    // Refresh leaderboard (force regeneration)
    async refreshLeaderboard(tournamentId: string, config: UpdateLeaderboardData): Promise<LeaderboardGenerationResult> {
        try {
            const startTime = Date.now();

            // Clear existing cache
            await redis.delete(`leaderboard:tournament:${tournamentId}`);
            await redis.delete(`leaderboard:live:${tournamentId}`);

            // Regenerate
            const leaderboard = await this.generateTournamentLeaderboard(tournamentId);
            
            if (!leaderboard) {
                return {
                    success: false,
                    tournamentId,
                    type: 'TOURNAMENT',
                    entriesGenerated: 0,
                    processingTime: Date.now() - startTime,
                    errors: ['Failed to generate leaderboard'],
                    lastUpdated: new Date().toISOString()
                };
            }

            // Optionally refresh group leaderboards
            if (config.includeGroups && config.includeGroups.length > 0) {
                for (const groupId of config.includeGroups) {
                    await redis.delete(`leaderboard:group:${groupId}`);
                    await this.generateGroupLeaderboard(groupId);
                }
            }

            return {
                success: true,
                tournamentId,
                type: 'TOURNAMENT',
                entriesGenerated: leaderboard.entries.length,
                processingTime: Date.now() - startTime,
                errors: [],
                lastUpdated: leaderboard.lastUpdated
            };

        } catch (error) {
            this.handleError(error, 'Refresh leaderboard');
            return {
                success: false,
                tournamentId,
                type: 'TOURNAMENT',
                entriesGenerated: 0,
                processingTime: 0,
                errors: [(error as any).message],
                lastUpdated: new Date().toISOString()
            };
        }
    }

    // Search leaderboard entries
    async searchLeaderboard(filters: LeaderboardSearchFilters): Promise<LeaderboardSearchResult> {
        try {
            let leaderboard: TournamentLeaderboard | GroupLeaderboard | null = null;

            if (filters.groupId) {
                leaderboard = await this.generateGroupLeaderboard(filters.groupId);
            } else if (filters.tournamentId) {
                leaderboard = await this.getTournamentLeaderboard(filters.tournamentId);
            } else {
                throw new Error('Either tournamentId or groupId must be provided');
            }

            if (!leaderboard) {
                return {
                    entries: [],
                    total: 0,
                    filters,
                    generatedAt: new Date().toISOString()
                };
            }

            let filteredEntries = leaderboard.entries;

            // Apply filters
            if (filters.teamName) {
                filteredEntries = filteredEntries.filter(entry => 
                    entry.teamName.toLowerCase().includes(filters.teamName!.toLowerCase())
                );
            }

            if (filters.minKills !== undefined) {
                filteredEntries = filteredEntries.filter(entry => entry.totalKills >= filters.minKills!);
            }

            if (filters.maxKills !== undefined) {
                filteredEntries = filteredEntries.filter(entry => entry.totalKills <= filters.maxKills!);
            }

            if (filters.rankRange) {
                filteredEntries = filteredEntries.filter(entry => 
                    entry.rank >= filters.rankRange!.from && entry.rank <= filters.rankRange!.to
                );
            }

            return {
                entries: filteredEntries,
                total: filteredEntries.length,
                filters,
                generatedAt: leaderboard.generatedAt
            };

        } catch (error) {
            this.handleError(error, 'Search leaderboard');
            return {
                entries: [],
                total: 0,
                filters,
                generatedAt: new Date().toISOString()
            };
        }
    }
}

export const leaderboardService = new LeaderboardService();