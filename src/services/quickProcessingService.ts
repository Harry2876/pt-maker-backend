import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { pythonAIService } from './pythonAIService';
import { PointsCalculator, ScoringConfig } from '../utils/pointsCalculator';
import { unifiedScreenshotService } from './unifiedScreenshotService';
import {
    QuickMatchCache,
    QuickMatchStatus
} from '../types/quickMatch';
import { QuickSlotCache } from '../types/quickSlot';
import {
    QuickMatchResultCache,
    CreateQuickMatchResultData,
    WarningType,
    PlayerResult
} from '../types/quickResult';
import { AttendanceTeam, ResultTeam } from '../types/pythonAI';
import { quickSeriesService } from './quickSeriesService';


// Response interfaces
export interface AttendanceProcessingResult {
    success: boolean;
    slotsDetected: number;
    slotsCreated: number;
    warnings: Array<{
        type: WarningType;
        message: string;
        details?: any;
    }>;
    processingTimeMs: number;
    confidence?: {
        overall: number;
        slotExtraction: number;
    };
}

export interface ResultProcessingResult {
    success: boolean;
    resultsCreated: number;
    resultsProcessed: number;
    warnings: Array<{
        type: WarningType;
        message: string;
        details?: any;
    }>;
    processingTimeMs: number;
    confidence?: {
        overall: number;
        resultExtraction: number;
    };
}

export interface CompleteProcessingResult {
    success: boolean;
    attendanceResult?: AttendanceProcessingResult;
    resultProcessingResult?: ResultProcessingResult;
    totalProcessingTimeMs: number;
}

export class QuickProcessingService extends BaseService {
    /**
     * Process attendance screenshots - extracts team slots from screenshots
     * STEP 1: Attendance Processing
     */
    async processAttendance(
        quickMatchId: string,
        userId: string
    ): Promise<AttendanceProcessingResult> {
        const startTime = Date.now();
        const warnings: Array<{ type: WarningType; message: string; details?: any }> = [];

        try {
            this.logger.info(`Starting attendance processing for Quick Match ${quickMatchId}`);

            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) throw new Error('Quick Match not found or access denied');

            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'ATTENDANCE' }
            );

            if (screenshots.length === 0) throw new Error('No attendance screenshots found');

            this.logger.info(`Sending ${screenshots.length} attendance screenshot(s) to Python AI`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Attendance Screenshots'
            });

            const imageUrls = screenshots.map(s => s.storageUrl);
            const response = await pythonAIService.processScoreboardBatch(imageUrls);

            if (response.status !== 'success') {
                throw new Error(`Python AI returned status: ${response.status}`);
            }

            if (response.data.layout !== 'expanded_layout') {
                throw new Error(
                    `Expected attendance (expanded_layout) but received ${response.data.layout}. ` +
                    'Please make sure only attendance screenshots are uploaded for this step.'
                );
            }

            const attendanceTeams = response.data.teams as AttendanceTeam[];
            let slotsCreated = 0;

            for (const team of attendanceTeams) {
                try {
                    const playerNames = team.players.map(p => p.name).filter(Boolean);
                    // Use first player name as team name placeholder; organiser can rename later
                    const teamName = playerNames[0] || `Slot ${team.slot_number}`;

                    const existingSlot = await quickSlotService.getSlotByNumber(quickMatchId, team.slot_number);

                    if (!existingSlot) {
                        await quickSlotService.createSlot(quickMatchId, userId, {
                            slotNumber: team.slot_number,
                            teamName,
                            playerNames,
                        });
                        slotsCreated++;
                    } else {
                        // Slot already exists — update player list and mark detected
                        if (!existingSlot.detectedInAttendance) {
                            await quickSlotService.updateSlot(existingSlot.id, userId, {
                                playerNames,
                                detectedInAttendance: true,
                                status: 'DETECTED',
                            });
                        } else if (existingSlot.teamName !== teamName) {
                            warnings.push({
                                type: 'TEAM_NAME_MISMATCH',
                                message: `Slot ${team.slot_number} detected with a different first-player name`,
                                details: { existing: existingSlot.teamName, detected: teamName },
                            });
                        }
                    }
                } catch (err) {
                    this.logger.error(`Error creating slot ${team.slot_number}:`, err);
                    warnings.push({
                        type: 'SLOT_NOT_FOUND',
                        message: `Failed to create/update slot ${team.slot_number}`,
                        details: { slotNumber: team.slot_number, error: (err as Error).message },
                    });
                }
            }

            await unifiedScreenshotService.markScreenshotsProcessed(quickMatchId, 'ATTENDANCE', userId);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Attendance Processing Complete',
                teamsDetected: attendanceTeams.length,
                warningsCount: (quickMatch.warningsCount || 0) + warnings.length,
            });

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Attendance processing complete for ${quickMatchId}`, {
                slotsDetected: attendanceTeams.length,
                slotsCreated,
                warnings: warnings.length,
                processingTimeMs,
            });

            return {
                success: true,
                slotsDetected: attendanceTeams.length,
                slotsCreated,
                warnings,
                processingTimeMs,
                confidence: {
                    overall: response.metadata.images_processed / screenshots.length,
                    slotExtraction: response.metadata.images_processed / screenshots.length,
                },
            };

        } catch (error) {
            this.logger.error(`Attendance processing failed for ${quickMatchId}:`, error);
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'ERROR',
                processingStep: `Error: ${(error as Error).message}`,
            }).catch(() => {});
            throw error;
        }
    }

    /**
     * Process result screenshots - extracts team results and calculates points.
     * STEP 2: Result Processing
     */
    async processResults(
        quickMatchId: string,
        userId: string
    ): Promise<ResultProcessingResult> {
        const startTime = Date.now();
        const warnings: Array<{ type: WarningType; message: string; details?: any }> = [];

        try {
            this.logger.info(`Starting result processing for Quick Match ${quickMatchId}`);

            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) throw new Error('Quick Match not found or access denied');

            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);
            if (slots.length === 0) {
                throw new Error('No teams detected. Process attendance screenshots first.');
            }

            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'RESULT', isProcessed: false }
            );

            if (screenshots.length === 0) throw new Error('No result screenshots found');

            this.logger.info(`Sending ${screenshots.length} result screenshot(s) to Python AI`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Result Screenshots',
            });

            const imageUrls = screenshots.map(s => s.storageUrl);
            const response = await pythonAIService.processScoreboardBatch(imageUrls);

            if (response.status !== 'success') {
                throw new Error(`Python AI returned status: ${response.status}`);
            }

            if (response.data.layout !== 'compact_layout') {
                throw new Error(
                    `Expected result (compact_layout) but received ${response.data.layout}. ` +
                    'Please make sure only result screenshots are uploaded for this step.'
                );
            }

            const resultTeams = response.data.teams as ResultTeam[];

            const scoring: ScoringConfig = {
                positionPointsConfig: quickMatch.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                killPointsValue: quickMatch.killPointsValue || 1,
            };

            let resultsCreated = 0;

            for (const team of resultTeams) {
                try {
                    const totalKills = team.players.reduce((sum, p) => sum + (p.finishes || 0), 0);
                    const playerNames = team.players.map(p => p.name).filter(Boolean);

                    // Match by all player names against all slots — pick slot with highest overlap
                    const matchingSlot = this.findMatchingSlotByRoster(slots, playerNames);

                    if (!matchingSlot) {
                        warnings.push({
                            type: 'SLOT_NOT_FOUND',
                            message: `Rank ${team.team_rank}: could not match team to an attendance slot`,
                            details: { team_rank: team.team_rank, players: playerNames },
                        });
                        continue;
                    }

                    const points = PointsCalculator.calculatePoints(team.team_rank, totalKills, scoring);

                    const resultData: CreateQuickMatchResultData = {
                        slotNumber: matchingSlot.slotNumber,
                        teamName: matchingSlot.teamName,
                        detectedTeamName: playerNames[0] || '',
                        position: team.team_rank,
                        rank: team.team_rank,
                        totalKills,
                        positionPoints: points.positionPoints,
                        killPoints: points.killPoints,
                        totalPoints: points.totalPoints,
                        playerResults: team.players.map(p => ({
                            playerName: p.name,
                            kills: p.finishes || 0,
                        })),
                        needsReview: false,
                        aiConfidence: 0.9,
                    };

                    await this.createMatchResult(quickMatchId, userId, resultData);
                    resultsCreated++;

                } catch (err) {
                    this.logger.error(`Error creating result for rank ${team.team_rank}:`, err);
                    warnings.push({
                        type: 'INVALID_POSITION',
                        message: `Failed to create result for rank ${team.team_rank}`,
                        details: { rank: team.team_rank, error: (err as Error).message },
                    });
                }
            }

            await unifiedScreenshotService.markScreenshotsProcessed(quickMatchId, 'RESULT', userId);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'COMPLETED',
                processingStep: 'Result Processing Complete',
                warningsCount: (quickMatch.warningsCount || 0) + warnings.length,
            });

            // Trigger series leaderboard update if this match belongs to a series
            await quickSeriesService.onMatchCompleted(quickMatchId, userId);

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Result processing complete for ${quickMatchId}`, {
                resultsProcessed: resultTeams.length,
                resultsCreated,
                warnings: warnings.length,
                processingTimeMs,
            });

            return {
                success: true,
                resultsCreated,
                resultsProcessed: resultTeams.length,
                warnings,
                processingTimeMs,
                confidence: {
                    overall: response.metadata.images_processed / screenshots.length,
                    resultExtraction: response.metadata.images_processed / screenshots.length,
                },
            };

        } catch (error) {
            this.logger.error(`Result processing failed for ${quickMatchId}:`, error);
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'ERROR',
                processingStep: `Error: ${(error as Error).message}`,
            }).catch(() => {});
            throw error;
        }
    }

    /**
     * Process both attendance and results in sequence
     * STEP 3: Complete Processing
     */
    async processComplete(
        quickMatchId: string,
        userId: string
    ): Promise<CompleteProcessingResult> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting complete processing for Quick Match ${quickMatchId}`);

            // Process attendance first
            const attendanceResult = await this.processAttendance(quickMatchId, userId);

            // Then process results
            const resultProcessingResult = await this.processResults(quickMatchId, userId);

            const totalProcessingTimeMs = Date.now() - startTime;

            this.logger.info(`Complete processing finished for Quick Match ${quickMatchId}`, {
                totalProcessingTimeMs
            });

            return {
                success: true,
                attendanceResult,
                resultProcessingResult,
                totalProcessingTimeMs
            };

        } catch (error) {
            this.logger.error(`Complete processing failed for Quick Match ${quickMatchId}:`, error);
            throw error;
        }
    }

    /**
     * Create a match result record
     * @private
     */
    private async createMatchResult(
        quickMatchId: string,
        userId: string,
        data: CreateQuickMatchResultData
    ): Promise<QuickMatchResultCache> {
        const resultId = randomUUID();

        const result: QuickMatchResultCache = {
            id: resultId,
            quickMatchId,
            slotNumber: data.slotNumber,
            teamName: data.teamName,
            detectedTeamName: data.detectedTeamName,
            position: data.position,
            rank: data.rank,
            totalKills: data.totalKills,
            positionPoints: data.positionPoints,
            killPoints: data.killPoints,
            totalPoints: data.totalPoints,
            playerResults: data.playerResults,
            status: 'PENDING',
            warningType: data.warningType,
            needsReview: data.needsReview || false,
            aiConfidence: data.aiConfidence,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            dbStatus: 'SYNCED' // Direct DB write, so it's synced
        };

        // Store directly in database (no queue needed)
        await this.db.quickMatchResult.create({
            data: {
                id: resultId,
                quickMatchId,
                slotNumber: data.slotNumber,
                teamName: data.teamName,
                position: data.position,
                rank: data.position,
                totalKills: data.totalKills,
                positionPoints: data.positionPoints,
                killPoints: data.killPoints,
                totalPoints: data.totalPoints,
                needsReview: data.needsReview || false,
                aiConfidence: data.aiConfidence,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        });

        // Cache the result for quick access
        await redis.hsetObject(`quickResult:${resultId}`, result);
        await redis.sadd(`quickMatch:${quickMatchId}:results`, resultId);

        this.logger.info(`Created match result for slot ${data.slotNumber} (${data.teamName})`);
        return result;
    }

    /**
     * Get all results for a match
     */
    async getMatchResults(
        quickMatchId: string,
        userId: string
    ): Promise<QuickMatchResultCache[]> {
        try {
            // Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // Get results from database
            const dbResults = await this.db.quickMatchResult.findMany({
                where: { quickMatchId },
                orderBy: [
                    { position: 'asc' },
                    { totalPoints: 'desc' }
                ]
            });

            // Convert to cache format
            const results: QuickMatchResultCache[] = dbResults.map(dbResult => ({
                id: dbResult.id,
                quickMatchId: dbResult.quickMatchId,
                slotNumber: dbResult.slotNumber,
                teamName: dbResult.teamName,
                detectedTeamName: dbResult.detectedTeamName || undefined,
                position: dbResult.position,
                rank: dbResult.rank,
                totalKills: dbResult.totalKills,
                positionPoints: dbResult.positionPoints,
                killPoints: dbResult.killPoints,
                totalPoints: dbResult.totalPoints,
                playerResults: dbResult.playerResults
                    ? JSON.parse(JSON.stringify(dbResult.playerResults)) as PlayerResult[]
                    : undefined,
                status: dbResult.status as any,
                warningType: dbResult.warningType || undefined,
                needsReview: dbResult.needsReview,
                aiConfidence: dbResult.aiConfidence ?? undefined,
                createdAt: dbResult.createdAt.toISOString(),
                updatedAt: dbResult.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            }));

            return results;

        } catch (error) {
            this.handleError(error, 'Get Match Results');
            throw error;
        }
    }

    /**
     * Normalise a player name for comparison: lowercase, strip spaces and
     * common OCR noise characters so "GWxORIGERI" and "GWxDRIGERI" still
     * match on a prefix basis.
     */
    private normaliseName(name: string): string {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    /**
     * Return true if two normalised player names are considered the same.
     * Rules (in order):
     *   1. Exact normalised match
     *   2. One is a prefix of the other (min 4 chars) — handles OCR truncation
     *   3. Levenshtein distance ≤ 2 for names longer than 5 chars
     */
    private namesMatch(a: string, b: string): boolean {
        const na = this.normaliseName(a);
        const nb = this.normaliseName(b);
        if (!na || !nb) return false;
        if (na === nb) return true;

        const shorter = na.length < nb.length ? na : nb;
        const longer  = na.length < nb.length ? nb : na;
        if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
        if (shorter.length >= 4 && longer.includes(shorter)) return true;

        // Simple edit-distance check for longer names
        if (shorter.length > 5) {
            const dist = this.levenshtein(na, nb);
            if (dist <= 2) return true;
        }

        return false;
    }

    private levenshtein(a: string, b: string): number {
        const m = a.length, n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
            Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
        );
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
            }
        }
        return dp[m][n];
    }

    /**
     * Match a result team (identified by its roster) to a slot.
     * Scores each slot by how many result-team players appear in the slot's
     * playerNames list (from attendance). Returns the highest-scoring slot
     * if at least 1 player matches.
     */
    private findMatchingSlotByRoster(
        slots: QuickSlotCache[],
        resultPlayerNames: string[]
    ): QuickSlotCache | null {
        let bestSlot: QuickSlotCache | null = null;
        let bestScore = 0;

        for (const slot of slots) {
            if (!slot.playerNames || slot.playerNames.length === 0) continue;

            let score = 0;
            for (const resultPlayer of resultPlayerNames) {
                for (const slotPlayer of slot.playerNames) {
                    if (this.namesMatch(resultPlayer, slotPlayer)) {
                        score++;
                        break; // count each result-player at most once
                    }
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestSlot = slot;
            }
        }

        if (bestSlot && bestScore > 0) {
            this.logger.info(
                `Roster-matched ${bestScore}/${resultPlayerNames.length} player(s) → slot ${bestSlot.slotNumber} (${bestSlot.teamName})`
            );
            return bestSlot;
        }

        return null;
    }
}

export const quickProcessingService = new QuickProcessingService();