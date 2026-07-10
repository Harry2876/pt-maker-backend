import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import {
    TieBreakingRule,
    ConflictGroup,
    ManualTieBreaking,
    TieBreakingConfig,
    ConflictDetectionResult,
    TieBreakingResult,
    SeriesConflictGroup,
    SeriesTieBreakingResult,
    EnhancedMatchResult
} from '../types/tieBreaking';
import { normalizeTeamName } from '../utils/seriesSlotUtils';
import { QuickMatchResultCache } from '../types/quickResult';
import { SeriesTeamStanding } from '../types/quickSeries';

export class TieBreakingService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Detect points conflicts in match results
     */
    async detectMatchConflicts(
        results: QuickMatchResultCache[]
    ): Promise<ConflictDetectionResult> {
        try {
            const conflictGroups: ConflictGroup[] = [];
            
            // Group teams by total points
            const pointsGroups = new Map<number, QuickMatchResultCache[]>();
            
            for (const result of results) {
                const points = result.totalPoints;
                if (!pointsGroups.has(points)) {
                    pointsGroups.set(points, []);
                }
                pointsGroups.get(points)!.push(result);
            }

            // Identify conflicts (groups with more than 1 team)
            let autoResolvableCount = 0;
            let manualResolutionRequired = 0;
            let totalConflictedTeams = 0;

            for (const [points, teams] of pointsGroups) {
                if (teams.length > 1) {
                    const canAutoResolve = this.canAutoResolveConflict(teams);
                    
                    const conflictGroup: ConflictGroup = {
                        points,
                        conflictedTeams: teams,
                        requiresManualResolution: !canAutoResolve,
                        conflictType: 'TOTAL_POINTS'
                    };

                    conflictGroups.push(conflictGroup);
                    totalConflictedTeams += teams.length;

                    if (canAutoResolve) {
                        autoResolvableCount++;
                    } else {
                        manualResolutionRequired++;
                    }
                }
            }

            return {
                hasConflicts: conflictGroups.length > 0,
                conflictGroups,
                totalConflictedTeams,
                autoResolvableCount,
                manualResolutionRequired
            };

        } catch (error) {
            this.handleError(error, 'Detect Match Conflicts');
            throw error;
        }
    }

    /**
     * Detect conflicts in series standings
     */
    async detectSeriesConflicts(
        standings: SeriesTeamStanding[]
    ): Promise<ConflictDetectionResult> {
        try {
            const conflictGroups: SeriesConflictGroup[] = [];
            
            // Group teams by total points
            const pointsGroups = new Map<string, SeriesTeamStanding[]>();
            
            for (const standing of standings) {
                // Only teams identical on ALL three sort fields are truly tied
                const tieKey = `${standing.totalPoints}|${standing.positionPoints ?? 0}|${standing.finishPoints ?? 0}`;
                if (!pointsGroups.has(tieKey)) {
                    pointsGroups.set(tieKey, []);
                }
                pointsGroups.get(tieKey)!.push(standing);
            }

            // Identify conflicts
            let autoResolvableCount = 0;
            let manualResolutionRequired = 0;
            let totalConflictedTeams = 0;

            for (const [, teams] of pointsGroups) {
                if (teams.length > 1) {
                    const canAutoResolve = this.canAutoResolveSeriesConflict(teams);
                    
                    const conflictGroup: SeriesConflictGroup = {
                        points: teams[0].totalPoints,
                        conflictedStandings: teams,
                        requiresManualResolution: !canAutoResolve
                    };

                    conflictGroups.push(conflictGroup);
                    totalConflictedTeams += teams.length;

                    if (canAutoResolve) {
                        autoResolvableCount++;
                    } else {
                        manualResolutionRequired++;
                    }
                }
            }

            return {
                hasConflicts: conflictGroups.length > 0,
                conflictGroups: conflictGroups.map(group => ({
                    points: group.points,
                    conflictedTeamNames: group.conflictedStandings.map(s => s.teamName),
                    conflictedStandings: group.conflictedStandings,
                    requiresManualResolution: group.requiresManualResolution,
                    conflictType: 'SERIES_POINTS' as const
                })),
                totalConflictedTeams,
                autoResolvableCount,
                manualResolutionRequired
            };

        } catch (error) {
            this.handleError(error, 'Detect Series Conflicts');
            throw error;
        }
    }

    /**
     * Apply automatic tie-breaking rules
     */
    async applyAutomaticTieBreaking(
        conflictGroups: ConflictGroup[],
        rules: TieBreakingRule[]
    ): Promise<TieBreakingResult> {
        try {
            const activeRules = rules.filter(rule => rule.isActive)
                .sort((a, b) => a.priority - b.priority);

            let resolvedResults: QuickMatchResultCache[] = [];
            let appliedRules: any[] = [];
            let autoResolved = 0;
            let remainingConflicts = 0;

            for (const conflictGroup of conflictGroups) {
                const teams = conflictGroup.conflictedTeams ?? [];
                if (conflictGroup.requiresManualResolution) {
                    // Can't auto-resolve, keep original order
                    resolvedResults.push(...teams);
                    remainingConflicts++;
                    continue;
                }

                let resolved = false;
                for (const rule of activeRules) {
                    const sortedTeams = this.applySingleTieBreakingRule(
                        teams,
                        rule
                    );

                    if (this.isConflictResolved(sortedTeams)) {
                        resolvedResults.push(...sortedTeams);
                        appliedRules.push({
                            ruleId: rule.priority,
                            method: rule.method,
                            teamsAffected: sortedTeams.map(t => t.teamName)
                        });
                        resolved = true;
                        autoResolved++;
                        break;
                    }
                }

                if (!resolved) {
                    resolvedResults.push(...teams);
                    remainingConflicts++;
                }
            }

            return {
                originalResults: conflictGroups.flatMap(g => g.conflictedTeams ?? []),
                resolvedResults,
                appliedRules,
                manualResolutions: [],
                summary: {
                    totalTeams: resolvedResults.length,
                    conflictsDetected: conflictGroups.length,
                    autoResolved,
                    manuallyResolved: 0,
                    remainingConflicts
                }
            };

        } catch (error) {
            this.handleError(error, 'Apply Automatic Tie Breaking');
            throw error;
        }
    }

    /**
     * Order series standings within a tied group using a manual resolution.
     */
    applyManualSeriesTieBreaking(
        conflictGroup: ConflictGroup,
        manualResolution: ManualTieBreaking
    ): SeriesTeamStanding[] {
        const standings = conflictGroup.conflictedStandings ?? [];
        const ordered: SeriesTeamStanding[] = [];

        for (const teamName of manualResolution.userDefinedOrder) {
            const standing = standings.find(s =>
                normalizeTeamName(s.teamName) === normalizeTeamName(teamName)
            );
            if (standing) {
                ordered.push(standing);
            }
        }

        for (const standing of standings) {
            if (!ordered.some(s => normalizeTeamName(s.teamName) === normalizeTeamName(standing.teamName))) {
                ordered.push(standing);
            }
        }

        return ordered;
    }

    /**
     * Apply manual tie-breaking resolution
     */
    async applyManualTieBreaking(
        conflictGroup: ConflictGroup,
        manualResolution: ManualTieBreaking
    ): Promise<QuickMatchResultCache[]> {
        try {
            const { userDefinedOrder } = manualResolution;
            const teams = conflictGroup.conflictedTeams ?? [];
            const orderedResults: QuickMatchResultCache[] = [];

            // Sort teams according to user-defined order
            for (const teamName of userDefinedOrder) {
                const team = teams.find(t => t.teamName === teamName);
                if (team) {
                    orderedResults.push(team);
                }
            }

            // Add any missing teams at the end (safety check)
            for (const team of teams) {
                if (!orderedResults.find(r => r.teamName === team.teamName)) {
                    orderedResults.push(team);
                }
            }

            // Store manual resolution in cache
            const cacheKey = `manual_tie_breaking:${conflictGroup.points}`;
            await redis.hsetObject(cacheKey, manualResolution, this.CACHE_TTL);

            this.logger.info(`Manual tie-breaking applied for ${conflictGroup.points} points: ${userDefinedOrder.join(', ')}`);

            return orderedResults;

        } catch (error) {
            this.handleError(error, 'Apply Manual Tie Breaking');
            throw error;
        }
    }

    /**
     * Generate enhanced results for Python API with tie-breaking info
     */
    async generateEnhancedResults(
        originalResults: QuickMatchResultCache[],
        tieBreakingResult: TieBreakingResult
    ): Promise<EnhancedMatchResult[]> {
        try {
            const enhancedResults: EnhancedMatchResult[] = [];

            for (let i = 0; i < tieBreakingResult.resolvedResults.length; i++) {
                const result = tieBreakingResult.resolvedResults[i];
                const originalIndex = originalResults.findIndex(r => r.id === result.id);
                
                const enhanced: EnhancedMatchResult = {
                    ...result,
                    finalPosition: i + 1, // Position after tie-breaking
                    originalPosition: originalIndex + 1, // Position before tie-breaking
                    tieBreakingApplied: originalIndex !== i,
                    tieBreakingMethod: this.getTieBreakingMethodForTeam(result.teamName, tieBreakingResult),
                    tieBreakingReason: this.getTieBreakingReasonForTeam(result.teamName, tieBreakingResult)
                };

                enhancedResults.push(enhanced);
            }

            return enhancedResults;

        } catch (error) {
            this.handleError(error, 'Generate Enhanced Results');
            throw error;
        }
    }

    /**
     * Save tie-breaking configuration
     */
    async saveTieBreakingConfig(
        entityId: string,
        entityType: 'match' | 'series',
        config: TieBreakingConfig
    ): Promise<void> {
        try {
            const cacheKey = `tie_breaking_config:${entityType}:${entityId}`;
            await redis.hsetObject(cacheKey, config, this.CACHE_TTL * 24); // 24 hour cache

            this.logger.info(`Tie-breaking config saved for ${entityType} ${entityId}`);

        } catch (error) {
            this.handleError(error, 'Save Tie Breaking Config');
            throw error;
        }
    }

    /**
     * Get tie-breaking configuration
     */
    async getTieBreakingConfig(
        entityId: string,
        entityType: 'match' | 'series'
    ): Promise<TieBreakingConfig | null> {
        try {
            const cacheKey = `tie_breaking_config:${entityType}:${entityId}`;
            const config = await redis.hgetObject<TieBreakingConfig>(cacheKey);

            return config || this.getDefaultTieBreakingConfig();

        } catch (error) {
            this.handleError(error, 'Get Tie Breaking Config');
            return this.getDefaultTieBreakingConfig();
        }
    }

    // Private helper methods
    private hasMatchWwcd(result: QuickMatchResultCache): boolean {
        return (result.rank ?? result.position) === 1;
    }

    private getSeriesWwcdCount(standing: SeriesTeamStanding): number {
        return standing.matchResults.filter((m) => m.position === 1).length;
    }

    private canAutoResolveConflict(teams: QuickMatchResultCache[]): boolean {
        const positionPoints = new Set(teams.map((t) => t.positionPoints));
        if (positionPoints.size > 1) return true;

        const wwcdFlags = new Set(teams.map((t) => this.hasMatchWwcd(t)));
        if (wwcdFlags.size > 1) return true;

        const killCounts = new Set(teams.map((t) => t.totalKills));
        if (killCounts.size > 1) return true;

        const positions = new Set(teams.map((t) => t.position));
        return positions.size > 1;
    }

    private canAutoResolveSeriesConflict(standings: SeriesTeamStanding[]): boolean {
        const positionPoints = new Set(standings.map((s) => s.positionPoints ?? 0));
        if (positionPoints.size > 1) return true;

        const wwcdCounts = new Set(standings.map((s) => this.getSeriesWwcdCount(s)));
        if (wwcdCounts.size > 1) return true;

        const killCounts = new Set(standings.map((s) => s.totalKills));
        if (killCounts.size > 1) return true;

        const bestPositions = new Set(standings.map((s) => s.bestPosition));
        return bestPositions.size > 1;
    }

    private applySingleTieBreakingRule(
        teams: QuickMatchResultCache[],
        rule: TieBreakingRule
    ): QuickMatchResultCache[] {
        switch (rule.method) {
            case 'POSITION_POINTS':
                return [...teams].sort((a, b) => b.positionPoints - a.positionPoints);

            case 'CHICKEN_DINNER':
                return [...teams].sort((a, b) => {
                    const aWwcd = this.hasMatchWwcd(a) ? 1 : 0;
                    const bWwcd = this.hasMatchWwcd(b) ? 1 : 0;
                    return bWwcd - aWwcd;
                });

            case 'KILLS':
                return [...teams].sort((a, b) => b.totalKills - a.totalKills);

            case 'BEST_POSITION':
                return [...teams].sort((a, b) => a.position - b.position);

            case 'MANUAL_ORDER':
                return teams;

            default:
                return teams;
        }
    }

    private isConflictResolved(teams: QuickMatchResultCache[]): boolean {
        for (let i = 1; i < teams.length; i++) {
            const a = teams[i - 1];
            const b = teams[i];
            const stillTied =
                a.positionPoints === b.positionPoints &&
                this.hasMatchWwcd(a) === this.hasMatchWwcd(b) &&
                a.totalKills === b.totalKills &&
                a.position === b.position;
            if (stillTied) return false;
        }
        return true;
    }

    private getTieBreakingMethodForTeam(
        teamName: string,
        result: TieBreakingResult
    ): string | undefined {
        const appliedRule = result.appliedRules.find(rule => 
            rule.teamsAffected.includes(teamName)
        );
        return appliedRule?.method;
    }

    private getTieBreakingReasonForTeam(
        teamName: string,
        result: TieBreakingResult
    ): string | undefined {
        const manualResolution = result.manualResolutions.find(resolution => 
            resolution.userDefinedOrder.includes(teamName)
        );
        return manualResolution?.reason;
    }

    private getDefaultTieBreakingConfig(): TieBreakingConfig {
        return {
            rules: [
                {
                    priority: 1,
                    method: 'POSITION_POINTS',
                    isActive: true,
                    description: 'Higher position points wins',
                },
                {
                    priority: 2,
                    method: 'CHICKEN_DINNER',
                    isActive: true,
                    description: 'Team with chicken dinner wins',
                },
                {
                    priority: 3,
                    method: 'KILLS',
                    isActive: true,
                    description: 'Higher kills wins',
                },
            ],
            manualResolutions: [],
            autoResolveEnabled: true,
        };
    }
}

export const tieBreakingService = new TieBreakingService();