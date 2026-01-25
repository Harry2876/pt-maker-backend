import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
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
    PlayerResult,
    PythonAIAttendanceResponse,
    PythonAIResultResponse
} from '../types/quickResult';
import { quickMatchStateMachine } from './quickMatchStateMachine';
import { quickSeriesService } from './quickSeriesService';
import { QuickMatchStateContext, StateTransitionResult } from '../types/stateMachine';

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
 * Helper method to build state context for validation
 */
    private async buildStateContext(quickMatch: QuickMatchCache, userId: string): Promise<QuickMatchStateContext> {
        // Get counts for validation
        const slots = await quickSlotService.listQuickMatchSlots(quickMatch.id, userId);
        const slotsCount = slots.length;
        const attendanceScreenshots = await unifiedScreenshotService.listScreenshots(
            'quick-pt', quickMatch.id, userId, { type: 'ATTENDANCE' }
        );
        const resultScreenshots = await unifiedScreenshotService.listScreenshots(
            'quick-pt', quickMatch.id, userId, { type: 'RESULT' }
        );

        return {
            id: quickMatch.id,
            currentStatus: quickMatch.status,
            slotsCount,
            attendanceScreenshotsCount: attendanceScreenshots.length,
            resultScreenshotsCount: resultScreenshots.length,
            processingStep: quickMatch.processingStep,
            teamsDetected: quickMatch.teamsDetected
        };
    }

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

            // 1. Verify Quick Match ownership and status
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // Validate state transition first
            const initialStateContext = await this.buildStateContext(quickMatch, userId);
            const validationResult = quickMatchStateMachine.validateTransition(
                quickMatch.status,
                'PROCESSING',
                initialStateContext
            );

            if (!validationResult.isValid) {
                throw new Error(`Cannot process attendance: ${validationResult.errorMessage}`);
            }

            // 2. Get attendance screenshots
            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt',
                quickMatchId,
                userId,
                { type: 'ATTENDANCE', isProcessed: false }
            );

            if (screenshots.length === 0) {
                throw new Error('No attendance screenshots found');
            }

            this.logger.info(`Processing ${screenshots.length} attendance screenshots`);

            // 3. Validate state transition and update status
            const processingStateContext = await this.buildStateContext(quickMatch, userId);
            const transitionResult = await quickMatchStateMachine.executeTransition(
                quickMatchId,
                'PROCESSING',
                processingStateContext
            );

            if (!transitionResult.isValid) {
                throw new Error(`State transition failed: ${transitionResult.errorMessage}`);
            }

            // Update match status after successful validation
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'PROCESSING',
                processingStep: 'Processing Attendance Screenshots'
            });

            this.logger.info(`State transition successful: ${transitionResult.previousState} → ${transitionResult.newState}`);

            // 4. Process each screenshot individually with new single-image API
            const allDetectedSlots: Array<{
                slotNumber: number;
                teamName: string;
                players: string[];
                source: string;
            }> = [];

            let successfulScreenshots = 0;

            for (const screenshot of screenshots) {
                try {
                    this.logger.info(`Processing attendance screenshot: ${screenshot.id}`);

                    // Call Python AI with single image
                    const pythonResponse: PythonAIAttendanceResponse = await pythonAIService.detectAttendance(
                        screenshot.storageUrl
                    );

                    if (pythonResponse.status === 'success' && pythonResponse.data?.cards) {
                        // Process detected cards
                        for (const card of pythonResponse.data.cards) {
                            if (card.slot_number && card.players.length > 0) {
                                // Use first player as team name or construct from players
                                const teamName = card.players[0] || `Team ${card.slot_number}`;

                                allDetectedSlots.push({
                                    slotNumber: card.slot_number,
                                    teamName: teamName.trim(),
                                    players: card.players,
                                    source: screenshot.id
                                });
                            }
                        }

                        successfulScreenshots++;

                        this.logger.info(`Detected ${pythonResponse.data.cards.length} cards from screenshot ${screenshot.id}`);
                    } else {
                        warnings.push({
                            type: 'LOW_AI_CONFIDENCE',
                            message: `Failed to process screenshot ${screenshot.originalName}`,
                            details: { screenshotId: screenshot.id, status: pythonResponse.status }
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error processing screenshot ${screenshot.id}:`, error);
                    warnings.push({
                        type: 'LOW_AI_CONFIDENCE',
                        message: `Error processing screenshot ${screenshot.originalName}`,
                        details: { screenshotId: screenshot.id, error: (error as Error).message }
                    });
                }
            }

            // 5. Merge and deduplicate slots (prefer most recent/highest confidence)
            const slotMap = new Map<number, {
                slotNumber: number;
                teamName: string;
                players: string[];
                sources: string[];
            }>();

            for (const detectedSlot of allDetectedSlots) {
                const existing = slotMap.get(detectedSlot.slotNumber);

                if (!existing) {
                    slotMap.set(detectedSlot.slotNumber, {
                        slotNumber: detectedSlot.slotNumber,
                        teamName: detectedSlot.teamName,
                        players: detectedSlot.players,
                        sources: [detectedSlot.source]
                    });
                } else if (existing.teamName !== detectedSlot.teamName) {
                    // Conflicting team names for same slot
                    warnings.push({
                        type: 'TEAM_NAME_MISMATCH',
                        message: `Slot ${detectedSlot.slotNumber} has conflicting team names`,
                        details: {
                            existing: existing.teamName,
                            detected: detectedSlot.teamName,
                            slotNumber: detectedSlot.slotNumber
                        }
                    });
                } else {
                    // Same team name, just add source
                    existing.sources.push(detectedSlot.source);
                }
            }

            const finalSlots = Array.from(slotMap.values());

            this.logger.info(`Merged into ${finalSlots.length} unique slots after deduplication`);

            // 6. Create slots in database
            let slotsCreated = 0;
            for (const slot of finalSlots) {
                try {
                    const existingSlot = await quickSlotService.getSlotByNumber(quickMatchId, slot.slotNumber);

                    if (!existingSlot) {
                        // Create new slot with correct status
                        await quickSlotService.createSlot(quickMatchId, userId, {
                            slotNumber: slot.slotNumber,
                            teamName: slot.teamName,
                            playerNames: slot.players
                        });
                        slotsCreated++;
                    } else if (!existingSlot.detectedInAttendance) {
                        // Update existing slot with attendance data
                        await quickSlotService.updateSlot(existingSlot.id, userId, {
                            teamName: slot.teamName,
                            detectedInAttendance: true,
                            playerNames: slot.players,
                            status: 'DETECTED'
                        });
                    } else {
                        // Slot already detected - check for conflicts
                        if (existingSlot.teamName !== slot.teamName) {
                            warnings.push({
                                type: 'TEAM_NAME_MISMATCH',
                                message: `Slot ${slot.slotNumber} already exists with different team name`,
                                details: {
                                    existing: existingSlot.teamName,
                                    detected: slot.teamName,
                                    slotNumber: slot.slotNumber
                                }
                            });
                        }
                    }
                } catch (error) {
                    this.logger.error(`Error creating slot ${slot.slotNumber}:`, error);
                    warnings.push({
                        type: 'SLOT_NOT_FOUND',
                        message: `Failed to create slot ${slot.slotNumber}`,
                        details: { slotNumber: slot.slotNumber, error: (error as Error).message }
                    });
                }
            }

            // 7. Mark attendance screenshots as processed
            await unifiedScreenshotService.markScreenshotsProcessed(quickMatchId, 'ATTENDANCE', userId);

            // 8. Validate transition to ATTENDANCE_UPLOADED
            const finalStateContext = await this.buildStateContext(quickMatch, userId);
            finalStateContext.slotsCount = finalSlots.length; // Update with detected slots
            finalStateContext.attendanceScreenshotsCount = screenshots.length;

            const finalTransition = await quickMatchStateMachine.executeTransition(
                quickMatchId,
                'ATTENDANCE_UPLOADED',
                finalStateContext
            );

            if (finalTransition.isValid) {
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ATTENDANCE_UPLOADED',
                    processingStep: 'Attendance Processing Complete',
                    teamsDetected: finalSlots.length,
                    warningsCount: (quickMatch.warningsCount || 0) + warnings.length
                });
                this.logger.info(`Final state transition: ${finalTransition.previousState} → ${finalTransition.newState}`);
            } else {
                this.logger.error(`Final state transition failed: ${finalTransition.errorMessage}`);
                // Keep status as PROCESSING but log completion
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    processingStep: 'Attendance Processing Complete (State Transition Warning)',
                    teamsDetected: finalSlots.length,
                    warningsCount: (quickMatch.warningsCount || 0) + warnings.length
                });
            }

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Attendance processing completed for Quick Match ${quickMatchId}`, {
                slotsDetected: finalSlots.length,
                slotsCreated,
                warnings: warnings.length,
                processingTimeMs
            });

            return {
                success: true,
                slotsDetected: finalSlots.length,
                slotsCreated,
                warnings,
                processingTimeMs,
                confidence: {
                    overall: successfulScreenshots > 0 ? successfulScreenshots / screenshots.length : 0,
                    slotExtraction: successfulScreenshots > 0 ? successfulScreenshots / screenshots.length : 0
                }
            };

        } catch (error) {
            this.logger.error(`Attendance processing failed for Quick Match ${quickMatchId}:`, error);

            // Update match status to error using state machine
            try {
                const currentQuickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
                if (currentQuickMatch) {
                    const errorStateContext = await this.buildStateContext(currentQuickMatch, userId);
                    const errorTransition = await quickMatchStateMachine.executeTransition(
                        quickMatchId,
                        'ERROR',
                        errorStateContext
                    );

                    if (errorTransition.isValid) {
                        await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                            status: 'ERROR',
                            processingStep: `Error: ${(error as Error).message}`
                        });
                        this.logger.info(`Error state transition: ${errorTransition.previousState} → ERROR`);
                    } else {
                        // Fallback - direct update if state machine fails
                        await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                            status: 'ERROR',
                            processingStep: `Error: ${(error as Error).message}`
                        });
                    }
                }
            } catch (stateError) {
                // Fallback - direct update if state machine fails
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                    processingStep: `Error: ${(error as Error).message}`
                }).catch(() => { });
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
        const warnings: Array<{ type: WarningType; message: string; details?: any }> = [];

        try {
            this.logger.info(`Starting result processing for Quick Match ${quickMatchId}`);

            // 1. Verify Quick Match ownership and status
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            if (!['ATTENDANCE_UPLOADED', 'RESULTS_UPLOADED'].includes(quickMatch.status)) {
                throw new Error(`Cannot process results. Current status: ${quickMatch.status}. Please process attendance first.`);
            }

            // 2. Get existing slots to match against
            const slots = await quickSlotService.listQuickMatchSlots(quickMatchId, userId);
            if (slots.length === 0) {
                throw new Error('No teams detected in attendance. Please process attendance first.');
            }

            // 3. Get result screenshots
            const screenshots = await unifiedScreenshotService.listScreenshots(
                'quick-pt',
                quickMatchId,
                userId,
                { type: 'RESULT', isProcessed: false }
            );

            if (screenshots.length === 0) {
                throw new Error('No result screenshots found');
            }

            this.logger.info(`Processing ${screenshots.length} result screenshots`);

            // 4. Update match status to processing
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'PROCESSING',
                processingStep: 'Processing Result Screenshots'
            });

            // 5. Process each screenshot individually with new single-image API
            const allDetectedResults: Array<{
                rank: number;
                players: Array<{ name: string; finish: number }>;
                source: string;
            }> = [];

            let successfulScreenshots = 0;

            for (const screenshot of screenshots) {
                try {
                    this.logger.info(`Processing result screenshot: ${screenshot.id}`);

                    // Call Python AI with single image
                    const pythonResponse: PythonAIResultResponse = await pythonAIService.extractResults(
                        screenshot.storageUrl
                    );

                    if (pythonResponse.status === 'success' && pythonResponse.data?.cards) {
                        // Process detected results
                        for (const card of pythonResponse.data.cards) {
                            // Convert rank to number if it's a string
                            const rankNumber = typeof card.rank === 'string' ? parseInt(card.rank) : card.rank;
                            
                            if (rankNumber && card.players.length > 0) {
                                // Transform OCR format: combine players array with finishes array
                                const transformedPlayers = card.players.map((playerName: string, index: number) => ({
                                    name: playerName,
                                    finish: card.finishes && card.finishes[index] ? card.finishes[index] : 0
                                }));

                                allDetectedResults.push({
                                    rank: rankNumber,
                                    players: transformedPlayers,
                                    source: screenshot.id
                                });
                            }
                        }

                        successfulScreenshots++;

                        this.logger.info(`Detected ${pythonResponse.data.cards.length} results from screenshot ${screenshot.id}`);
                    } else {
                        warnings.push({
                            type: 'LOW_AI_CONFIDENCE',
                            message: `Failed to process screenshot ${screenshot.originalName}`,
                            details: { screenshotId: screenshot.id, status: pythonResponse.status }
                        });
                    }
                } catch (error) {
                    this.logger.error(`Error processing screenshot ${screenshot.id}:`, error);
                    warnings.push({
                        type: 'LOW_AI_CONFIDENCE',
                        message: `Error processing screenshot ${screenshot.originalName}`,
                        details: { screenshotId: screenshot.id, error: (error as Error).message }
                    });
                }
            }

            // 6. Merge and deduplicate results (prefer most recent)
            const rankMap = new Map<number, {
                rank: number;
                players: Array<{ name: string; finish: number }>;
                sources: string[];
            }>();

            for (const detectedResult of allDetectedResults) {
                const existing = rankMap.get(detectedResult.rank);

                if (!existing) {
                    rankMap.set(detectedResult.rank, {
                        rank: detectedResult.rank,
                        players: detectedResult.players,
                        sources: [detectedResult.source]
                    });
                } else {
                    // Same rank detected multiple times, add source
                    existing.sources.push(detectedResult.source);
                }
            }

            const finalResults = Array.from(rankMap.values()).sort((a, b) => a.rank - b.rank);

            this.logger.info(`Merged into ${finalResults.length} unique results after deduplication`);

            // 7. Match results with existing slots and calculate points
            const scoring: ScoringConfig = {
                positionPointsConfig: quickMatch.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0],
                killPointsValue: quickMatch.killPointsValue || 1
            };

            let resultsCreated = 0;
            const createdResults: QuickMatchResultCache[] = [];

            for (const result of finalResults) {
                try {
                    // Extract team name from first player
                    const teamName = result.players[0]?.name || `Rank ${result.rank}`;
                    const totalKills = result.players.reduce((sum, player) => sum + (player.finish || 0), 0);

                    // Find matching slot by team name
                    const matchingSlot = this.findMatchingSlot(slots, teamName);

                    if (!matchingSlot) {
                        warnings.push({
                            type: 'SLOT_NOT_FOUND',
                            message: `Team "${teamName}" in results not found in attendance`,
                            details: { teamName: teamName, rank: result.rank }
                        });
                        continue;
                    }

                    // Calculate points using the points calculator
                    const points = PointsCalculator.calculatePoints(
                        result.rank,
                        totalKills,
                        scoring
                    );

                    // Create result data with all required fields
                    const resultData: CreateQuickMatchResultData = {
                        slotNumber: matchingSlot.slotNumber,
                        teamName: teamName,
                        detectedTeamName: teamName,
                        position: result.rank,
                        rank: result.rank,
                        totalKills: totalKills,
                        positionPoints: points.positionPoints,
                        killPoints: points.killPoints,
                        totalPoints: points.totalPoints,
                        playerResults: result.players.map(p => ({
                            playerName: p.name,
                            kills: p.finish || 0
                        })),
                        needsReview: false,
                        aiConfidence: 0.8  // Default confidence
                    };

                    // Create match result
                    const createdResult = await this.createMatchResult(quickMatchId, userId, resultData);
                    createdResults.push(createdResult);
                    resultsCreated++;

                } catch (error) {
                    this.logger.error(`Error creating result for rank ${result.rank}:`, error);
                    warnings.push({
                        type: 'INVALID_POSITION',
                        message: `Failed to create result for rank ${result.rank}`,
                        details: { rank: result.rank, error: (error as Error).message }
                    });
                }
            }

            // 8. Mark result screenshots as processed
            await unifiedScreenshotService.markScreenshotsProcessed(quickMatchId, 'RESULT', userId);

            // 9. Update match status to completed
            await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                status: 'COMPLETED',
                processingStep: 'Result Processing Complete',
                warningsCount: (quickMatch.warningsCount || 0) + warnings.length
            });

                        // 10. Handle series progression (if match belongs to a series)
            try {
                const series = await quickSeriesService.getSeriesByMatchId(quickMatchId, userId);
                if (series) {
                    this.logger.info(`Match ${quickMatchId} belongs to series ${series.id}, updating series progression`);
                    
                    // Mark this match as completed in series
                    await this.db.quickSeriesMatch.update({
                        where: { quickMatchId },
                        data: { 
                            isCompleted: true,
                            completedAt: new Date()
                        }
                    });

                    // Update series leaderboard with new results
                    await quickSeriesService.updateSeriesLeaderboard(series.id, userId);
                    
                    this.logger.info(`Series ${series.id} progression completed for match ${quickMatchId}`);
                }
            } catch (seriesError) {
                // Don't fail the entire operation if series update fails
                this.logger.warn(`Failed to update series progression for match ${quickMatchId}`, {
                    error: (seriesError as Error).message
                });
            }

            const processingTimeMs = Date.now() - startTime;

            this.logger.info(`Result processing completed for Quick Match ${quickMatchId}`, {
                resultsProcessed: finalResults.length,
                resultsCreated,
                warnings: warnings.length,
                processingTimeMs
            });

            return {
                success: true,
                resultsCreated,
                resultsProcessed: finalResults.length,
                warnings,
                processingTimeMs,
                confidence: {
                    overall: successfulScreenshots > 0 ? successfulScreenshots / screenshots.length : 0,
                    resultExtraction: successfulScreenshots > 0 ? successfulScreenshots / screenshots.length : 0
                }
            };

        } catch (error) {
            this.logger.error(`Result processing failed for Quick Match ${quickMatchId}:`, error);


            // Update match status to error using state machine
            try {
                const currentQuickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
                if (currentQuickMatch) {
                    const errorStateContext = await this.buildStateContext(currentQuickMatch, userId);
                    const errorTransition = await quickMatchStateMachine.executeTransition(
                        quickMatchId,
                        'ERROR',
                        errorStateContext
                    );

                    if (errorTransition.isValid) {
                        await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                            status: 'ERROR',
                            processingStep: `Error: ${(error as Error).message}`
                        });
                        this.logger.info(`Error state transition: ${errorTransition.previousState} → ERROR`);
                    } else {
                        // Fallback - direct update if state machine fails
                        await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                            status: 'ERROR',
                            processingStep: `Error: ${(error as Error).message}`
                        });
                    }
                }
            } catch (stateError) {
                // Fallback - direct update if state machine fails
                await quickMatchService.updateQuickMatch(quickMatchId, userId, {
                    status: 'ERROR',
                    processingStep: `Error: ${(error as Error).message}`
                }).catch(() => { });
            }

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
            dbStatus: 'PENDING_SYNC'
        };

        // Store in Redis
        await redis.hsetObject(`quickResult:${resultId}`, result);
        await redis.sadd(`quickMatch:${quickMatchId}:results`, resultId);

        // Queue database sync with correct entity type
        await QueueService.syncQuickPtImmediately('QUICK_RESULT', 'CREATE', resultId, result, userId);

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
     * Find matching slot for a team name using fuzzy matching
     * Enhanced to handle player-based team identification
     * @private
     */
    private findMatchingSlot(slots: QuickSlotCache[], teamName: string): QuickSlotCache | null {
        const normalizedTeamName = teamName.toLowerCase().trim();

        // 1. Exact match
        let exactMatch = slots.find(slot =>
            slot.teamName?.toLowerCase().trim() === normalizedTeamName
        );
        if (exactMatch) return exactMatch;

        // 2. Check if any player name matches team name (for player-based matching)
        const playerMatch = slots.find(slot => {
            if (!slot.playerNames || slot.playerNames.length === 0) return false;
            
            return slot.playerNames.some(playerName => 
                playerName.toLowerCase().trim() === normalizedTeamName
            );
        });
        if (playerMatch) {
            this.logger.info(`Player-based matched team "${teamName}" with slot "${playerMatch.teamName}"`);
            return playerMatch;
        }

        // 3. Fuzzy matching - check if team name contains slot name or vice versa
        const fuzzyMatch = slots.find(slot => {
            if (!slot.teamName) return false;

            const slotTeamName = slot.teamName.toLowerCase().trim();

            // Check if one contains the other (with minimum length requirement)
            const minLength = Math.min(normalizedTeamName.length, slotTeamName.length);
            if (minLength < 3) return false; // Skip very short names

            return normalizedTeamName.includes(slotTeamName) ||
                slotTeamName.includes(normalizedTeamName);
        });

        if (fuzzyMatch) {
            this.logger.info(`Fuzzy matched team "${teamName}" with slot "${fuzzyMatch.teamName}"`);
        }

        // 4. Advanced fuzzy matching - check if any slot player matches result player
        if (!fuzzyMatch) {
            const advancedMatch = slots.find(slot => {
                if (!slot.playerNames || slot.playerNames.length === 0) return false;
                
                return slot.playerNames.some(slotPlayer => {
                    const normalizedSlotPlayer = slotPlayer.toLowerCase().trim();
                    // Check if player names have common parts (minimum 4 characters)
                    return normalizedSlotPlayer.length >= 4 && 
                           normalizedTeamName.includes(normalizedSlotPlayer.substring(0, 4));
                });
            });
            
            if (advancedMatch) {
                this.logger.info(`Advanced matched team "${teamName}" with slot "${advancedMatch.teamName}"`);
                return advancedMatch;
            }
        }

        return fuzzyMatch || null;
    }
}

export const quickProcessingService = new QuickProcessingService();