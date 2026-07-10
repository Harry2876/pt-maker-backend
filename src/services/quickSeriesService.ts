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
import { quickResultService } from './quickResultService';
import { QuickMatchResultCache } from '../types/quickResult';
import { quickSlotService } from './quickSlotService';
import { tieBreakingService } from './tieBreakingService';
import { ServiceError } from '../utils/serviceError';
import { buildSlotFingerprint, slotFingerprintsMatch, normalizeTeamName } from '../utils/seriesSlotUtils';
import { sortSeriesStandingsForLeaderboard } from '../utils/standingsSort';
import {
    ConflictDetectionResult,
    TieBreakingConfig,
    TieBreakingRule,
    ManualTieBreaking
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

            const tournamentSeries: QuickTournamentSeriesCache = {
                id: seriesId,
                seriesName: data.seriesName,
                game: data.game || 'BGMI',
                totalMatches: data.totalMatches,
                matchesCompleted: 0,
                status: 'CREATED',
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
     * Add a match to the series.
     * Validates duplicate membership and matching slot rosters across series matches.
     */
    async addMatchToSeries(seriesId: string, quickMatchId: string, userId: string): Promise<QuickSeriesMatchCache> {
        try {
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new ServiceError('Tournament series not found', 404, 'NOT_FOUND');
            }

            if ((series.currentMatchNumber - 1) >= series.totalMatches) {
                throw new ServiceError(
                    'Series already has the maximum number of matches',
                    400,
                    'SERIES_FULL'
                );
            }

            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new ServiceError('Quick match not found', 404, 'NOT_FOUND');
            }

            const existingLink = await this.db.quickSeriesMatch.findFirst({
                where: { quickMatchId, seriesId },
            });
            if (existingLink) {
                throw new ServiceError(
                    'This match is already added to this series',
                    400,
                    'MATCH_ALREADY_IN_SERIES'
                );
            }

            await this.validateMatchSlotListForSeries(seriesId, quickMatchId, userId);

            const hasResults = await this.matchHasResults(quickMatchId, userId);
            const seriesMatchId = randomUUID();
            const seriesMatch: QuickSeriesMatchCache = {
                id: seriesMatchId,
                seriesId,
                quickMatchId,
                matchOrder: series.currentMatchNumber,
                isCompleted: hasResults,
                matchWeight: 1.0,
                bonusPoints: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC',
            };

            await redis.hsetObject(`quick_series_match:${seriesMatchId}`, seriesMatch, this.CACHE_TTL);
            await redis.sadd(`quick_series:${seriesId}:matches`, seriesMatchId);
            await redis.set(`quickMatch:${quickMatchId}:seriesId`, seriesId, this.CACHE_TTL);

            const seriesUpdates: UpdateQuickSeriesData = {
                currentMatchNumber: series.currentMatchNumber + 1,
            };
            if (series.status === 'CREATED') {
                seriesUpdates.status = 'IN_PROGRESS';
            }
            await this.updateTournamentSeries(seriesId, userId, seriesUpdates);

            await QueueService.syncQuickPtImmediately(
                'QUICK_SERIES_MATCH',
                'CREATE',
                seriesMatchId,
                seriesMatch,
                userId
            );

            // Rebuild in background when match already has results — don't block the API response
            if (hasResults) {
                void this.updateSeriesLeaderboard(seriesId, userId).catch((err) =>
                    this.logger.warn(`Deferred series leaderboard rebuild failed for ${seriesId}:`, err)
                );
            }

            this.logger.info(`Match ${quickMatchId} added to series ${seriesId} at position ${seriesMatch.matchOrder}`);
            return seriesMatch;
        } catch (error) {
            this.handleError(error, 'Add Match to Series');
            throw error;
        }
    }

    /**
     * Rebuild series leaderboard when a match gets or updates results.
     * Safe to call from result processing — errors are logged, not thrown to callers.
     */
    async refreshSeriesForMatch(quickMatchId: string, userId: string): Promise<void> {
        try {
            const allSeries = await this.getAllSeriesForMatch(quickMatchId, userId);
            if (allSeries.length === 0) return;

            await Promise.all(allSeries.map(async (series) => {
                this.logger.info(`Refreshing series ${series.id} leaderboard after match ${quickMatchId} results changed`);
                await this.updateSeriesLeaderboard(series.id, userId);
            }));
        } catch (error) {
            this.logger.warn(`Failed to refresh series for match ${quickMatchId}:`, error);
        }
    }

    /** @deprecated Use refreshSeriesForMatch — kept for existing callers */
    async onMatchCompleted(quickMatchId: string, userId: string): Promise<void> {
        return this.refreshSeriesForMatch(quickMatchId, userId);
    }

    /**
     * Update leaderboard when a match is completed
     */
    async updateSeriesLeaderboard(seriesId: string, userId: string): Promise<QuickSeriesLeaderboardCache> {
        try {
            const seriesMatches = await this.getSeriesMatches(seriesId, userId);
            const resultsByMatch = await quickResultService.getResultsGroupedByMatch(
                seriesMatches.map((match) => match.quickMatchId)
            );
            const matchesWithResults = this.filterMatchesWithResults(seriesMatches, resultsByMatch);
            const teamStandings = await this.calculateSeriesStandings(
                matchesWithResults,
                userId,
                { resultsByMatch }
            );

            const leaderboard: QuickSeriesLeaderboardCache = {
                id: randomUUID(),
                seriesId,
                leaderboardData: teamStandings,
                lastUpdatedMatch: matchesWithResults.length,
                generatedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC',
            };

            await redis.hsetObject(`quick_series_leaderboard:${seriesId}`, leaderboard, this.CACHE_TTL);
            await QueueService.syncQuickPtImmediately(
                'QUICK_SERIES_LEADERBOARD',
                'UPDATE',
                seriesId,
                leaderboard,
                userId
            );

            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (series) {
                await this.updateTournamentSeries(seriesId, userId, {
                    matchesCompleted: matchesWithResults.length,
                });

                if (
                    matchesWithResults.length >= series.totalMatches &&
                    !series.isFinished &&
                    series.status !== 'COMPLETED'
                ) {
                    await this.completeSeries(seriesId, userId, teamStandings);
                }
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
    private async calculateSeriesStandings(
        completedMatches: QuickSeriesMatchCache[],
        userId: string,
        options?: { skipTieBreaking?: boolean; resultsByMatch?: Map<string, QuickMatchResultCache[]> }
    ): Promise<SeriesTeamStanding[]> {
        const rawStandings = await this.aggregateSeriesStandings(
            completedMatches,
            userId,
            options?.resultsByMatch
        );
        const seriesId = completedMatches[0]?.seriesId;

        if (options?.skipTieBreaking || !seriesId) {
            return sortSeriesStandingsForLeaderboard(rawStandings);
        }

        return this.finalizeSeriesStandings(rawStandings, seriesId);
    }

    /**
     * Sum per-match results into series standings without tie-breaking.
     */
    private async aggregateSeriesStandings(
        completedMatches: QuickSeriesMatchCache[],
        userId: string,
        resultsByMatch?: Map<string, QuickMatchResultCache[]>
    ): Promise<SeriesTeamStanding[]> {
        const teamStandings = new Map<string, SeriesTeamStanding>();

        for (const seriesMatch of completedMatches) {
            const matchResults = resultsByMatch
                ? (resultsByMatch.get(seriesMatch.quickMatchId) ?? [])
                : await quickResultService.getMatchResults(seriesMatch.quickMatchId, userId);

            for (const result of matchResults) {
                const teamKey = normalizeTeamName(result.teamName);

                if (!teamStandings.has(teamKey)) {
                    teamStandings.set(teamKey, {
                        teamName: result.teamName.trim().replace(/\s+/g, ' '),
                        totalPoints: 0,
                        positionPoints: 0,
                        finishPoints: 0,
                        matchesPlayed: 0,
                        bestPosition: result.position,
                        worstPosition: result.position,
                        totalKills: 0,
                        averagePosition: 0,
                        matchResults: []
                    });
                }

                const standing = teamStandings.get(teamKey)!;
                const matchPoints = (result.totalPoints + seriesMatch.bonusPoints) * seriesMatch.matchWeight;

                standing.totalPoints += matchPoints;
                standing.positionPoints = (standing.positionPoints ?? 0) + result.positionPoints;
                standing.finishPoints = (standing.finishPoints ?? 0) + result.killPoints;
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

        for (const standing of Array.from(teamStandings.values())) {
            const totalPositions = standing.matchResults.reduce((sum, match) => sum + match.position, 0);
            standing.averagePosition = totalPositions / standing.matchesPlayed;
        }

        return Array.from(teamStandings.values());
    }

    /**
     * Apply configured tie-breaking (manual + automatic) and sort by total points.
     */
    private async finalizeSeriesStandings(
        rawStandings: SeriesTeamStanding[],
        seriesId: string
    ): Promise<SeriesTeamStanding[]> {
        try {
            const tieBreakingConfig = await tieBreakingService.getTieBreakingConfig(seriesId, 'series');
            const hasManualResolutions = (tieBreakingConfig?.manualResolutions?.length ?? 0) > 0;

            if (hasManualResolutions || tieBreakingConfig?.autoResolveEnabled) {
                const conflictDetection = await tieBreakingService.detectSeriesConflicts(rawStandings);

                if (conflictDetection.hasConflicts || hasManualResolutions) {
                    const resolved = this.applySeriesTieBreaking(
                        rawStandings,
                        tieBreakingConfig?.rules ?? [],
                        tieBreakingConfig?.manualResolutions ?? [],
                        tieBreakingConfig?.autoResolveEnabled ?? false
                    );
                    this.logger.info(`Series tie-breaking applied for ${seriesId}`);
                    // Stable sort by total points — preserve manual/rule order within tied groups
                    return [...resolved].sort((a, b) => b.totalPoints - a.totalPoints);
                }
            }
        } catch (error) {
            this.logger.warn(`Tie-breaking failed for series ${seriesId}, using simple sort:`, error);
        }

        return sortSeriesStandingsForLeaderboard(rawStandings);
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
                return this.stripLegacySeriesFields(cached);
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
                currentMatchNumber: dbSeries.currentMatchNumber,
                isFinished: dbSeries.isFinished,
                winnerTeamName: dbSeries.winnerTeamName || undefined,
                finalStandings: (() => {
                    const val = dbSeries.finalStandings;
                    if (!val || val === '') return undefined;
                    try {
                        const parsed = JSON.parse(JSON.stringify(val)) as SeriesTeamStanding[];
                        return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
                    } catch { return undefined; }
                })(),
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
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
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
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
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
                    return Promise.all(
                        validCached
                            .sort((a, b) => a.matchOrder - b.matchOrder)
                            .map(async (match) => ({
                                ...match,
                                isCompleted: await this.matchHasResults(match.quickMatchId, userId),
                            }))
                    );
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
                completedAt: dbMatch.completedAt?.toISOString(),
                matchWeight: dbMatch.matchWeight,
                bonusPoints: dbMatch.bonusPoints,
                createdAt: dbMatch.createdAt.toISOString(),
                updatedAt: dbMatch.updatedAt.toISOString(),
                dbStatus: 'SYNCED' as const,
            }));

            const enriched = await Promise.all(
                result.map(async (match) => ({
                    ...match,
                    isCompleted: await this.matchHasResults(match.quickMatchId, userId),
                }))
            );

            // Warm the Redis set and individual caches from DB data
            for (const match of enriched) {
                await redis.hsetObject(`quick_series_match:${match.id}`, match, this.CACHE_TTL);
                await redis.sadd(`quick_series:${seriesId}:matches`, match.id);
            }

            return enriched;

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
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
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
            const resultsByMatch = await quickResultService.getResultsGroupedByMatch(
                allMatches.map((match) => match.quickMatchId)
            );
            const matchesWithResults = this.filterMatchesWithResults(allMatches, resultsByMatch);
            const standings = await this.calculateSeriesStandings(matchesWithResults, userId, {
                skipTieBreaking: true,
                resultsByMatch,
            });
            
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
            const tieBreakingConfig = await tieBreakingService.getTieBreakingConfig(seriesId, 'series');
            const autoResolveEnabled = tieBreakingConfig?.autoResolveEnabled ?? false;

            const conflictDetection = await tieBreakingService.detectSeriesConflicts(standings);

            if (!autoResolveEnabled && conflictDetection.conflictGroups.length > 0) {
                conflictDetection.conflictGroups = conflictDetection.conflictGroups.map((group) => ({
                    ...group,
                    requiresManualResolution: true,
                }));
                conflictDetection.manualResolutionRequired = conflictDetection.conflictGroups.length;
                conflictDetection.autoResolvableCount = 0;
            }
            
            this.logger.info(`Series conflict detection for ${seriesId}: ${conflictDetection.conflictGroups.length} conflicts found`);
            
            return conflictDetection;

        } catch (error) {
            this.handleError(error, 'Detect Series Conflicts');
            throw error;
        }
    }

    /**
     * Resolve a series points tie manually and rebuild the leaderboard.
     */
    async resolveSeriesConflicts(
        seriesId: string,
        userId: string,
        conflictGroupId: string,
        userDefinedOrder: string[],
        reason?: string
    ): Promise<{ success: boolean; resolvedTeams: string[] }> {
        const series = await this.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
        }

        const allMatches = await this.getSeriesMatches(seriesId, userId);
        const resultsByMatch = await quickResultService.getResultsGroupedByMatch(
            allMatches.map((match) => match.quickMatchId)
        );
        const matchesWithResults = this.filterMatchesWithResults(allMatches, resultsByMatch);
        const rawStandings = await this.calculateSeriesStandings(matchesWithResults, userId, {
            skipTieBreaking: true,
            resultsByMatch,
        });

        if (rawStandings.length === 0) {
            throw new ServiceError('No series standings to resolve', 400, 'NO_STANDINGS');
        }

        const conflictDetection = await tieBreakingService.detectSeriesConflicts(rawStandings);
        const conflictGroup = conflictDetection.conflictGroups.find(
            g => g.points.toString() === conflictGroupId
        );

        if (!conflictGroup) {
            throw new ServiceError('Conflict group not found', 400, 'CONFLICT_GROUP_NOT_FOUND');
        }

        const tiedTeamNames = conflictGroup.conflictedTeamNames ?? [];
        const normalizedOrder = userDefinedOrder.map(name => normalizeTeamName(name));
        const normalizedTied = new Set(tiedTeamNames.map(normalizeTeamName));

        if (normalizedOrder.length !== tiedTeamNames.length) {
            throw new ServiceError(
                'userDefinedOrder must include every team in the conflict group',
                400,
                'INVALID_ORDER'
            );
        }

        for (const teamName of normalizedOrder) {
            if (!normalizedTied.has(normalizeTeamName(teamName))) {
                throw new ServiceError(
                    `Team "${teamName}" is not part of this conflict group`,
                    400,
                    'INVALID_TEAM'
                );
            }
        }

        const manualResolution: ManualTieBreaking = {
            conflictGroupId,
            points: conflictGroup.points,
            userDefinedOrder: normalizedOrder,
            resolvedBy: userId,
            resolvedAt: new Date().toISOString(),
            reason,
        };

        const config = await tieBreakingService.getTieBreakingConfig(seriesId, 'series');
        const updatedConfig: TieBreakingConfig = {
            ...config!,
            seriesId,
            manualResolutions: [
                ...(config?.manualResolutions ?? []).filter(m => m.points !== conflictGroup.points),
                manualResolution,
            ],
        };

        await tieBreakingService.saveTieBreakingConfig(seriesId, 'series', updatedConfig);
        await this.updateSeriesLeaderboard(seriesId, userId);

        this.logger.info(`Manual series tie-breaking applied for ${seriesId}, conflict ${conflictGroupId}`);

        return {
            success: true,
            resolvedTeams: normalizedOrder,
        };
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
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
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
        rules: TieBreakingRule[],
        manualResolutions: ManualTieBreaking[] = [],
        autoResolveEnabled = true
    ): SeriesTeamStanding[] {
        try {
            const pointsGroups = new Map<number, SeriesTeamStanding[]>();

            for (const standing of standings) {
                const points = standing.totalPoints;
                if (!pointsGroups.has(points)) {
                    pointsGroups.set(points, []);
                }
                pointsGroups.get(points)!.push(standing);
            }

            const resolvedStandings: SeriesTeamStanding[] = [];
            const activeRules = rules.filter(rule => rule.isActive)
                .sort((a, b) => a.priority - b.priority);

            for (const [points, teamGroup] of pointsGroups) {
                if (teamGroup.length === 1) {
                    resolvedStandings.push(...teamGroup);
                    continue;
                }

                const manualResolution = manualResolutions.find(m => m.points === points);
                if (manualResolution) {
                    const ordered = tieBreakingService.applyManualSeriesTieBreaking(
                        {
                            points,
                            conflictedStandings: teamGroup,
                            requiresManualResolution: true,
                            conflictType: 'SERIES_POINTS',
                        },
                        manualResolution
                    );
                    resolvedStandings.push(...ordered);
                    continue;
                }

                if (!autoResolveEnabled) {
                    resolvedStandings.push(...teamGroup);
                    continue;
                }

                let sortedGroup = [...teamGroup];

                for (const rule of activeRules) {
                    sortedGroup = this.applySingleSeriesTieBreakingRule(sortedGroup, rule);

                    if (this.isSeriesConflictResolved(sortedGroup)) {
                        break;
                    }
                }

                resolvedStandings.push(...sortedGroup);
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
    private getSeriesWwcdCount(standing: SeriesTeamStanding): number {
        return standing.matchResults.filter((m) => m.position === 1).length;
    }

    private applySingleSeriesTieBreakingRule(
        standings: SeriesTeamStanding[],
        rule: TieBreakingRule
    ): SeriesTeamStanding[] {
        switch (rule.method) {
            case 'POSITION_POINTS':
                return [...standings].sort((a, b) => (b.positionPoints ?? 0) - (a.positionPoints ?? 0));

            case 'CHICKEN_DINNER':
                return [...standings].sort((a, b) => {
                    const aWwcd = this.getSeriesWwcdCount(a);
                    const bWwcd = this.getSeriesWwcdCount(b);
                    if ((aWwcd > 0) !== (bWwcd > 0)) {
                        return bWwcd > 0 ? 1 : -1;
                    }
                    return bWwcd - aWwcd;
                });

            case 'KILLS':
                return [...standings].sort((a, b) => b.totalKills - a.totalKills);

            case 'BEST_POSITION':
                return [...standings].sort((a, b) => a.bestPosition - b.bestPosition);

            case 'MANUAL_ORDER':
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
            const a = standings[i - 1];
            const b = standings[i];
            const stillTied =
                a.totalPoints === b.totalPoints &&
                (a.positionPoints ?? 0) === (b.positionPoints ?? 0) &&
                this.getSeriesWwcdCount(a) === this.getSeriesWwcdCount(b) &&
                (a.finishPoints ?? 0) === (b.finishPoints ?? 0) &&
                a.totalKills === b.totalKills &&
                a.bestPosition === b.bestPosition;
            if (stillTied) return false;
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

            const where: any = { userId };
            if (filters?.status) {
                where.status = filters.status;
            }

            const total = await this.db.quickTournamentSeries.count({ where });

            const dbSeries = await this.db.quickTournamentSeries.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    _count: {
                        select: {
                            seriesMatches: true,
                        },
                    },
                },
            });

            const series: QuickTournamentSeriesCache[] = dbSeries.map(row => ({
                id: row.id,
                seriesName: row.seriesName,
                game: row.game,
                totalMatches: row.totalMatches,
                matchesCompleted: row.matchesCompleted,
                status: row.status as QuickSeriesStatus,
                currentMatchNumber: row.currentMatchNumber,
                isFinished: row.isFinished,
                winnerTeamName: row.winnerTeamName || undefined,
                finalStandings: row.finalStandings
                    ? JSON.parse(JSON.stringify(row.finalStandings)) as SeriesTeamStanding[]
                    : undefined,
                userId: row.userId,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
                dbStatus: 'SYNCED',
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
            const series = await this.getTournamentSeriesById(seriesId, userId);
            if (!series) {
                throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
            }

            await this.db.quickTournamentSeries.delete({
                where: { id: seriesId },
            });

            await redis.delete(`quick_series:${seriesId}`);
            await redis.srem(`user:${userId}:quick_series`, seriesId);
            await redis.delete(`quick_series_leaderboard:${seriesId}`);
            await redis.delete(`tie_breaking_config:series:${seriesId}`);

            const seriesMatchIds = await redis.smembers(`quick_series:${seriesId}:matches`);
            for (const matchId of seriesMatchIds) {
                const cached = await redis.hgetObject<QuickSeriesMatchCache>(`quick_series_match:${matchId}`);
                if (cached?.quickMatchId) {
                    await redis.delete(`quickMatch:${cached.quickMatchId}:seriesId`);
                }
                await redis.delete(`quick_series_match:${matchId}`);
            }
            await redis.delete(`quick_series:${seriesId}:matches`);

            this.logger.info(`Tournament Series ${seriesId} deleted by user ${userId}`);
        } catch (error) {
            this.handleError(error, 'Delete Tournament Series');
            throw error;
        }
    }

    /**
     * Find series that contains a specific match (Redis index first, then DB)
     */
    async getAllSeriesForMatch(quickMatchId: string, userId: string): Promise<QuickTournamentSeriesCache[]> {
        try {
            const seriesMatches = await this.db.quickSeriesMatch.findMany({
                where: { quickMatchId },
                include: { series: true },
            });

            const userSeriesMatches = seriesMatches.filter(sm => sm.series.userId === userId);
            if (userSeriesMatches.length === 0) return [];

            const results = await Promise.all(
                userSeriesMatches.map(sm => this.getTournamentSeriesById(sm.seriesId, userId))
            );

            return results.filter(Boolean) as QuickTournamentSeriesCache[];
        } catch (error) {
            this.handleError(error, 'Get All Series for Match');
            return [];
        }
    }

    private async matchHasResults(quickMatchId: string, _userId: string): Promise<boolean> {
        const count = await this.db.quickMatchResult.count({ where: { quickMatchId } });
        return count > 0;
    }

    private filterMatchesWithResults(
        seriesMatches: QuickSeriesMatchCache[],
        resultsByMatch: Map<string, QuickMatchResultCache[]>
    ): QuickSeriesMatchCache[] {
        return seriesMatches.filter(
            (match) => (resultsByMatch.get(match.quickMatchId)?.length ?? 0) > 0
        );
    }

    private async validateMatchSlotListForSeries(
        _seriesId: string,
        _quickMatchId: string,
        _userId: string
    ): Promise<void> {
        // No slot/team list restrictions — matches with any slot configuration
        // can be combined in a series. Aggregation handles missing teams gracefully.
    }

    /** Drop removed scoring fields from older Redis cache entries */
    private stripLegacySeriesFields(series: QuickTournamentSeriesCache): QuickTournamentSeriesCache {
        const legacy = series as QuickTournamentSeriesCache & {
            positionPointsConfig?: unknown;
            killPointsValue?: unknown;
            scoringDescription?: unknown;
        };
        const {
            positionPointsConfig: _positionPointsConfig,
            killPointsValue: _killPointsValue,
            scoringDescription: _scoringDescription,
            ...clean
        } = legacy;

        if(!Array.isArray(clean.finalStandings)){
            clean.finalStandings = undefined;
        }

        return clean;
    }
}

export const quickSeriesService = new QuickSeriesService();