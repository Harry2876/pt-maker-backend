import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { pythonAIService } from './pythonAIService';
import { PointsCalculator, ScoringConfig } from '../utils/pointsCalculator';
import {
    QuickMatchCache,
    QuickMatchStatus
} from '../types/quickMatch';
import { QuickSlotCache } from '../types/quickSlot';
import {
    QuickMatchResultCache,
    CreateQuickMatchResultData,
    WarningType,
    PythonAIAttendanceResponse,
    PythonAIResultResponse
} from '../types/quickResult';

// Response interfaces
export interface AttendanceProcessingResult {
    success: boolean;
    teamsDetected: number;
    slotsMatched: number;
    slotsNotFound: number;
    warnings: Array<{
        type: WarningType;
        message: string;
        slotNumber?: number;
    }>;
    processingTimeMs: number;
}

export interface ResultProcessingResult {
    success: boolean;
    resultsProcessed: number;
    warnings: Array<{
        type: WarningType;
        message: string;
        teamName?: string;
        slotNumber?: number;
    }>;
    processingTimeMs: number;
}

export interface CompleteProcessingResult {
    success: boolean;
    matchId: string;
    attendanceResult?: AttendanceProcessingResult;
    resultProcessingResult: ResultProcessingResult;
    totalProcessingTimeMs: number;
    finalStatus: QuickMatchStatus;
}

export class QuickProcessingService extends BaseService {
    private readonly LOW_CONFIDENCE_THRESHOLD = 0.7; // 70% AI confidence

    constructor() {
        super();
    }

    /**
     * Process attendance screenshots - detects which teams are present
     * STEP 1: Attendance Processing
     */
    async processAttendance(
        quickMatchId: string,
        userId: string
    ): Promise<AttendanceProcessingResult> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting attendance processing for Quick Match ${quickMatchId}`);

            // 1. Verify match exists and status
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            if (quickMatch.status !== 'ATTENDANCE_UPLOADED') {
                throw new Error(`Cannot process attendance. Current status: ${quickMatch.status}`);
            }

            // 2. Get all slots
            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);
            if (slots.length === 0) {
                throw new Error('No slots found. Please upload slot assignments first.');
            }

            // 3. Get attendance screenshots
            const { unifiedScreenshotService } = await import('./unifiedScreenshotService');
            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt',
                quickMatchId,
                userId,
                { type: 'ATTENDANCE', isProcessed: false }
            );

            if (screenshots.length === 0) {
                throw new Error('No attendance screenshots found');
            }

            // 4. Prepare slot mappings for Python AI
            const slotMappings = slots.map(slot => ({
                slot_number: slot.slotNumber,
                team_name: slot.teamName
            }));

            // 5. Call Python AI for attendance detection
            this.logger.info(`Calling Python AI with ${screenshots.length} screenshots and ${slots.length} slots`);

            const aiResponse = await pythonAIService.detectAttendanceWithRetry(
                screenshots.map(s => s.storageUrl),
                slotMappings
            );

            // 6. Map detected teams to slots (simple by slot number)
            const warnings: Array<{ type: WarningType; message: string; slotNumber?: number }> = [];
            let slotsMatched = 0;
            let slotsNotFound = 0;

            // Create a map of detected teams with their player names
            const detectedTeamsMap = new Map<number, string[]>();
            aiResponse.data.detected_teams.forEach(team => {
                detectedTeamsMap.set(team.slot_position, team.player_names);
            });

            // Update each slot based on detection
            for (const slot of slots) {
                const detectedPlayers = detectedTeamsMap.get(slot.slotNumber);

                if (detectedPlayers) {
                    await quickSlotService.updateSlot(
                        slot.id,
                        userId,
                        {
                            status: 'DETECTED',
                            detectedInAttendance: true,
                            playerNames: detectedPlayers
                        }
                    );
                    slotsMatched++;
                } else {
                    // Team NOT detected at this slot
                    await quickSlotService.updateSlot(
                        slot.id,
                        userId,
                        {
                            status: 'NOT_FOUND',
                            detectedInAttendance: false
                        }
                    );
                    slotsNotFound++; 
                    warnings.push({
                        type: 'SLOT_NOT_FOUND',
                        message: `Slot ${slot.slotNumber}: Team "${slot.teamName}" not detected in attendance`,
                        slotNumber: slot.slotNumber
                    });
                }
            }

            // 7. Mark attendance screenshots as processed
            const { unifiedScreenshotService: unifiedService1 } = await import('./unifiedScreenshotService');
            await unifiedService1.markScreenshotsProcessed(quickMatchId, 'ATTENDANCE', userId);

            // 8. Update match status
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'PROCESSING',
                teamsDetected: slotsMatched,
                warningsCount: warnings.length,
                processingStep: 'Attendance Detection Complete'
            });

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Attendance processing complete: ${slotsMatched} matched, ${slotsNotFound} not found, ${warnings.length} warnings`);

            return {
                success: true,
                teamsDetected: aiResponse.data.detected_teams.length,
                slotsMatched,
                slotsNotFound,
                warnings,
                processingTimeMs
            };

        } catch (error) {
            this.handleError(error, 'Process Attendance');

            // Update match status to ERROR
            try {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                    processingStep: 'Attendance Detection Failed'
                });
            } catch (updateError) {
                this.logger.error('Failed to update match status after error:', updateError);
            }

            throw error;
        }
    }

    /**
     * Process result screenshots - extracts team results and calculates points
     * STEP 2: Result Processing
     */
    async processResults(
        quickMatchId: string,
        userId: string
    ): Promise<ResultProcessingResult> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting result processing for Quick Match ${quickMatchId}`);

            // 1. Verify match exists and status
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            if (quickMatch.status !== 'RESULTS_UPLOADED') {
                throw new Error(`Cannot process results. Current status: ${quickMatch.status}`);
            }

            // 2. Get all slots (only process detected ones)
            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId, {
                detectedInAttendance: true
            });

            if (slots.length === 0) {
                throw new Error('No teams detected in attendance. Please process attendance first.');
            }

            // 3. Get result screenshots
            const { unifiedScreenshotService: unifiedService2 } = await import('./unifiedScreenshotService');
            const screenshots = await unifiedService2.listScreenshots(
                'quick-pt',
                quickMatchId,
                userId,
                { type: 'RESULT', isProcessed: false }
            );

            if (screenshots.length === 0) {
                throw new Error('No result screenshots found');
            }

            // 4. Call Python AI for result extraction
            this.logger.info(`Calling Python AI with ${screenshots.length} result screenshots`);

            const aiResponse = await pythonAIService.extractResultsWithRetry(
                screenshots.map(s => s.storageUrl)
            );

            // 5. Get scoring config from match
            const scoringConfig: ScoringConfig = {
                positionPointsConfig: quickMatch.positionPointsConfig || PointsCalculator.getDefaultBGMIConfig().positionPointsConfig,
                killPointsValue: quickMatch.killPointsValue
            };

            // 6. Process each result and create match result records
            const warnings: Array<{ type: WarningType; message: string; teamName?: string; slotNumber?: number }> = [];
            const createdResults: QuickMatchResultCache[] = [];

            // Create a map of slots by player names for matching
            const slotsByPlayerSet = new Map<string, QuickSlotCache>();
            slots.forEach(slot => {
                if (slot.playerNames && slot.playerNames.length > 0) {
                    // Create a key from all player names (sorted, lowercase)
                    const playerKey = slot.playerNames
                        .map(p => p.toLowerCase().trim())
                        .sort()
                        .join('|');
                    slotsByPlayerSet.set(playerKey, slot);
                }
            });

            for (const aiResult of aiResponse.data.results) {
                // Try to match by player names first
                let matchingSlot: QuickSlotCache | undefined;

                if (aiResult.player_names && aiResult.player_names.length > 0) {
                    // Match by player names
                    const resultPlayerKey = aiResult.player_names
                        .map(p => p.toLowerCase().trim())
                        .sort()
                        .join('|');
                    matchingSlot = slotsByPlayerSet.get(resultPlayerKey);

                    // If no exact match, try partial match (at least 50% players match)
                    if (!matchingSlot) {
                        const resultPlayersSet = new Set(
                            aiResult.player_names.map(p => p.toLowerCase().trim())
                        );

                        for (const slot of slots) {
                            if (!slot.playerNames || slot.playerNames.length === 0) continue;

                            const slotPlayersSet = new Set(
                                slot.playerNames.map(p => p.toLowerCase().trim())
                            );

                            // Count matching players
                            let matchCount = 0;
                            for (const player of resultPlayersSet) {
                                if (slotPlayersSet.has(player)) matchCount++;
                            }

                            // If 50% or more players match, consider it a match
                            const matchPercentage = matchCount / Math.max(resultPlayersSet.size, slotPlayersSet.size);
                            if (matchPercentage >= 0.5) {
                                matchingSlot = slot;

                                // Add warning for partial match
                                if (matchPercentage < 1.0) {
                                    warnings.push({
                                        type: 'TEAM_NAME_MISMATCH',
                                        message: `Slot ${slot.slotNumber}: Partial player match (${(matchPercentage * 100).toFixed(0)}% - ${matchCount}/${Math.max(resultPlayersSet.size, slotPlayersSet.size)} players)`,
                                        slotNumber: slot.slotNumber,
                                        teamName: slot.teamName
                                    });
                                }
                                break;
                            }
                        }
                    }
                }

                // Fallback: Try matching by team name if player matching failed
                if (!matchingSlot && aiResult.team_name) {
                    matchingSlot = slots.find(
                        slot => slot.teamName.toLowerCase().trim() === aiResult.team_name!.toLowerCase().trim()
                    );

                    if (matchingSlot) {
                        warnings.push({
                            type: 'TEAM_NAME_MISMATCH',
                            message: `Slot ${matchingSlot.slotNumber}: Matched by team name (player names didn't match)`,
                            slotNumber: matchingSlot.slotNumber,
                            teamName: matchingSlot.teamName
                        });
                    }
                }

                if (!matchingSlot) {
                    // Team in results but no slot found
                    warnings.push({
                        type: 'SLOT_NOT_FOUND',
                        message: `Result (Rank ${aiResult.rank}) could not be matched to any slot`,
                        teamName: aiResult.team_name
                    });
                    continue;
                }

                // Calculate points using dynamic scoring config
                const pointsBreakdown = PointsCalculator.calculatePoints(
                    aiResult.rank,
                    aiResult.total_kills,
                    scoringConfig
                );

                // Create match result with player data
                const resultData: CreateQuickMatchResultData = {
                    slotNumber: matchingSlot.slotNumber,
                    teamName: matchingSlot.teamName,
                    detectedTeamName: aiResult.team_name,
                    position: aiResult.rank,
                    rank: aiResult.rank,
                    totalKills: aiResult.total_kills,
                    positionPoints: pointsBreakdown.positionPoints,
                    killPoints: pointsBreakdown.killPoints,
                    totalPoints: pointsBreakdown.totalPoints,
                    playerResults: aiResult.individual_kills?.map(ik => ({
                        playerName: ik.player_name,
                        kills: ik.kills
                    })),
                    needsReview: false,
                    aiConfidence: aiResponse.metadata?.confidence
                };

                // Check for low AI confidence
                if (aiResponse.metadata?.confidence && aiResponse.metadata.confidence < this.LOW_CONFIDENCE_THRESHOLD) {
                    resultData.needsReview = true;
                    resultData.warningType = 'LOW_AI_CONFIDENCE';

                    warnings.push({
                        type: 'LOW_AI_CONFIDENCE',
                        message: `Slot ${matchingSlot.slotNumber}: Low AI confidence (${(aiResponse.metadata.confidence * 100).toFixed(0)}%)`,
                        slotNumber: matchingSlot.slotNumber,
                        teamName: matchingSlot.teamName
                    });
                }

                // Create result record
                const result = await this.createMatchResult(quickMatchId, userId, resultData);
                createdResults.push(result);
            }

            // 7. Mark result screenshots as processed
            const { unifiedScreenshotService: unifiedService3 } = await import('./unifiedScreenshotService');
            await unifiedService3.markScreenshotsProcessed(quickMatchId, 'RESULT', userId);

            // 8. Update match status
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'COMPLETED',
                processingStep: 'Result Processing Complete',
                warningsCount: (quickMatch.warningsCount || 0) + warnings.length
            });

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Result processing complete: ${createdResults.length} results processed, ${warnings.length} warnings`);

            return {
                success: true,
                resultsProcessed: createdResults.length,
                warnings,
                processingTimeMs
            };

        } catch (error) {
            this.handleError(error, 'Process Results');

            // Update match status to ERROR
            try {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                    processingStep: 'Result Processing Failed'
                });
            } catch (updateError) {
                this.logger.error('Failed to update match status after error:', updateError);
            }

            throw error;
        }
    }

    /**
     * Complete processing flow - runs both attendance and results
     * FULL WORKFLOW
     */
    async processComplete(
        quickMatchId: string,
        userId: string,
        skipAttendance: boolean = false
    ): Promise<CompleteProcessingResult> {
        const startTime = Date.now();

        try {
            this.logger.info(`Starting complete processing for Quick Match ${quickMatchId}`);

            let attendanceResult: AttendanceProcessingResult | undefined;

            // Step 1: Process attendance (if not skipped)
            if (!skipAttendance) {
                attendanceResult = await this.processAttendance(quickMatchId, userId);
                this.logger.info(`Attendance processing complete, proceeding to results...`);
            }

            // Step 2: Process results
            const resultProcessingResult = await this.processResults(quickMatchId, userId);

            const totalProcessingTimeMs = Date.now() - startTime;

            this.logger.info(`Complete processing finished in ${totalProcessingTimeMs}ms`);

            return {
                success: true,
                matchId: quickMatchId,
                attendanceResult,
                resultProcessingResult,
                totalProcessingTimeMs,
                finalStatus: 'COMPLETED'
            };

        } catch (error) {
            this.handleError(error, 'Process Complete');
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
        try {
            // Generate result ID
            const resultId = randomUUID();

            // Create result object
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
                status: 'PROCESSED',
                warningType: data.warningType,
                needsReview: data.needsReview || false,
                aiConfidence: data.aiConfidence,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`quickResult:${resultId}`, result);
            await redis.sadd(`quickMatch:${quickMatchId}:results`, resultId);

            // Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_RESULT', 'CREATE', resultId, result, userId);

            this.logger.info(`Match result created: Slot ${data.slotNumber} - ${data.teamName} - ${data.totalPoints}pts`);

            return result;

        } catch (error) {
            this.handleError(error, 'Create Match Result');
            throw error;
        }
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
                playerResults: dbResult.playerResults ? JSON.parse(JSON.stringify(dbResult.playerResults)) : undefined,
                status: dbResult.status as 'PENDING' | 'PROCESSED' | 'VERIFIED' | 'MANUAL_ENTRY',
                warningType: dbResult.warningType as WarningType | undefined,
                needsReview: dbResult.needsReview,
                aiConfidence: dbResult.aiConfidence || undefined,
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
}

export const quickProcessingService = new QuickProcessingService();