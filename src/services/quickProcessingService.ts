import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
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
        // TODO: Re-implement with new Python API endpoint
        throw new Error('Not implemented: pending new Python API integration');
    }

    /**
     * Process result screenshots - extracts team results and calculates points
     * STEP 2: Result Processing
     */
    async processResults(
        quickMatchId: string,
        userId: string
    ): Promise<ResultProcessingResult> {
        // TODO: Re-implement with new Python API endpoint
        throw new Error('Not implemented: pending new Python API integration');
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