import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    QuickTournamentSeriesCache,
    CreateQuickSeriesData,
    UpdateQuickSeriesData,
    QuickSeriesStatus,
    SeriesTeamStanding,
    QuickSeriesMatchCache,
    QuickSeriesLeaderboardCache
} from '../types/quickSeries';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { tieBreakingService } from './tieBreakingService';
import {
    ConflictDetectionResult,
    TieBreakingConfig,
    SeriesTieBreakingResult,
    TieBreakingRule
} from '../types/tieBreaking';

export class QuickSeriesService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Create a new Tournament Series
     */
    async createTournamentSeries(userId: string, data: CreateQuickSeriesData): Promise<QuickTournamentSeriesCache> {
        try {
            // 1. Generate Series ID
            const seriesId = randomUUID();

            // 2. Set default scoring if not provided
            const positionPointsConfig = data.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0];
            const killPointsValue = data.killPointsValue ?? 1;
            const scoringDescription = data.scoringDescription || 'Standard BGMI Scoring';

            // 3. Create Series object
            const tournamentSeries: QuickTournamentSeriesCache = {
                id: seriesId,
                seriesName: data.seriesName,
                game: data.game || 'BGMI',
                totalMatches: data.totalMatches,
                matchesCompleted: 0,
                status: 'CREATED',
                positionPointsConfig,
                killPointsValue,
                scoringDescription,
                currentMatchNumber: 1,
                isFinished: false,
                userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Cache the series
            await redis.hsetObject(`quick_series:${seriesId}`, tournamentSeries, this.CACHE_TTL);

            // 5. Add to user's series list
            await redis.sadd(`user:${userId}:quick_series`, seriesId);

            // 6. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SERIES', 'CREATE', seriesId, tournamentSeries, userId);

            this.logger.info(`Tournament Series created: ${seriesId} for user ${userId}`);
            return tournamentSeries;

        } catch (error) {
            this.handleError(error, 'Create Tournament Series');
            throw error;
        }
    }

    /**
     * Add a match to the series
     */
    async addMatchToSeries(seriesId: string, quickMatchId: string, userId: string): Promise<QuickSeriesMatchCache> {
        try {
            // 1. Get the series
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new Error('Tournament series not found');
            }

            // 2. Validate series can accept more matches.
            // currentMatchNumber is 1-indexed and starts at 1, so (currentMatchNumber - 1) == matches already added.
            if ((series.currentMatchNumber - 1) >= series.totalMatches) {
                throw new Error('Series already has maximum number of matches');
            }

            // 3. Verify the quick match exists and belongs to user
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick match not found');
            }

            // 4. Create series match relationship
            const seriesMatchId = randomUUID();
            const seriesMatch: QuickSeriesMatchCache = {
                id: seriesMatchId,
                seriesId,
                quickMatchId,
                matchOrder: series.currentMatchNumber,
                isCompleted: false,
                matchWeight: 1.0,
                bonusPoints: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Cache the series match and track its ID in the series match set
            await redis.hsetObject(`quick_series_match:${seriesMatchId}`, seriesMatch, this.CACHE_TTL);
            await redis.sadd(`quick_series:${seriesId}:matches`, seriesMatchId);

            // 6. Increment currentMatchNumber and update status in a single update
            const seriesUpdates: UpdateQuickSeriesData = {
                currentMatchNumber: series.currentMatchNumber + 1
            };
            if (series.status === 'CREATED') {
                seriesUpdates.status = 'IN_PROGRESS';
            }
            await this.updateTournamentSeries(seriesId, userId, seriesUpdates);

            // 7. Queue database sync for the series match
            await QueueService.syncQuickPtImmediately('QUICK_SERIES_MATCH', 'CREATE', seriesMatchId, seriesMatch, userId);

            this.logger.info(`Match ${quickMatchId} added to series ${seriesId} at position ${seriesMatch.matchOrder}`);
            return seriesMatch;

        } catch (error) {
            this.handleError(error, 'Add Match to Series');
            throw error;
        }
    }

    /**
     * Called when a quick match finishes (AI pipeline or manual results).
     * Marks the series match as completed, increments matchesCompleted, and rebuilds the leaderboard.
     * Errors are swallowed so the caller's primary operation is never blocked.
     */
    async onMatchCompleted(quickMatchId: string, userId: string): Promise<void> {
        try {
            const series = await this.getSeriesByMatchId(quickMatchId, userId);
            if (!series) return;

            this.logger.info(`Match ${quickMatchId} belongs to series ${series.id} — updating progression`);

            // Mark the series match as completed in DB and update Redis cache
            await this.db.quickSeriesMatch.update({
                where: { quickMatchId },
                data: { isCompleted: true, completedAt: new Date() }
            });

            // Refresh the Redis cache entry for this series match
            const updatedDbMatch = await this.db.quickSeriesMatch.findUnique({
                where: { quickMatchId }
            });
            if (updatedDbMatch) {
                const updatedCache: QuickSeriesMatchCache = {
                    id: updatedDbMatch.id,
                    seriesId: updatedDbMatch.seriesId,
                    quickMatchId: updatedDbMatch.quickMatchId,
                    matchOrder: updatedDbMatch.matchOrder,
                    isCompleted: true,
                    completedAt: updatedDbMatch.completedAt?.toISOString(),
                    matchWeight: updatedDbMatch.matchWeight,
                    bonusPoints: updatedDbMatch.bonusPoints,
                    createdAt: updatedDbMatch.createdAt.toISOString(),
                    updatedAt: updatedDbMatch.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                };
                await redis.hsetObject(`quick_series_match:${updatedDbMatch.id}`, updatedCache, this.CACHE_TTL);
            }

            // Increment matchesCompleted on the series
            await this.updateTournamentSeries(series.id, userId, {
                matchesCompleted: series.matchesCompleted + 1
            });

            // Rebuild leaderboard with updated completed matches
            await this.updateSeriesLeaderboard(series.id, userId);

            this.logger.info(`Series ${series.id} progression updated — matchesCompleted: ${series.matchesCompleted + 1}`);
        } catch (error) {
            this.logger.warn(`Failed to update series progression for match ${quickMatchId}:`, error);
        }
    }

    /**
     * Update leaderboard when a match is completed
     */
    async updateSeriesLeaderboard(seriesId: string, userId: string): Promise<QuickSeriesLeaderboardCache> {
        try {
            // 1. Get all completed matches in the series
            const seriesMatches = await this.getSeriesMatches(seriesId, userId);
            const completedMatches = seriesMatches.filter(match => match.isCompleted);

            // 2. Aggregate team standings from all completed matches
            const teamStandings = await this.calculateSeriesStandings(completedMatches, userId);

            // 3. Create/update leaderboard
            const leaderboard: QuickSeriesLeaderboardCache = {
                id: randomUUID(),
                seriesId,
                leaderboardData: teamStandings,
                lastUpdatedMatch: completedMatches.length,
                generatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Cache the leaderboard
            await redis.hsetObject(`quick_series_leaderboard:${seriesId}`, leaderboard, this.CACHE_TTL);

            // 5. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SERIES_LEADERBOARD', 'UPDATE', seriesId, leaderboard, userId);

            // 6. Check if series is complete
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (series && completedMatches.length >= series.totalMatches) {
                await this.completeSeries(seriesId, userId, teamStandings);
            }

            return leaderboard;

        } catch (error) {
            this.handleError(error, 'Update Series Leaderboard');
            throw error;
        }
    }

    /**
     * Calculate aggregated team standings across multiple matches
     */
    private async calculateSeriesStandings(completedMatches: QuickSeriesMatchCache[], userId: string): Promise<SeriesTeamStanding[]> {
        const teamStandings = new Map<string, SeriesTeamStanding>();

        for (const seriesMatch of completedMatches) {
            // Get match results for this completed match
            const matchResults = await quickProcessingService.getMatchResults(seriesMatch.quickMatchId, userId);

            for (const result of matchResults) {
                const teamName = result.teamName;

                if (!teamStandings.has(teamName)) {
                    teamStandings.set(teamName, {
                        teamName,
                        totalPoints: 0,
                        matchesPlayed: 0,
                        bestPosition: result.position,
                        worstPosition: result.position,
                        totalKills: 0,
                        averagePosition: 0,
                        matchResults: []
                    });
                }

                const standing = teamStandings.get(teamName)!;

                // Add this match's results
                const matchPoints = (result.totalPoints + seriesMatch.bonusPoints) * seriesMatch.matchWeight;

                standing.totalPoints += matchPoints;
                standing.matchesPlayed += 1;
                standing.totalKills += result.totalKills;
                standing.bestPosition = Math.min(standing.bestPosition, result.position);
                standing.worstPosition = Math.max(standing.worstPosition, result.position);

                standing.matchResults.push({
                    matchOrder: seriesMatch.matchOrder,
                    quickMatchId: seriesMatch.quickMatchId,
                    position: result.position,
                    kills: result.totalKills,
                    points: result.totalPoints,
                    bonusPoints: seriesMatch.bonusPoints
                });
            }
        }

        // Calculate average positions
        for (const standing of Array.from(teamStandings.values())) {
            const totalPositions = standing.matchResults.reduce((sum, match) => sum + match.position, 0);
            standing.averagePosition = totalPositions / standing.matchesPlayed;
        }

        // Apply tie-breaking logic before final sorting
        let finalStandings = Array.from(teamStandings.values());
        
        // Get tie-breaking configuration for series
        const seriesId = completedMatches[0]?.seriesId;
        if (seriesId) {
            try {
                const conflictDetection = await tieBreakingService.detectSeriesConflicts(finalStandings);
                
                if (conflictDetection.hasConflicts) {
                    const tieBreakingConfig = await tieBreakingService.getTieBreakingConfig(seriesId, 'series');
                    
                    if (tieBreakingConfig && tieBreakingConfig.autoResolveEnabled) {
                        // Apply series-specific tie-breaking rules
                        finalStandings = this.applySeriesTieBreaking(finalStandings, tieBreakingConfig.rules);
                        this.logger.info(`Series tie-breaking applied for ${seriesId}: ${conflictDetection.conflictGroups.length} conflicts resolved`);
                    }
                }
            } catch (error) {
                this.logger.warn(`Tie-breaking failed for series ${seriesId}, using simple sort:`, error);
            }
        }

        // Final sort by total points (with tie-breaking already applied)
        return finalStandings.sort((a, b) => b.totalPoints - a.totalPoints);
    }

    /**
     * Complete the series and declare winner
     */
    private async completeSeries(seriesId: string, userId: string, finalStandings: SeriesTeamStanding[]): Promise<void> {
        const winnerTeamName = finalStandings[0]?.teamName;

        await this.updateTournamentSeries(seriesId, userId, {
            status: 'COMPLETED',
            isFinished: true,
            winnerTeamName,
            finalStandings
        });

        this.logger.info(`Series ${seriesId} completed. Winner: ${winnerTeamName}`);
    }

    /**
 * Get Tournament Series by ID
 */
    async getTournamentSeriesById(seriesId: string, userId: string): Promise<QuickTournamentSeriesCache | null> {
        try {
            // 1. Try Redis first
            const cached = await redis.hgetObject<QuickTournamentSeriesCache>(`quick_series:${seriesId}`);
            if (cached && cached.userId === userId) {
                return cached;
            }

            // 2. Fallback to database
            const dbSeries = await this.db.quickTournamentSeries.findFirst({
                where: { id: seriesId, userId }
            });

            if (!dbSeries) {
                return null;
            }

            // 3. Convert to cache format and store in Redis
            const tournamentSeries: QuickTournamentSeriesCache = {
                id: dbSeries.id,
                seriesName: dbSeries.seriesName,
                game: dbSeries.game,
                totalMatches: dbSeries.totalMatches,
                matchesCompleted: dbSeries.matchesCompleted,
                status: dbSeries.status as QuickSeriesStatus,
                positionPointsConfig: dbSeries.positionPointsConfig
                    ? JSON.parse(JSON.stringify(dbSeries.positionPointsConfig)) as number[]
                    : undefined,
                killPointsValue: dbSeries.killPointsValue,
                scoringDescription: dbSeries.scoringDescription || undefined,
                currentMatchNumber: dbSeries.currentMatchNumber,
                isFinished: dbSeries.isFinished,
                winnerTeamName: dbSeries.winnerTeamName || undefined,
                finalStandings: dbSeries.finalStandings
                    ? JSON.parse(JSON.stringify(dbSeries.finalStandings)) as SeriesTeamStanding[]
                    : undefined,
                userId: dbSeries.userId,
                createdAt: dbSeries.createdAt.toISOString(),
                updatedAt: dbSeries.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`quick_series:${seriesId}`, tournamentSeries, this.CACHE_TTL);
            return tournamentSeries;

        } catch (error) {
            this.handleError(error, 'Get Tournament Series by ID');
            return null;
        }
    }

    /**
     * Update Tournament Series
     */
    async updateTournamentSeries(
        seriesId: string,
        userId: string,
        data: UpdateQuickSeriesData
    ): Promise<QuickTournamentSeriesCache> {
        try {
            // 1. Get existing series
            const existing = await this.getTournamentSeriesById(seriesId, userId);
            if (!existing) {
                throw new Error('Tournament series not found or access denied');
            }

            // 2. Update series object
            const updated: QuickTournamentSeriesCache = {
                ...existing,
                ...data,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis
            await redis.hsetObject(`quick_series:${seriesId}`, updated);

            // 4. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SERIES', 'UPDATE', seriesId, updated, userId);

            this.logger.info(`Tournament Series ${seriesId} updated by user ${userId}`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update Tournament Series');
            throw error;
        }
    }

    /**
     * Get all matches in a series.
     * Tries the Redis set first (populated when matches are added), falls back to DB.
     */
    async getSeriesMatches(seriesId: string, userId: string): Promise<QuickSeriesMatchCache[]> {
        try {
            // Verify series ownership
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new Error('Tournament series not found or access denied');
            }

            // 1. Try Redis set of match IDs added to this series
            const cachedIds = await redis.smembers(`quick_series:${seriesId}:matches`);
            if (cachedIds.length > 0) {
                const cachedMatches = await Promise.all(
                    cachedIds.map(id => redis.hgetObject<QuickSeriesMatchCache>(`quick_series_match:${id}`))
                );
                const validCached = cachedMatches.filter(Boolean) as QuickSeriesMatchCache[];
                // Only trust cache if every ID resolved (no evictions)
                if (validCached.length === cachedIds.length) {
                    return validCached.sort((a, b) => a.matchOrder - b.matchOrder);
                }
            }

            // 2. Fallback to database
            const dbMatches = await this.db.quickSeriesMatch.findMany({
                where: { seriesId },
                orderBy: { matchOrder: 'asc' }
            });

            const result = dbMatches.map(dbMatch => ({
                id: dbMatch.id,
                seriesId: dbMatch.seriesId,
                quickMatchId: dbMatch.quickMatchId,
                matchOrder: dbMatch.matchOrder,
                isCompleted: dbMatch.isCompleted,
                completedAt: dbMatch.completedAt?.toISOString(),
                matchWeight: dbMatch.matchWeight,
                bonusPoints: dbMatch.bonusPoints,
                createdAt: dbMatch.createdAt.toISOString(),
                updatedAt: dbMatch.updatedAt.toISOString(),
                dbStatus: 'SYNCED' as const
            }));

            // Warm the Redis set and individual caches from DB data
            for (const match of result) {
                await redis.hsetObject(`quick_series_match:${match.id}`, match, this.CACHE_TTL);
                await redis.sadd(`quick_series:${seriesId}:matches`, match.id);
            }

            return result;

        } catch (error) {
            this.handleError(error, 'Get Series Matches');
            throw error;
        }
    }

    /**
     * Get series leaderboard
     */
    async getSeriesLeaderboard(seriesId: string, userId: string): Promise<QuickSeriesLeaderboardCache | null> {
        try {
            // Verify series ownership
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new Error('Tournament series not found or access denied');
            }

            // Try Redis first
            const cached = await redis.hgetObject<QuickSeriesLeaderboardCache>(`quick_series_leaderboard:${seriesId}`);
            if (cached) {
                return cached;
            }

            // Try database fallback
            const dbLeaderboard = await this.db.quickSeriesLeaderboard.findFirst({
                where: { seriesId }
            });

            if (!dbLeaderboard) {
                return null;
            }

            const leaderboard: QuickSeriesLeaderboardCache = {
                id: dbLeaderboard.id,
                seriesId: dbLeaderboard.seriesId,
                leaderboardData: JSON.parse(JSON.stringify(dbLeaderboard.leaderboardData)) as SeriesTeamStanding[],
                lastUpdatedMatch: dbLeaderboard.lastUpdatedMatch,
                generatedAt: dbLeaderboard.generatedAt.toISOString(),
                updatedAt: dbLeaderboard.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            await redis.hsetObject(`quick_series_leaderboard:${seriesId}`, leaderboard, this.CACHE_TTL);
            return leaderboard;

        } catch (error) {
            this.handleError(error, 'Get Series Leaderboard');
            return null;
        }
    }
    /**
     * Detect conflicts in series standings
     */
    async detectSeriesConflicts(
        seriesId: string,
        userId: string
    ): Promise<ConflictDetectionResult> {
        try {
            // 1. Get only completed matches (incomplete matches have no results to aggregate)
            const allMatches = await this.getSeriesMatches(seriesId, userId);
            const completedMatches = allMatches.filter(m => m.isCompleted);
            const standings = await this.calculateSeriesStandings(completedMatches, userId);
            
            if (standings.length === 0) {
                return {
                    hasConflicts: false,
                    conflictGroups: [],
                    totalConflictedTeams: 0,
                    autoResolvableCount: 0,
                    manualResolutionRequired: 0
                };
            }

            // 2. Detect conflicts
            const conflictDetection = await tieBreakingService.detectSeriesConflicts(standings);
            
            this.logger.info(`Series conflict detection for ${seriesId}: ${conflictDetection.conflictGroups.length} conflicts found`);
            
            return conflictDetection;

        } catch (error) {
            this.handleError(error, 'Detect Series Conflicts');
            throw error;
        }
    }

    /**
     * Set tie-breaking rules for a series
     */
    async setSeriesTieBreakingRules(
        seriesId: string,
        userId: string,
        rules: TieBreakingRule[],
        autoResolveEnabled: boolean
    ): Promise<{ success: boolean }> {
        try {
            // 1. Verify ownership
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new Error('Tournament series not found or access denied');
            }

            // 2. Create tie-breaking configuration
            const config: TieBreakingConfig = {
                seriesId,
                rules,
                manualResolutions: [],
                autoResolveEnabled
            };

            // 3. Save configuration
            await tieBreakingService.saveTieBreakingConfig(seriesId, 'series', config);
            
            this.logger.info(`Series tie-breaking rules set for ${seriesId}: ${rules.length} rules, auto-resolve: ${autoResolveEnabled}`);
            
            return { success: true };

        } catch (error) {
            this.handleError(error, 'Set Series Tie Breaking Rules');
            throw error;
        }
    }

    /**
     * Apply series-specific tie-breaking rules
     * @private
     */
    private applySeriesTieBreaking(
        standings: SeriesTeamStanding[],
        rules: TieBreakingRule[]
    ): SeriesTeamStanding[] {
        try {
            // Group teams by total points to identify conflicts
            const pointsGroups = new Map<number, SeriesTeamStanding[]>();
            
            for (const standing of standings) {
                const points = standing.totalPoints;
                if (!pointsGroups.has(points)) {
                    pointsGroups.set(points, []);
                }
                pointsGroups.get(points)!.push(standing);
            }

            let resolvedStandings: SeriesTeamStanding[] = [];
            const activeRules = rules.filter(rule => rule.isActive)
                .sort((a, b) => a.priority - b.priority);

            for (const [points, teamGroup] of pointsGroups) {
                if (teamGroup.length === 1) {
                    // No conflict, add as is
                    resolvedStandings.push(...teamGroup);
                } else {
                    // Apply tie-breaking rules
                    let sortedGroup = [...teamGroup];
                    
                    for (const rule of activeRules) {
                        sortedGroup = this.applySingleSeriesTieBreakingRule(sortedGroup, rule);
                        
                        // Check if conflict is resolved
                        if (this.isSeriesConflictResolved(sortedGroup)) {
                            break;
                        }
                    }
                    
                    resolvedStandings.push(...sortedGroup);
                }
            }

            return resolvedStandings;

        } catch (error) {
            this.logger.warn('Series tie-breaking failed, returning original order:', error);
            return standings;
        }
    }

    /**
     * Apply single tie-breaking rule to series standings
     * @private
     */
    private applySingleSeriesTieBreakingRule(
        standings: SeriesTeamStanding[],
        rule: TieBreakingRule
    ): SeriesTeamStanding[] {
        switch (rule.method) {
            case 'KILLS':
                return standings.sort((a, b) => b.totalKills - a.totalKills);
            
            case 'BEST_POSITION':
                return standings.sort((a, b) => a.bestPosition - b.bestPosition);
            
            case 'MANUAL_ORDER':
                // Manual order should be handled separately
                return standings;
            
            default:
                return standings;
        }
    }

    /**
     * Check if series conflict is resolved
     * @private
     */
    private isSeriesConflictResolved(standings: SeriesTeamStanding[]): boolean {
        for (let i = 1; i < standings.length; i++) {
            // If any two consecutive teams are still tied on relevant criteria
            if (standings[i-1].totalKills === standings[i].totalKills && 
                standings[i-1].bestPosition === standings[i].bestPosition) {
                return false;
            }
        }
        return true;
    }
    /**
 * List all Tournament Series for a user with pagination
 */
async listUserSeries(
    userId: string,
    filters?: {
        status?: QuickSeriesStatus;
        page?: number;
        limit?: number;
    }
): Promise<{ series: QuickTournamentSeriesCache[]; total: number; page: number; limit: number }> {
    try {
        const page = filters?.page || 1;
        const limit = filters?.limit || 10;
        const skip = (page - 1) * limit;

        // Build where clause
        const where: any = { userId };
        if (filters?.status) {
            where.status = filters.status;
        }

        // Get total count
        const total = await this.db.quickTournamentSeries.count({ where });

        // Get series from database with pagination
        const dbSeries = await this.db.quickTournamentSeries.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                _count: {
                    select: {
                        seriesMatches: true
                    }
                }
            }
        });

        // Convert to cache format
        const series: QuickTournamentSeriesCache[] = dbSeries.map(dbSeries => ({
            id: dbSeries.id,
            seriesName: dbSeries.seriesName,
            game: dbSeries.game,
            totalMatches: dbSeries.totalMatches,
            matchesCompleted: dbSeries.matchesCompleted,
            status: dbSeries.status as QuickSeriesStatus,
            positionPointsConfig: dbSeries.positionPointsConfig
                ? JSON.parse(JSON.stringify(dbSeries.positionPointsConfig)) as number[]
                : undefined,
            killPointsValue: dbSeries.killPointsValue,
            scoringDescription: dbSeries.scoringDescription || undefined,
            currentMatchNumber: dbSeries.currentMatchNumber,
            isFinished: dbSeries.isFinished,
            winnerTeamName: dbSeries.winnerTeamName || undefined,
            finalStandings: dbSeries.finalStandings
                ? JSON.parse(JSON.stringify(dbSeries.finalStandings)) as SeriesTeamStanding[]
                : undefined,
            userId: dbSeries.userId,
            createdAt: dbSeries.createdAt.toISOString(),
            updatedAt: dbSeries.updatedAt.toISOString(),
            dbStatus: 'SYNCED'
        }));

        return { series, total, page, limit };

    } catch (error) {
        this.handleError(error, 'List User Tournament Series');
        throw error;
    }
}

/**
 * Delete Tournament Series (also deletes related data)
 */
async deleteTournamentSeries(seriesId: string, userId: string): Promise<void> {
    try {
        // 1. Verify ownership
        const series = await this.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            throw new Error('Tournament series not found or access denied');
        }

        // 2. Delete from database (cascade will handle related data)
        await this.db.quickTournamentSeries.delete({
            where: { id: seriesId }
        });

        // 3. Delete from Redis
        await redis.delete(`quick_series:${seriesId}`);
        await redis.srem(`user:${userId}:quick_series`, seriesId);

        // 4. Clean up related cache keys
        await redis.delete(`quick_series_leaderboard:${seriesId}`);
        await redis.delete(`quick_series:${seriesId}:matches`);

        this.logger.info(`Tournament Series ${seriesId} deleted by user ${userId}`);

    } catch (error) {
        this.handleError(error, 'Delete Tournament Series');
        throw error;
    }
}

/**
 * Find series that contains a specific match
 */
async getSeriesByMatchId(quickMatchId: string, userId: string): Promise<QuickTournamentSeriesCache | null> {
    try {
        // 1. Check database for series match relationship
        const seriesMatch = await this.db.quickSeriesMatch.findUnique({
            where: { quickMatchId },
            include: { 
                series: true
            }
        });

        if (!seriesMatch || seriesMatch.series.userId !== userId) {
            return null;
        }

        // 2. Return full series data using existing method
        return await this.getTournamentSeriesById(seriesMatch.seriesId, userId);

    } catch (error) {
        this.handleError(error, 'Get Series by Match ID');
        return null;
    }
}
}

export const quickSeriesService = new QuickSeriesService();