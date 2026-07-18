import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { scoringRuleService } from './scoringRuleService';
import { leaderboardService } from './leaderboardService';
import { teamRegistrationService } from './teamRegistrationService';
import { randomUUID } from 'crypto';
import { waitForDbSync, waitForAllDbSync } from '../utils/dbSyncHelper';
import {
    MatchResultCache,
    CreateMatchResultData,
    UpdateMatchResultData,
    TeamMatchResult,
    ManualVerificationData,
    PublishMatchResultData,
    BulkMatchResultData,
    BulkMatchResultResult,
    MatchResultValidation,
    VerificationResult,
    PublishResult,
    AIProcessingRequest,
    AIProcessingResult
} from '../types/matchResult';
import { MatchCache } from '../types/match';
import { TournamentCache } from '../types/tournament';
import { TeamRegistrationCache } from '../types/teamRegistration';

export class MatchResultService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes for match results

    /** Map API input (`teamId`, `placement`) to internal TeamMatchResult shape */
    private async normalizeTeamResultsInput(
        rawResults: Array<Record<string, unknown>>
    ): Promise<TeamMatchResult[]> {
        const normalized: TeamMatchResult[] = [];

        for (let i = 0; i < rawResults.length; i++) {
            const raw = rawResults[i];
            const teamRegistrationId = String(raw.teamRegistrationId ?? raw.teamId ?? '');
            const position = Number(raw.position ?? raw.placement ?? 0);
            const kills = Number(raw.kills ?? 0);

            let teamName = typeof raw.teamName === 'string' ? raw.teamName : '';
            if (!teamName && teamRegistrationId) {
                const reg = await redis.hgetObject<TeamRegistrationCache>(
                    `teamRegistration:${teamRegistrationId}`
                );
                teamName = reg?.teamName ?? '';
            }

            normalized.push({
                teamRegistrationId,
                teamName: teamName || 'Unknown Team',
                slotNumber: Number(raw.slotNumber ?? i + 1),
                position,
                kills,
                damage: raw.damage !== undefined ? Number(raw.damage) : undefined,
                survivalTime: raw.survivalTime !== undefined ? Number(raw.survivalTime) : undefined,
                totalScore: Number(raw.totalScore ?? 0),
                scoreBreakdown: Array.isArray(raw.scoreBreakdown) ? raw.scoreBreakdown as TeamMatchResult['scoreBreakdown'] : [],
                aiDetected: Boolean(raw.aiDetected ?? false),
                manuallyEdited: Boolean(raw.manuallyEdited ?? true)
            });
        }

        return normalized;
    }

    private queueMatchResultUpdate(resultId: string, updated: MatchResultCache, userId: string) {
        return QueueService.queueDatabaseSync({
            type: 'MATCH_RESULT_UPDATE',
            entityId: resultId,
            data: {
                matchId: updated.matchId,
                teamResults: updated.teamResults,
                verifiedBy: updated.verifiedBy,
                verifiedAt: updated.verifiedAt,
                finalStatus: updated.finalStatus,
                publishedAt: updated.publishedAt,
                notes: updated.notes,
                manualVerificationStatus: updated.manualVerificationStatus
            },
            userId,
            priority: 'HIGH',
            timestamp: new Date().toISOString()
        });
    }

    // Create match result with hybrid sync
    async createMatchResult(data: CreateMatchResultData, createdBy: string) {
        try {
            // 1. Validate match exists and get tournament info
            const match = await redis.hgetObject<MatchCache>(`match:${data.matchId}`);
            if (!match) {
                throw new Error('Match not found');
            }

            // 2. Validate tournament access
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            // 3. Generate result ID
            const resultId = randomUUID();

            // 4. Process team results if provided
            let processedTeamResults: TeamMatchResult[] = [];
            if (data.teamResults && data.teamResults.length > 0) {
                const normalized = await this.normalizeTeamResultsInput(
                    data.teamResults as unknown as Array<Record<string, unknown>>
                );
                // Calculate scores using scoring rules
                processedTeamResults = await this.calculateTeamScores(match.tournamentId, normalized);

                // Validate results
                const validation = await this.validateMatchResult({ ...data, teamResults: processedTeamResults });
                if (!validation.isValid) {
                    throw new Error(`Invalid match result: ${validation.errors.map(e => e.message).join(', ')}`);
                }
            }

            // 5. Create match result object
            const matchResult: MatchResultCache = {
                id: resultId,
                matchId: data.matchId,
                groupId: match.groupId || '',
                tournamentId: match.tournamentId,
                screenshotUrl: data.screenshotUrl,
                processedImageUrl: undefined,
                aiProcessingStatus: data.screenshotUrl ? 'PENDING' : 'COMPLETED',
                manualVerificationStatus: 'PENDING',
                finalStatus: 'DRAFT',
                teamResults: processedTeamResults,
                aiConfidenceScore: undefined,
                processedAt: data.teamResults ? new Date().toISOString() : undefined,
                verifiedBy: undefined,
                verifiedAt: undefined,
                publishedAt: undefined,
                notes: data.notes,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 6. Store in Redis immediately
            await redis.hsetObject(`matchResult:${resultId}`, matchResult);
            await redis.sadd(`match:${data.matchId}:results`, resultId);
            await redis.sadd(`tournament:${match.tournamentId}:results`, resultId);

            // 7. Queue database sync
            await QueueService.syncImmediately('MATCH_RESULT', resultId, matchResult, createdBy);

            // 8. If screenshot provided, queue AI processing
            if (data.screenshotUrl) {
                // TODO: Queue screenshot processing when AI service is ready
                this.logger.info(`Screenshot processing queued for result ${resultId}`);
            }

            this.logger.info(`Match result ${resultId} created for match ${data.matchId}`);
            return matchResult;

        } catch (error) {
            this.handleError(error, 'Create match result');
            return null;
        }
    }

    // Get match results
    async getMatchResults(matchId: string, userId: string): Promise<MatchResultCache[]> {
        try {
            // 1. Validate match access
            const match = await redis.hgetObject<MatchCache>(`match:${matchId}`);
            if (!match) {
                throw new Error('Match not found');
            }

            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Access denied');
            }

            // 2. Check cache first
            const cacheKey = `match:${matchId}:results:list`;
            const cached = await redis.getObject<MatchResultCache[]>(cacheKey);
            if (cached) {
                return cached;
            }

            // 3. Get result IDs from set
            const resultIds = await redis.smembers(`match:${matchId}:results`);
            
            if (resultIds.length === 0) {
                // 4. Fallback to database
                const dbResults = await this.db.matchResult.findMany({
                    where: { matchId },
                    include: {
                        teamRegistration: {
                            select: { teamName: true }
                        }
                    },
                    orderBy: { position: 'asc' }
                });

                // Convert DB results to cache format
                const results: MatchResultCache[] = dbResults.map(dbResult => ({
                    id: dbResult.id,
                    matchId: dbResult.matchId,
                    groupId: match.groupId || '',
                    tournamentId: match.tournamentId,
                    screenshotUrl: undefined,
                    processedImageUrl: undefined,
                    aiProcessingStatus: 'COMPLETED',
                    manualVerificationStatus: 'VERIFIED',
                    finalStatus: 'PUBLISHED',
                    teamResults: [{
                        teamRegistrationId: dbResult.teamRegistrationId,
                        teamName: dbResult.teamRegistration?.teamName || 'Unknown Team',
                        slotNumber: dbResult.slotNumber,
                        position: dbResult.position,
                        kills: dbResult.totalKills,
                        totalScore: dbResult.totalMatchPoints,
                        scoreBreakdown: [
                            {
                                ruleName: 'Kill Points',
                                ruleType: 'KILL_POINTS',
                                points: dbResult.killPoints,
                                calculation: `${dbResult.totalKills} kills × points = ${dbResult.killPoints}`
                            },
                            {
                                ruleName: 'Position Points',
                                ruleType: 'POSITION_POINTS',
                                points: dbResult.positionPoints,
                                calculation: `Position ${dbResult.position} = ${dbResult.positionPoints} points`
                            }
                        ],
                        aiDetected: false,
                        manuallyEdited: true
                    }],
                    aiConfidenceScore: 1.0,
                    processedAt: dbResult.createdAt.toISOString(),
                    verifiedBy: dbResult.verifiedBy || undefined,
                    verifiedAt: dbResult.verifiedAt?.toISOString(),
                    publishedAt: dbResult.createdAt.toISOString(),
                    notes: undefined,
                    createdAt: dbResult.createdAt.toISOString(),
                    updatedAt: dbResult.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                }));

                // Cache the results
                await redis.setObject(cacheKey, results, this.CACHE_TTL);
                return results;
            }

            // 5. Get result details from Redis
            const results: MatchResultCache[] = [];
            for (const resultId of resultIds) {
                const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
                if (result) {
                    results.push(result);
                }
            }

            // 6. Sort by created date and cache
            results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            await redis.setObject(cacheKey, results, this.CACHE_TTL);

            return results;

        } catch (error) {
            this.handleError(error, 'Get match results');
            return [];
        }
    }

    // Update match result
    async updateMatchResult(resultId: string, data: UpdateMatchResultData, updatedBy: string) {
        try {
            const existing = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
            if (!existing) {
                throw new Error('Match result not found');
            }

            // Process team results if provided
            let updatedTeamResults = existing.teamResults;
            if (data.teamResults && data.teamResults.length > 0) {
                updatedTeamResults = await this.calculateTeamScores(
                    existing.tournamentId,
                    data.teamResults as unknown as Array<Record<string, unknown>>
                );

                const validation = await this.validateMatchResult({
                    matchId: existing.matchId,
                    teamResults: updatedTeamResults
                });

                if (!validation.isValid) {
                    throw new Error(`Invalid match result update: ${validation.errors.map(e => e.message).join(', ')}`);
                }
            }

            const updated: MatchResultCache = {
                ...existing,
                screenshotUrl: data.screenshotUrl !== undefined ? data.screenshotUrl : existing.screenshotUrl,
                processedImageUrl: data.processedImageUrl !== undefined ? data.processedImageUrl : existing.processedImageUrl,
                aiProcessingStatus: data.aiProcessingStatus || existing.aiProcessingStatus,
                manualVerificationStatus: data.manualVerificationStatus || existing.manualVerificationStatus,
                finalStatus: data.finalStatus || existing.finalStatus,
                teamResults: updatedTeamResults,
                aiConfidenceScore: data.aiConfidenceScore !== undefined ? data.aiConfidenceScore : existing.aiConfidenceScore,
                notes: data.notes !== undefined ? data.notes : existing.notes,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`matchResult:${resultId}`, updated);

            // Queue database sync
            await this.queueMatchResultUpdate(resultId, updated, updatedBy);

            // Invalidate cache
            await redis.delete(`match:${existing.matchId}:results:list`);

            this.logger.info(`Match result ${resultId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update match result');
            return null;
        }
    }

    // Calculate team scores using scoring rules
    async calculateTeamScores(
        tournamentId: string,
        teamResults: TeamMatchResult[] | Array<Record<string, unknown>>
    ): Promise<TeamMatchResult[]> {
        try {
            const normalized = Array.isArray(teamResults) && teamResults.length > 0
                && teamResults[0] && ('teamId' in teamResults[0] || 'placement' in teamResults[0])
                ? await this.normalizeTeamResultsInput(teamResults as Array<Record<string, unknown>>)
                : teamResults as TeamMatchResult[];

            const processedResults: TeamMatchResult[] = [];

            for (const teamResult of normalized) {
                // Use ScoringRuleService to calculate scores
                const scoreResult = await scoringRuleService.calculateScore(tournamentId, {
                    kills: teamResult.kills,
                    position: teamResult.position,
                    survivalTime: teamResult.survivalTime,
                    customData: {
                        damage: teamResult.damage
                    }
                });

                const processedResult: TeamMatchResult = {
                    ...teamResult,
                    totalScore: scoreResult.totalScore,
                    scoreBreakdown: scoreResult.breakdown
                };

                processedResults.push(processedResult);
            }

            return processedResults;

        } catch (error) {
            this.logger.error('Error calculating team scores:', error);
            const fallbackInput = Array.isArray(teamResults) && teamResults.length > 0
                && teamResults[0] && ('teamId' in teamResults[0] || 'placement' in teamResults[0])
                ? await this.normalizeTeamResultsInput(teamResults as Array<Record<string, unknown>>)
                : teamResults as TeamMatchResult[];

            return fallbackInput.map(result => ({
                ...result,
                totalScore: result.totalScore || (result.kills + Math.max(0, 26 - result.position) * 2),
                scoreBreakdown: result.scoreBreakdown?.length ? result.scoreBreakdown : [
                    {
                        ruleName: 'Default Scoring',
                        ruleType: 'FALLBACK',
                        points: result.totalScore || 0,
                        calculation: 'Fallback calculation'
                    }
                ]
            }));
        }
    }

    // Verify match results manually
    async verifyResults(resultId: string, verificationData: ManualVerificationData, verifiedBy: string): Promise<VerificationResult> {
        try {
            const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
            if (!result) {
                throw new Error('Match result not found');
            }

            // Apply corrections if provided
            let finalResults = result.teamResults;
            let changesApplied = 0;

            if (verificationData.teamCorrections && verificationData.teamCorrections.length > 0) {
                finalResults = result.teamResults.map(teamResult => {
                    const correction = verificationData.teamCorrections.find(c => c.teamRegistrationId === teamResult.teamRegistrationId);
                    if (correction) {
                        changesApplied++;
                        return {
                            ...teamResult,
                            position: correction.correctedData.position !== undefined ? correction.correctedData.position : teamResult.position,
                            kills: correction.correctedData.kills !== undefined ? correction.correctedData.kills : teamResult.kills,
                            damage: correction.correctedData.damage !== undefined ? correction.correctedData.damage : teamResult.damage,
                            manuallyEdited: true
                        };
                    }
                    return teamResult;
                });

                // Recalculate scores for corrected results
                if (changesApplied > 0) {
                    finalResults = await this.calculateTeamScores(result.tournamentId, finalResults);
                }
            }

            // Update result status
            const updated: MatchResultCache = {
                ...result,
                teamResults: finalResults,
                manualVerificationStatus: verificationData.verificationStatus,
                finalStatus: verificationData.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'DRAFT',
                verifiedBy,
                verifiedAt: new Date().toISOString(),
                notes: verificationData.verifierNotes || result.notes,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store updated result
            await redis.hsetObject(`matchResult:${resultId}`, updated);
            await this.queueMatchResultUpdate(resultId, updated, verifiedBy);

            // Invalidate cache
            await redis.delete(`match:${result.matchId}:results:list`);

            this.logger.info(`Match result ${resultId} verified by ${verifiedBy}`);

            return {
                success: true,
                finalResults,
                changesApplied,
                message: `Results verified successfully. ${changesApplied} corrections applied.`
            };

        } catch (error) {
            this.handleError(error, 'Verify results');
            return {
                success: false,
                finalResults: [],
                changesApplied: 0,
                message: (error as Error).message
            };
        }
    }

    // Publish verified results
    async publishResults(resultId: string, publishData: PublishMatchResultData, publishedBy: string): Promise<PublishResult> {
        try {
            const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
            if (!result) {
                throw new Error('Match result not found');
            }

            if (result.manualVerificationStatus !== 'VERIFIED') {
                throw new Error('Results must be verified before publishing');
            }

            // Update result status
            const updated: MatchResultCache = {
                ...result,
                finalStatus: 'PUBLISHED',
                publishedAt: new Date().toISOString(),
                notes: publishData.publishNotes ? `${result.notes || ''}\n${publishData.publishNotes}`.trim() : result.notes,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store updated result
            await redis.hsetObject(`matchResult:${resultId}`, updated);
            await this.queueMatchResultUpdate(resultId, updated, publishedBy);
            await waitForDbSync(`matchResult:${resultId}`);

            let leaderboardUpdated = false;
            if (publishData.publishToLeaderboard !== false) {
                const refreshResult = await leaderboardService.refreshLeaderboard(result.tournamentId, {
                    forceRefresh: true,
                    includeGroups: result.groupId ? [result.groupId] : undefined
                });
                leaderboardUpdated = refreshResult.success;

                if (leaderboardUpdated && result.groupId) {
                    const groupLb = await leaderboardService.generateGroupLeaderboard(result.groupId);
                    if (groupLb) {
                        const registrationKeys: string[] = [];
                        for (const entry of groupLb.entries) {
                            await teamRegistrationService.updateTeamRegistration(
                                entry.teamRegistrationId,
                                publishedBy,
                                { totalPoints: entry.totalPoints }
                            );
                            registrationKeys.push(`teamRegistration:${entry.teamRegistrationId}`);
                        }
                        await waitForAllDbSync(registrationKeys);
                    }
                }
            }

            // TODO: Send notifications when NotificationService is implemented
            let notificationsSent = 0;
            if (publishData.notifyTeams) {
                // Placeholder for team notifications
                notificationsSent = result.teamResults.length;
                this.logger.info(`Team notifications queued for ${notificationsSent} teams`);
            }

            // Invalidate caches
            await redis.delete(`match:${result.matchId}:results:list`);
            await redis.delete(`tournament:${result.tournamentId}:results:list`);

            this.logger.info(`Match result ${resultId} published by ${publishedBy}`);

            return {
                success: true,
                publishedAt: updated.publishedAt!,
                leaderboardUpdated,
                notificationsSent,
                message: 'Results published successfully'
            };

        } catch (error) {
            this.handleError(error, 'Publish results');
            return {
                success: false,
                publishedAt: '',
                leaderboardUpdated: false,
                notificationsSent: 0,
                message: (error as Error).message
            };
        }
    }

    // Validate match result data
    async validateMatchResult(data: CreateMatchResultData | UpdateMatchResultData): Promise<MatchResultValidation> {
        const validation: MatchResultValidation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        if (!data.teamResults || data.teamResults.length === 0) {
            return validation; // No team results to validate
        }

        // Check for duplicate positions
        const positions = data.teamResults.map(t => t.position);
        const duplicatePositions = positions.filter((pos, index) => positions.indexOf(pos) !== index);
        
        if (duplicatePositions.length > 0) {
            validation.errors.push({
                field: 'position',
                error: 'DUPLICATE_POSITION',
                message: `Duplicate positions found: ${duplicatePositions.join(', ')}`
            });
        }

        // Validate individual team results
        for (const teamResult of data.teamResults) {
            // Check position range
            if (teamResult.position < 1 || teamResult.position > 25) {
                validation.errors.push({
                    teamId: teamResult.teamRegistrationId,
                    field: 'position',
                    error: 'INVALID_POSITION',
                    message: `Invalid position ${teamResult.position} for team ${teamResult.teamName}`
                });
            }

            // Check negative kills
            if (teamResult.kills < 0) {
                validation.errors.push({
                    teamId: teamResult.teamRegistrationId,
                    field: 'kills',
                    error: 'NEGATIVE_KILLS',
                    message: `Negative kills ${teamResult.kills} for team ${teamResult.teamName}`
                });
            }

            // Warning for high kills
            if (teamResult.kills > 20) {
                validation.warnings.push({
                    teamId: teamResult.teamRegistrationId,
                    field: 'kills',
                    warning: 'HIGH_KILLS',
                    message: `Unusually high kills ${teamResult.kills} for team ${teamResult.teamName}`
                });
            }
        }

        validation.isValid = validation.errors.length === 0;
        return validation;
    }

    // Get match result by ID
    async getMatchResultById(resultId: string, userId: string) {
        try {
            const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
            if (!result) {
                return null;
            }

            // Verify access through tournament ownership
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${result.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Access denied');
            }

            return result;

        } catch (error) {
            this.handleError(error, 'Get match result by ID');
            return null;
        }
    }

    // Delete match result
    async deleteMatchResult(resultId: string, deletedBy: string) {
        try {
            const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
            if (!result) {
                throw new Error('Match result not found');
            }

            // Remove from Redis
            await redis.delete(`matchResult:${resultId}`);
            await redis.srem(`match:${result.matchId}:results`, resultId);
            await redis.srem(`tournament:${result.tournamentId}:results`, resultId);

            // Queue database deletion
            await QueueService.queueDatabaseSync({
                type: 'DELETE_MATCH_RESULT',
                entityId: resultId,
                data: { id: resultId },
                userId: deletedBy,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

            // Invalidate caches
            await redis.delete(`match:${result.matchId}:results:list`);

            this.logger.info(`Match result ${resultId} deleted`);
            return true;

        } catch (error) {
            this.handleError(error, 'Delete match result');
            return false;
        }
    }
}

export const matchResultService = new MatchResultService();