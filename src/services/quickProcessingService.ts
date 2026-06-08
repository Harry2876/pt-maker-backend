import { BaseService } from './baseService';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { pythonAIService } from './pythonAIService';
import { PointsCalculator, ScoringConfig } from '../utils/pointsCalculator';
import { unifiedScreenshotService } from './unifiedScreenshotService';
import { QuickSlotCache } from '../types/quickSlot';
import {
    CreateQuickMatchResultData,
    WarningType,
} from '../types/quickResult';
import { AttendanceTeam, ResultTeam } from '../types/pythonAI';
import { quickSeriesService } from './quickSeriesService';
import { quickResultService } from './quickResultService';
import { ServiceError, isServiceError } from '../utils/serviceError';
import { storageUrlToR2Key } from '../utils/r2UrlUtils';


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
            if (!quickMatch) {
                throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
            }

            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'ATTENDANCE' }
            );

            if (screenshots.length === 0) {
                throw new ServiceError(
                    'No attendance screenshots found. Upload attendance screenshots first.',
                    400,
                    'NO_ATTENDANCE_SCREENSHOTS'
                );
            }

            this.logger.info(`Sending ${screenshots.length} attendance screenshot(s) to Python AI`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Attendance Screenshots',
            });

            const imageRefs = screenshots.map(s => storageUrlToR2Key(s.storageUrl));
            const response = await pythonAIService.processScoreboardBatch(imageRefs);

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

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
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
            if (!isServiceError(error)) {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                }).catch(() => {});
            }
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
            if (!quickMatch) {
                throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
            }

            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);
            if (slots.length === 0) {
                throw new ServiceError(
                    'No slots found. Upload attendance screenshots or create slots manually first.',
                    400,
                    'NO_SLOTS'
                );
            }

            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt', quickMatchId, userId, { type: 'RESULT' }
            );

            if (screenshots.length === 0) {
                const existingResults = await quickResultService.getMatchResults(quickMatchId, userId);
                if (existingResults.length > 0) {
                    return {
                        success: true,
                        resultsCreated: 0,
                        resultsProcessed: existingResults.length,
                        warnings: [{
                            type: 'SLOT_NOT_FOUND' as WarningType,
                            message: 'No result screenshots uploaded — using existing manual results',
                        }],
                        processingTimeMs: Date.now() - startTime,
                    };
                }
                throw new ServiceError(
                    'No result screenshots found. Upload result screenshots or enter results manually.',
                    400,
                    'NO_RESULT_SCREENSHOTS'
                );
            }

            this.logger.info(`Sending ${screenshots.length} result screenshot(s) to Python AI`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Result Screenshots',
            });

            const imageRefs = screenshots.map(s => storageUrlToR2Key(s.storageUrl));
            const response = await pythonAIService.processScoreboardBatch(imageRefs);

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

                    await quickResultService.persistResult(quickMatchId, userId, resultData, {
                        status: 'PROCESSED',
                        upsert: true,
                    });
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

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'COMPLETED',
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
            if (!isServiceError(error)) {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                }).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Process both attendance and results in sequence.
     * Skips the result OCR step when results already exist and no result screenshots are uploaded.
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
     *   2. One is a prefix/substring of the other (min 4 chars) — handles OCR truncation
     *   3. Levenshtein distance ≤ proportional threshold:
     *        ≤ 2  for names  6–8 chars
     *        ≤ 3  for names  9–11 chars
     *        ≤ 4  for names ≥ 12 chars
     *      This accounts for OCR substitutions on longer names (e.g. kuicurusan→kaizurusan).
     *   4. Character overlap ratio ≥ 70 % (bigram similarity) as a final safety net
     */
    private namesMatch(a: string, b: string): boolean {
        const na = this.normaliseName(a);
        const nb = this.normaliseName(b);
        if (!na || !nb) return false;
        if (na === nb) return true;

        const shorter = na.length < nb.length ? na : nb;
        const longer  = na.length < nb.length ? nb : na;

        // Rule 2: prefix / substring
        if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
        if (shorter.length >= 4 && longer.includes(shorter)) return true;

        if (shorter.length > 5) {
            // Rule 3: proportional Levenshtein threshold
            const maxDist = shorter.length >= 12 ? 4 : shorter.length >= 9 ? 3 : 2;
            const dist = this.levenshtein(na, nb);
            if (dist <= maxDist) return true;

            // Rule 4: bigram overlap ratio — catches swapped / inserted characters
            const bigramOverlap = this.bigramSimilarity(na, nb);
            if (bigramOverlap >= 0.70) return true;
        }

        return false;
    }

    /** Sørensen–Dice bigram similarity in [0, 1]. */
    private bigramSimilarity(a: string, b: string): number {
        const bigrams = (s: string) => {
            const set = new Map<string, number>();
            for (let i = 0; i < s.length - 1; i++) {
                const bg = s.slice(i, i + 2);
                set.set(bg, (set.get(bg) ?? 0) + 1);
            }
            return set;
        };
        const ba = bigrams(a);
        const bb = bigrams(b);
        let intersection = 0;
        for (const [bg, count] of ba) {
            intersection += Math.min(count, bb.get(bg) ?? 0);
        }
        const totalA = a.length - 1;
        const totalB = b.length - 1;
        if (totalA <= 0 || totalB <= 0) return 0;
        return (2 * intersection) / (totalA + totalB);
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