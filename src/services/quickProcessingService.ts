import { BaseService } from './baseService';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { pythonAIService } from './pythonAIService';
import { PointsCalculator, ScoringConfig } from '../utils/pointsCalculator';
import { unifiedScreenshotService } from './unifiedScreenshotService';
import {
    AttendanceProcessingAudit,
    CreateQuickMatchResultData,
    QuickMatchResultCache,
    ResultProcessingAudit,
    WarningType,
} from '../types/quickResult';
import { QuickSlotCache } from '../types/quickSlot';
import { AttendanceTeam, ResultTeam } from '../types/pythonAI';
import { quickSeriesService } from './quickSeriesService';
import { quickResultService } from './quickResultService';
import { ServiceError, isServiceError } from '../utils/serviceError';
import { resolvePythonImageRef } from '../utils/r2UrlUtils';
import {
    ocrReconciliationService,
    ReconciliationWarning,
} from './ocrReconciliationService';

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
    audit?: AttendanceProcessingAudit;
    /** Full persisted slot records including player rosters */
    slots?: QuickSlotCache[];
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
    audit?: ResultProcessingAudit;
    /** Full persisted match results including per-player finishes */
    results?: QuickMatchResultCache[];
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

            this.logger.info(`Sending ${screenshots.length} attendance screenshot(s) to Python AI (batch)`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Attendance Screenshots',
            });

            const imageRefs = screenshots.map(s => resolvePythonImageRef(s.storageUrl, s.fileName));
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

            const rawTeams = response.data.teams as AttendanceTeam[];
            const reconciliation = ocrReconciliationService.mergeAttendanceTeams(rawTeams);
            warnings.push(...this.toProcessingWarnings(reconciliation.warnings));

            const attendanceTeams = reconciliation.teams;
            let slotsCreated = 0;
            const savedAudit: AttendanceProcessingAudit['saved'] = [];

            for (const team of attendanceTeams) {
                try {
                    const playerNames = team.players.map(p => p.name).filter(Boolean);
                    const teamName = playerNames[0] || `Slot ${team.slot_number}`;

                    savedAudit.push({
                        slotNumber: team.slot_number,
                        teamName,
                        playerNames,
                    });

                    const existingSlot = await quickSlotService.getSlotByNumber(quickMatchId, team.slot_number);

                    if (!existingSlot) {
                        await quickSlotService.createSlot(quickMatchId, userId, {
                            slotNumber: team.slot_number,
                            teamName,
                            playerNames,
                        });
                        slotsCreated++;
                    } else {
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
            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);

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
                audit: {
                    ocrMode: 'batch',
                    imagesProcessed: response.metadata.images_processed,
                    rawTeams: reconciliation.rawTeamCount,
                    mergedSlots: reconciliation.mergedTeamCount,
                    reconciliationWarnings: reconciliation.warnings.length,
                    saved: savedAudit,
                },
                slots,
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

            this.logger.info(`Processing ${screenshots.length} result screenshot(s) via per-image OCR`);

            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                processingStep: 'Processing Result Screenshots',
            });

            const imageRefs = screenshots.map(s => resolvePythonImageRef(s.storageUrl, s.fileName));

            // Per-image OCR is used for results because Python run_batch merges scroll pages
            // by team_rank only, which corrupts rank-1 kills and drops teams. Single-image
            // pipeline.run() matches manual full_pipeline output; backend dedupes by roster.
            const rawTeams: ResultTeam[] = [];
            for (let i = 0; i < imageRefs.length; i++) {
                const ref = imageRefs[i];
                this.logger.debug(`Result OCR image ${i + 1}/${imageRefs.length}`, { ref });
                const single = await pythonAIService.processScoreboard(ref);
                if (single.status !== 'success') {
                    throw new Error(`Python AI returned status: ${single.status} for result image ${i + 1}`);
                }
                if (single.data.layout !== 'compact_layout') {
                    warnings.push({
                        type: 'INVALID_POSITION',
                        message: `Result image ${i + 1} is not compact_layout (${single.data.layout}) — skipped`,
                        details: { imageIndex: i + 1, layout: single.data.layout },
                    });
                    continue;
                }
                rawTeams.push(...(single.data.teams as ResultTeam[]));
            }

            if (rawTeams.length === 0) {
                throw new ServiceError(
                    'No result teams detected from result screenshots.',
                    400,
                    'NO_RESULT_TEAMS'
                );
            }

            const ocrMode: ResultProcessingAudit['ocrMode'] = 'per_image';
            const reconciliation = ocrReconciliationService.dedupeResultTeams(rawTeams);
            warnings.push(...this.toProcessingWarnings(reconciliation.warnings));

            const deletedProcessedResults = await quickResultService.deleteProcessedResults(
                quickMatchId,
                userId
            );

            const resultTeams = reconciliation.teams;
            const scoring: ScoringConfig = {
                positionPointsConfig: quickMatch.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                killPointsValue: quickMatch.killPointsValue || 1,
            };

            let resultsCreated = 0;
            let unmatched = 0;
            let ambiguous = 0;
            let slotConflicts = 0;
            const assignedSlots = new Set<number>();
            const savedAudit: ResultProcessingAudit['saved'] = [];

            for (const team of resultTeams) {
                try {
                    const totalKills = team.players.reduce((sum, p) => sum + (p.finishes || 0), 0);
                    const playerNames = team.players.map(p => p.name).filter(Boolean);

                    const match = ocrReconciliationService.findMatchingSlot(slots, playerNames);

                    if (match.ambiguous) {
                        ambiguous++;
                        warnings.push({
                            type: 'AMBIGUOUS_SLOT_MATCH',
                            message: `Rank ${team.team_rank}: roster matches multiple slots equally (${match.matchScore}/${match.requiredScore})`,
                            details: { team_rank: team.team_rank, players: playerNames, matchScore: match.matchScore },
                        });
                        continue;
                    }

                    if (!match.slot) {
                        unmatched++;
                        warnings.push({
                            type: 'SLOT_NOT_FOUND',
                            message: `Rank ${team.team_rank}: could not match team to an attendance slot (${match.matchScore}/${match.requiredScore} players)`,
                            details: {
                                team_rank: team.team_rank,
                                players: playerNames,
                                matchScore: match.matchScore,
                                requiredScore: match.requiredScore,
                            },
                        });
                        continue;
                    }

                    if (assignedSlots.has(match.slot.slotNumber)) {
                        slotConflicts++;
                        warnings.push({
                            type: 'SLOT_ALREADY_ASSIGNED',
                            message: `Rank ${team.team_rank}: slot ${match.slot.slotNumber} already has a result — skipped`,
                            details: {
                                team_rank: team.team_rank,
                                slotNumber: match.slot.slotNumber,
                                players: playerNames,
                            },
                        });
                        continue;
                    }

                    const points = PointsCalculator.calculatePoints(team.team_rank, totalKills, scoring);
                    const needsReview = reconciliation.warnings.some(
                        (w) => w.type === 'MISSING_KILLS' && w.details?.rank === team.team_rank
                    );

                    const playerResults = team.players.map(p => ({
                        playerName: p.name,
                        kills: p.finishes || 0,
                    }));

                    const resultData: CreateQuickMatchResultData = {
                        slotNumber: match.slot.slotNumber,
                        teamName: match.slot.teamName,
                        detectedTeamName: playerNames[0] || '',
                        position: team.team_rank,
                        rank: team.team_rank,
                        totalKills,
                        positionPoints: points.positionPoints,
                        killPoints: points.killPoints,
                        totalPoints: points.totalPoints,
                        playerResults,
                        needsReview,
                        aiConfidence: match.matchScore / Math.max(playerNames.length, 1),
                    };

                    await quickResultService.persistResult(quickMatchId, userId, resultData, {
                        status: 'PROCESSED',
                        upsert: true,
                    });

                    assignedSlots.add(match.slot.slotNumber);
                    resultsCreated++;
                    savedAudit.push({
                        slotNumber: match.slot.slotNumber,
                        rank: team.team_rank,
                        teamName: match.slot.teamName,
                        totalKills,
                        matchScore: `${match.matchScore}/${playerNames.length}`,
                        playerResults,
                    });

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

            await quickSeriesService.onMatchCompleted(quickMatchId, userId);

            const processingTimeMs = Date.now() - startTime;
            const results = await quickResultService.getMatchResults(quickMatchId, userId);

            this.logger.info(`Result processing complete for ${quickMatchId}`, {
                rawTeams: reconciliation.rawTeamCount,
                dedupedTeams: reconciliation.dedupedTeamCount,
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
                    overall: reconciliation.dedupedTeamCount / Math.max(reconciliation.rawTeamCount, 1),
                    resultExtraction: resultsCreated / Math.max(reconciliation.dedupedTeamCount, 1),
                },
                audit: {
                    ocrMode,
                    imagesProcessed: screenshots.length,
                    rawTeams: reconciliation.rawTeamCount,
                    afterDedupe: reconciliation.dedupedTeamCount,
                    skippedDuplicates: reconciliation.skippedDuplicates,
                    skippedInvalidRanks: reconciliation.skippedInvalidRanks,
                    matched: resultsCreated,
                    unmatched,
                    ambiguous,
                    slotConflicts,
                    deletedProcessedResults,
                    saved: savedAudit,
                },
                results,
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
     */
    async processComplete(
        quickMatchId: string,
        userId: string
    ): Promise<CompleteProcessingResult> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting complete processing for Quick Match ${quickMatchId}`);

            const attendanceResult = await this.processAttendance(quickMatchId, userId);
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

    private toProcessingWarnings(
        reconciliationWarnings: ReconciliationWarning[]
    ): Array<{ type: WarningType; message: string; details?: any }> {
        return reconciliationWarnings.map((w) => ({
            type: w.type,
            message: w.message,
            details: w.details,
        }));
    }
}

export const quickProcessingService = new QuickProcessingService();
