import { BaseService } from './baseService';
import { GoogleGenerativeAI } from '@google/generative-ai';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { env } from '../config/env';
import {
    AdvancedEngineRequest,
    AdvancedEngineResponse,
    SlotMappingData,
    MatchResultData,
    TeamMappingResult,
    GeminiPromptData,
    GeminiResponse,
    AdvancedEngineError,
    AdvancedEngineConfig,
    ProcessedMatchResult,
    ManualSlotInput
} from '../types/advancedEngine';
import { MatchCache, UpdateMatchData } from '../types/match';
// Add these imports after the existing ones
import { matchResultService } from './matchResultService';
import { leaderboardService } from './leaderboardService';
import { TeamMatchResult, CreateMatchResultData } from '../types/matchResult';
import { SlotAssignmentCache } from '../types/slotAssignment';
import { TournamentCache } from '../types/tournament';

export class AdvancedEngineService extends BaseService {
    private genAI: GoogleGenerativeAI;
    private config: AdvancedEngineConfig;

    constructor() {
        super();

        if (!env.GOOGLE_GEMINI_API_KEY) {
            throw new Error('GOOGLE_GEMINI_API_KEY is required for Advanced Engine');
        }

        this.genAI = new GoogleGenerativeAI(env.GOOGLE_GEMINI_API_KEY);
        this.config = {
            enabled: env.ADVANCED_ENGINE_ENABLED,
            geminiApiKey: env.GOOGLE_GEMINI_API_KEY,
            model: env.GEMINI_MODEL,
            textModel: env.GEMINI_TEXT_MODEL,
            maxImagesPerBatch: env.ADVANCED_ENGINE_MAX_IMAGES_PER_BATCH,
            timeout: env.ADVANCED_ENGINE_TIMEOUT,
            retryAttempts: 3,
            confidenceThreshold: 0.7
        };
    }

    // Main processing method
    async processScreenshots(request: AdvancedEngineRequest, userId: string): Promise<AdvancedEngineResponse> {
        const startTime = Date.now();
        const processingId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            //verify match ownership
            const match = await redis.hgetObject<MatchCache>(`match:${request.matchId}`);
            if (match) {
                const tournament = await redis.hgetObject<TournamentCache>(`tournament:${match.tournamentId}`);
                if (!tournament || tournament.userId !== userId) {
                    throw new Error('Unauthorized: You do not own this match');
                }
            } else {
                const dbMatch = await this.db.match.findFirst({
                    where: {
                        id: request.matchId,
                        tournament: { userId }
                    }
                });

                if (!dbMatch) {
                    throw new Error('Unauthorized: You do not own this match');
                }
            }
            this.logger.info(`Starting screenshot processing for match ${request.matchId}`, {
                processingId,
                type: request.processingType
            });

            // Extract slot mappings
            let slotMappings: SlotMappingData[] = [];
            if (request.processingType === 'FULL_AUTO' || request.processingType === 'MANUAL_SLOTS') {
                if (request.processingType === 'MANUAL_SLOTS' && request.manualSlots) {
                    slotMappings = this.convertManualSlotsToMappings(request.manualSlots);
                } else if (request.screenshots.slotScreenshots.length > 0) {
                    slotMappings = await this.extractSlotMappings(request.screenshots.slotScreenshots);
                }
            }

            // Extract match results
            let results: MatchResultData[] = [];
            if (request.screenshots.resultScreenshots.length > 0) {
                results = await this.extractMatchResults(request.screenshots.resultScreenshots);
            }

            // Map teams and calculate final data
            const teamMappings = this.mapTeamsToResults(slotMappings, results);

            // Calculate confidence scores
            const confidence = this.calculateConfidence(slotMappings, results, teamMappings);

            // Store processed data
            await this.storeProcessedData({
                processingId,
                matchId: request.matchId,
                slotMappings,
                results,
                teamMappings,
                confidence: confidence.overall
            }, userId);

            const response: AdvancedEngineResponse = {
                success: true,
                processingId,
                extractedData: {
                    slotMappings,
                    results,
                    teamMappings
                },
                confidence,
                processingTime: Date.now() - startTime
            };

            this.logger.info(`Screenshot processing completed`, {
                processingId,
                processingTime: response.processingTime,
                confidence: confidence.overall
            });

            return response;

        } catch (error) {
            this.logger.error(`Screenshot processing failed for match ${request.matchId}:`, error);
            return {
                success: false,
                processingId,
                extractedData: {
                    slotMappings: [],
                    results: [],
                    teamMappings: []
                },
                confidence: {
                    overall: 0,
                    slotExtraction: 0,
                    resultExtraction: 0
                },
                processingTime: Date.now() - startTime,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }

    // Extract slot mappings from slot assignment screenshots
    private async extractSlotMappings(imageUrls: string[]): Promise<SlotMappingData[]> {
        const slotMappings: SlotMappingData[] = [];

        for (const imageUrl of imageUrls) {
            try {
                const geminiResponse = await this.processImageWithGemini({
                    imageType: 'SLOT_ASSIGNMENT',
                    imageUrl,
                    context: {
                        expectedSlots: 25 // Default for most tournaments
                    }
                });

                if (geminiResponse.success && geminiResponse.extractedData) {
                    const mappings = this.parseSlotMappings(geminiResponse.extractedData);
                    slotMappings.push(...mappings);
                }
            } catch (error) {
                this.logger.error(`Failed to extract slots from image ${imageUrl}:`, error);
            }
        }

        return slotMappings;
    }

    // Extract match results from result screenshots
    private async extractMatchResults(imageUrls: string[]): Promise<MatchResultData[]> {
        const results: MatchResultData[] = [];

        for (const imageUrl of imageUrls) {
            try {
                const geminiResponse = await this.processImageWithGemini({
                    imageType: 'MATCH_RESULTS',
                    imageUrl
                });

                if (geminiResponse.success && geminiResponse.extractedData) {
                    const matchResults = this.parseMatchResults(geminiResponse.extractedData);
                    results.push(...matchResults);
                }
            } catch (error) {
                this.logger.error(`Failed to extract results from image ${imageUrl}:`, error);
            }
        }

        return results;
    }

    // Process image with Gemini AI
    private async processImageWithGemini(promptData: GeminiPromptData): Promise<GeminiResponse> {
        const startTime = Date.now();

        try {
            const model = this.genAI.getGenerativeModel({ model: this.config.model });

            // Fetch image
            const imageResponse = await fetch(promptData.imageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
            }

            const imageBuffer = await imageResponse.arrayBuffer();
            const imageBase64 = Buffer.from(imageBuffer).toString('base64');

            // Create prompt based on image type
            const prompt = this.createPrompt(promptData);

            // Process with Gemini
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: imageBase64,
                        mimeType: 'image/jpeg'
                    }
                }
            ]);

            const response = await result.response;
            const text = response.text();

            // Parse JSON response
            let extractedData;
            try {
                extractedData = JSON.parse(text);
            } catch (parseError) {
                this.logger.error('Failed to parse Gemini response as JSON:', text);
                throw new Error('Invalid JSON response from Gemini');
            }

            return {
                success: true,
                extractedData,
                confidence: this.calculateGeminiConfidence(extractedData),
                processingTime: Date.now() - startTime,
                rawResponse: text
            };

        } catch (error) {
            this.logger.error('Gemini processing failed:', error);
            return {
                success: false,
                extractedData: null,
                confidence: 0,
                processingTime: Date.now() - startTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // Create appropriate prompt for different image types
    private createPrompt(promptData: GeminiPromptData): string {
        if (promptData.imageType === 'SLOT_ASSIGNMENT') {
            return `Analyze this BGMI tournament slot assignment screenshot and extract the team slot information. 
            Return a JSON array with the following structure:
            [
                {
                    "slot_number": "1",
                    "player_names": ["Player1", "Player2", "Player3", "Player4"]
                }
            ]
            
            Extract all visible slot numbers and their corresponding player names. 
            Ensure slot_number is a string and player_names is an array of strings.
            Only return valid JSON without any additional text or formatting.`;
        }

        if (promptData.imageType === 'MATCH_RESULTS') {
            return `Analyze this BGMI match result screenshot and extract the team rankings and finish counts.
            Return a JSON array with the following structure:
            [
                {
                    "rank": 1,
                    "players": [
                        {
                            "name": "PlayerName",
                            "finishes": 5
                        }
                    ]
                }
            ]
            
            Extract all team rankings, player names, and their kill/finish counts.
            Rank should be a number, player names should be strings, and finishes should be numbers.
            Only return valid JSON without any additional text or formatting.`;
        }

        return 'Analyze this tournament screenshot and extract relevant data as JSON.';
    }

    // Parse slot mappings from Gemini response
    private parseSlotMappings(data: any): SlotMappingData[] {
        if (!Array.isArray(data)) {
            this.logger.warn('Gemini slot response is not an array');
            return [];
        }

        return data.filter(item =>
            item.slot_number &&
            Array.isArray(item.player_names) &&
            item.player_names.length > 0
        );
    }

    // Parse match results from Gemini response
    private parseMatchResults(data: any): MatchResultData[] {
        if (!Array.isArray(data)) {
            this.logger.warn('Gemini result response is not an array');
            return [];
        }

        return data.filter(item =>
            typeof item.rank === 'number' &&
            Array.isArray(item.players) &&
            item.players.length > 0
        );
    }

    // Convert manual slot inputs to slot mappings
    private convertManualSlotsToMappings(manualSlots: ManualSlotInput[]): SlotMappingData[] {
        return manualSlots.map(slot => ({
            slot_number: slot.slotNumber,
            player_names: slot.playerNames || [slot.teamName]
        }));
    }

    // Map slot assignments to match results
    private mapTeamsToResults(slotMappings: SlotMappingData[], results: MatchResultData[]): TeamMappingResult[] {
        const teamMappings: TeamMappingResult[] = [];

        for (const slot of slotMappings) {
            // Find matching result by player names
            const matchingResult = results.find(result =>
                result.players.some(player =>
                    slot.player_names.some(slotPlayer =>
                        this.fuzzyMatch(player.name, slotPlayer)
                    )
                )
            );

            const teamMapping: TeamMappingResult = {
                slotNumber: slot.slot_number,
                teamName: slot.player_names[0], // Use first player as team name if no specific team name
                players: slot.player_names,
                finalRank: matchingResult?.rank,
                totalKills: matchingResult?.players.reduce((sum, p) => sum + p.finishes, 0),
                points: this.calculatePoints(matchingResult?.rank, matchingResult?.players.reduce((sum, p) => sum + p.finishes, 0))
            };

            teamMappings.push(teamMapping);
        }

        return teamMappings;
    }

    // Fuzzy string matching for player names
    private fuzzyMatch(str1: string, str2: string, threshold: number = 0.8): boolean {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();

        if (s1 === s2) return true;
        if (s1.includes(s2) || s2.includes(s1)) return true;

        // Levenshtein distance based similarity
        const distance = this.levenshteinDistance(s1, s2);
        const maxLength = Math.max(s1.length, s2.length);
        const similarity = 1 - (distance / maxLength);

        return similarity >= threshold;
    }

    // Calculate Levenshtein distance
    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,     // deletion
                    matrix[j - 1][i] + 1,     // insertion
                    matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }

        return matrix[str2.length][str1.length];
    }

    // Calculate points based on rank and kills
    private calculatePoints(rank?: number, kills?: number): number {
        if (!rank || !kills) return 0;

        // Standard BGMI tournament scoring
        const rankPoints = Math.max(0, 21 - rank); // 20 points for 1st, 19 for 2nd, etc.
        const killPoints = kills;

        return rankPoints + killPoints;
    }

    // Calculate confidence scores
    private calculateConfidence(slotMappings: SlotMappingData[], results: MatchResultData[], teamMappings: TeamMappingResult[]) {
        const slotConfidence = slotMappings.length > 0 ?
            slotMappings.filter(s => s.player_names.length >= 2).length / slotMappings.length : 0;

        const resultConfidence = results.length > 0 ?
            results.filter(r => r.players.length > 0 && r.rank > 0).length / results.length : 0;

        const mappingConfidence = teamMappings.length > 0 ?
            teamMappings.filter(t => t.finalRank !== undefined).length / teamMappings.length : 0;

        const overall = (slotConfidence + resultConfidence + mappingConfidence) / 3;

        return {
            overall,
            slotExtraction: slotConfidence,
            resultExtraction: resultConfidence
        };
    }

    // Calculate Gemini response confidence
    private calculateGeminiConfidence(data: any): number {
        if (!data || !Array.isArray(data)) return 0;
        if (data.length === 0) return 0;

        // Check completeness of data
        const validItems = data.filter(item => {
            if (item.slot_number && item.player_names) {
                return item.player_names.length > 0;
            }
            if (item.rank && item.players) {
                return item.players.length > 0 && item.players.every((p: any) => p.name && typeof p.finishes === 'number');
            }
            return false;
        });

        return validItems.length / data.length;
    }

    // Store processed data in database
    private async storeProcessedData(data: {
        processingId: string;
        matchId: string;
        slotMappings: SlotMappingData[];
        results: MatchResultData[];
        teamMappings: TeamMappingResult[];
        confidence: number;
    }, userId: string): Promise<void> {
        try {
            // 1. Store in cache for quick access
            const cacheKey = `processed_match:${data.matchId}:${data.processingId}`;
            await redis.setObject(cacheKey, data, 3600); // 1 hour cache

            // 2. Get current match (following MatchService.updateMatch pattern)
            const currentMatch = await redis.hgetObject<MatchCache>(`match:${data.matchId}`);
            if (!currentMatch) {
                throw new Error('Match not found in cache');
            }

            // 3. Create update data object (following MatchService.updateMatch pattern)
            const updateData: UpdateMatchData = {
                processedData: {
                    processingId: data.processingId,
                    slotMappings: data.slotMappings,
                    results: data.results,
                    teamMappings: data.teamMappings,
                    confidence: data.confidence,
                    processedAt: new Date().toISOString()
                },
                status: 'PROCESSED'
            };

            // 4. Create updated match object (following MatchService.updateMatch pattern)
            const updatedMatch = {
                ...currentMatch,
                ...updateData,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Update Redis immediately (following MatchService.updateMatch pattern)
            await redis.hsetObject(`match:${data.matchId}`, updatedMatch);

            // 6. Queue database sync (following MatchService.updateMatch pattern)
            await QueueService.queueDatabaseSync({
                type: 'MATCH_UPDATE',
                entityId: data.matchId,
                data: updateData,
                userId,
                priority: 'HIGH',
                timestamp: new Date().toISOString()
            });

                        // 7. Invalidate related caches (following MatchService.updateMatch pattern)
            await redis.delete(`tournament:${currentMatch.tournamentId}:matches:list`);
            if (currentMatch.groupId) {
                await redis.delete(`group:${currentMatch.groupId}:matches:list`);
            }

            // 8. Create MatchResult entries from AI data (NEW CODE)
            if (data.teamMappings && data.teamMappings.length > 0 && currentMatch.groupId) {
                await this.createMatchResultsAutomatically(
                    data.teamMappings,
                    data.matchId,
                    currentMatch.groupId,
                    userId
                );
            }

            this.logger.info(`Stored processed data for match ${data.matchId} and queued for database sync`, {
                processingId: data.processingId,
                confidence: data.confidence
            });
        } catch (error) {
            this.logger.error('Failed to store processed data:', error);
        }
    }

    private async getTeamRegistrationFromSlot(groupId: string, slotNumber: number): Promise<{ teamRegistrationId: string; teamName: string } | null> {
        try {
            //get slot assignment from redis
            const slot = await redis.hgetObject<SlotAssignmentCache>(`slot:${groupId}:${slotNumber}`);

            if (!slot || !slot.teamRegistrationId) {
                this.logger.warn(`No slot assignment found for group ${groupId} slot ${slotNumber}`);
                return null;
            }

            return {
                teamRegistrationId: slot.teamRegistrationId,
                teamName: slot.teamName || 'Unknown Team'
            };
        } catch (error) {
            this.logger.error('Failed to get team registration from slot:', error);
            return null;
        }
    }

    // Create MatchResult entries from AI processing results
    private async createMatchResultsAutomatically(
        teamMappings: TeamMappingResult[],
        matchId: string,
        groupId: string,
        userId: string
    ): Promise<void> {
        try {
            this.logger.info(`Creating match results from data for ${teamMappings.length} teams`);

            const teamResults: TeamMatchResult[] = [];

            // Convert each team mapping to TeamMatchResult format
            for (const mapping of teamMappings) {
                // Get team registration info from slot
                const teamInfo = await this.getTeamRegistrationFromSlot(groupId, parseInt(mapping.slotNumber));

                if (!teamInfo) {
                    this.logger.warn(`Skipping slot ${mapping.slotNumber} - no team assigned`);
                    continue;
                }

                // Create TeamMatchResult object
                const teamResult: TeamMatchResult = {
                    teamRegistrationId: teamInfo.teamRegistrationId,
                    teamName: mapping.teamName || teamInfo.teamName,
                    slotNumber: parseInt(mapping.slotNumber),
                    position: mapping.finalRank || 25, // Default to last place if no rank
                    kills: mapping.totalKills || 0,
                    damage: 0, // Not provided by AI, set to 0
                    survivalTime: 0, // Not provided by AI, set to 0
                    totalScore: mapping.points || 0,
                    scoreBreakdown: [
                        {
                            ruleName: 'Automatic_Processing',
                            ruleType: 'ADVANCED_ENGINE',
                            points: mapping.points || 0,
                            calculation: `Position: ${mapping.finalRank}, Kills: ${mapping.totalKills}`
                        }
                    ],
                    aiDetected: true,
                    manuallyEdited: false,
                    confidence: 0.85 // Use overall confidence or individual team confidence
                };

                teamResults.push(teamResult);
            }

            if (teamResults.length > 0) {
                // Create match result using existing service
                const createData: CreateMatchResultData = {
                    matchId,
                    teamResults,
                    notes: `AI processed results - ${teamResults.length} teams detected`
                };

                const result = await matchResultService.createMatchResult(createData, userId);

                if (result) {
                    this.logger.info(`Successfully created match result with ${teamResults.length} team results`);

                    // Trigger leaderboard refresh
                    await this.refreshLeaderboards(matchId);
                } else {
                    this.logger.error('Failed to create match result from AI data');
                }
            } else {
                this.logger.warn('No valid team results to create from AI data');
            }

        } catch (error) {
            this.logger.error('Error creating match results from AI data:', error);
        }
    }

    // Refresh leaderboards after match result creation
    private async refreshLeaderboards(matchId: string): Promise<void> {
        try {
            // Get match info to find tournament and group
            const match = await redis.hgetObject<MatchCache>(`match:${matchId}`);
            if (!match) {
                this.logger.error(`Match ${matchId} not found for leaderboard refresh`);
                return;
            }

            // Refresh tournament leaderboard
            if (match.tournamentId) {
                const refreshConfig = {
                    includeGroups: match.groupId ? [match.groupId] : [],
                    forceRefresh: true,
                    notifyTeams: false
                };

                await leaderboardService.refreshLeaderboard(match.tournamentId, refreshConfig);
                this.logger.info(`Refreshed leaderboard for tournament ${match.tournamentId}`);
            }

            // Invalidate group leaderboard cache if group exists
            if (match.groupId) {
                await redis.delete(`leaderboard:group:${match.groupId}`);
                this.logger.info(`Invalidated group leaderboard cache for group ${match.groupId}`);
            }

        } catch (error) {
            this.logger.error('Error refreshing leaderboards:', error);
        }
    }

    // Get processed data
    async getProcessedData(matchId: string, processingId?: string): Promise<ProcessedMatchResult | null> {
        try {
            if (processingId) {
                const cacheKey = `processed_match:${matchId}:${processingId}`;
                const cached = await redis.getObject<ProcessedMatchResult>(cacheKey);
                if (cached) {
                    return cached;
                }
            }

            // If no cache hit, could query database here
            return null;
        } catch (error) {
            this.logger.error('Failed to get processed data:', error);
            return null;
        }
    }

    // Validate processing request
    validateRequest(request: AdvancedEngineRequest): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!request.matchId) {
            errors.push('matchId is required');
        }

        if (!request.processingType || !['FULL_AUTO', 'MANUAL_SLOTS', 'RESULTS_ONLY'].includes(request.processingType)) {
            errors.push('Invalid processingType');
        }

        if (request.processingType === 'MANUAL_SLOTS' && (!request.manualSlots || request.manualSlots.length === 0)) {
            errors.push('manualSlots required for MANUAL_SLOTS processing');
        }

        if (!request.screenshots || (!request.screenshots.slotScreenshots.length && !request.screenshots.resultScreenshots.length)) {
            errors.push('At least one screenshot is required');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Get job status by delegating to QueueService
    async getJobStatus(jobId: string): Promise<any> {
        try {
            const { QueueService } = await import('./queueService');
            return await QueueService.getAdvancedEngineJobStatus(jobId);
        } catch (error) {
            this.logger.error('Failed to get job status:', error);
            return { status: 'ERROR', error: 'Failed to retrieve job status' };
        }
    }

    // Get match processing status by delegating to QueueService
    async getMatchProcessingStatus(matchId: string): Promise<any> {
        try {
            const { QueueService } = await import('./queueService');
            return await QueueService.getMatchProcessingStatus(matchId);
        } catch (error) {
            this.logger.error('Failed to get match processing status:', error);
            return { status: 'ERROR', error: 'Failed to retrieve match processing status' };
        }
    }
}

export const advancedEngineService = new AdvancedEngineService();