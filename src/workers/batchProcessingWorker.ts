import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { ScalableQueues } from "../config/scalableQueues";
import { BatchProcessingJob, CachedBatchResult, TournamentScaleDetector } from "../types/scalableQueue";
import { leaderboardService } from "../services/leaderboardService";
import { teamRegistrationService } from "../services/teamRegistrationService";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class BatchProcessingWorker extends BaseWorker<BatchProcessingJob> {
    private db = db;

    constructor() {
        // Higher concurrency for batch processing
        super(ScalableQueues.BATCH_PROCESSING, { 
            concurrency: 15 // Process multiple batches simultaneously
        });
    }

    protected async processJob(job: Job<BatchProcessingJob>): Promise<any> {
        const { 
            tournamentId, 
            tournamentScale, 
            teamCount,
            teams,
            batchIndex,
            totalBatches,
            operation,
            processingStrategy 
        } = job.data;

        const startTime = Date.now();
        
        logger.info(`🔄 Processing batch ${batchIndex + 1}/${totalBatches} for tournament ${tournamentId}`, {
            operation,
            scale: tournamentScale,
            teamsInBatch: teams.length,
            totalTournamentTeams: teamCount,
            jobId: job.id
        });

        try {
            let result;

            // Process based on operation type
            switch (operation) {
                case 'leaderboard':
                    result = await this.processLeaderboardBatch(job.data);
                    break;
                    
                case 'advancement':
                    result = await this.processAdvancementBatch(job.data);
                    break;
                    
                case 'sync':
                    result = await this.processSyncBatch(job.data);
                    break;
                    
                default:
                    throw new Error(`Unknown batch operation: ${operation}`);
            }

            // Check if this was the final batch and trigger aggregation
            await this.checkAndTriggerBatchCompletion(job.data, result);

            const processingTime = Date.now() - startTime;
            
            logger.info(`✅ Batch ${batchIndex + 1}/${totalBatches} completed`, {
                tournamentId,
                operation,
                processingTime: `${processingTime}ms`,
                teamsProcessed: teams.length
            });

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error(`❌ Batch processing failed`, {
                tournamentId,
                batchIndex: batchIndex + 1,
                totalBatches,
                operation,
                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime}ms`
            });

            throw error;
        }
    }

    /**
     * Process leaderboard calculation for a batch of teams
     */
    private async processLeaderboardBatch(jobData: BatchProcessingJob): Promise<any> {
        const { tournamentId, teams } = jobData;
        
        logger.info(`📊 Processing leaderboard for ${teams.length} teams`);

        // Calculate leaderboard positions for this batch of teams
        const batchResults = [];

        for (const team of teams) {
            try {
                // Get team's match results
                const matchResults = await this.db.matchResult.findMany({
                    where: { teamRegistrationId: team.id,
                        match: { tournamentId }
                     },
                    include: {
                        match: true
                    }
                });

                // Calculate team's total score
                const totalPoints = matchResults.reduce((sum, result) => sum + result.totalMatchPoints, 0);
                const totalKills = matchResults.reduce((sum, result) => sum + result.totalKills, 0);
                const totalMatches = matchResults.length;

                batchResults.push({
                    teamRegistrationId: team.id,
                    teamName: team.teamName,
                    totalPoints,
                    totalKills,
                    totalMatches,
                    averageKills: totalMatches > 0 ? totalKills / totalMatches : 0,
                    batchProcessed: true
                });

            } catch (error) {
                logger.error(`Error processing team ${team.id} in leaderboard batch:`, error);
            }
        }

        // Cache batch results
        await this.cacheBatchResults(jobData.tournamentId, jobData.batchIndex, batchResults);

        return batchResults;
    }

    /**
     * Process team advancement for a batch of teams
     */
    private async processAdvancementBatch(jobData: BatchProcessingJob): Promise<any> {
        const { tournamentId, teams } = jobData;
        
        logger.info(`🎯 Processing advancement for ${teams.length} teams`);

        const advancementResults = [];

        for (const team of teams) {
            try {
                // Determine if team qualifies for next stage
                const qualification = await this.checkTeamQualification(team, tournamentId);
                
                if (qualification.qualifies) {
                    // Update team status
                    await this.db.teamRegistration.update({
                        where: { id: team.id },
                        data: { 
                            registrationStatus: 'QUALIFIED',
                            currentStage: qualification.nextStage
                        }
                    });
                } else {
                    await this.db.teamRegistration.update({
                        where: { id: team.id },
                        data: { registrationStatus: 'ELIMINATED' }
                    });
                }

                advancementResults.push({
                    teamId: team.id,
                    teamName: team.teamName,
                    qualifies: qualification.qualifies,
                    nextStage: qualification.nextStage,
                    eliminationReason: qualification.reason
                });

            } catch (error) {
                logger.error(`Error processing advancement for team ${team.id}:`, error);
            }
        }

        return advancementResults;
    }

    /**
     * Process database sync for a batch of teams
     */
    private async processSyncBatch(jobData: BatchProcessingJob): Promise<any> {
        const { teams } = jobData;
        
        logger.info(`💾 Processing sync for ${teams.length} teams`);

        const syncResults = [];

        // Process teams in smaller sub-batches to avoid database overload
        const subBatchSize = 50;
        for (let i = 0; i < teams.length; i += subBatchSize) {
            const subBatch = teams.slice(i, i + subBatchSize);
            
            try {
                // Batch update teams
                const updatePromises = subBatch.map(team => 
                    this.db.teamRegistration.update({
                        where: { id: team.id },
                        data: { 
                            totalPoints: team.totalPoints || 0,
                            updatedAt: new Date()
                        }
                    })
                );

                await Promise.all(updatePromises);
                
                syncResults.push(...subBatch.map(team => ({
                    teamId: team.id,
                    status: 'synced'
                })));

            } catch (error) {
                logger.error(`Error syncing sub-batch starting at index ${i}:`, error);
            }
        }

        return syncResults;
    }

    /**
     * Check if a team qualifies for advancement
     */
    private async checkTeamQualification(team: any, tournamentId: string): Promise<{
        qualifies: boolean;
        nextStage?: number;
        reason?: string;
    }> {
        // Get tournament configuration
        const tournament = await this.db.tournament.findUnique({
            where: { id: tournamentId },
            include: {
                groups: {
                    where: { id: team.groupId },
                    select: { qualificationSpots: true }
                }
            }
        });

        if (!tournament || !tournament.groups[0]) {
            return { qualifies: false, reason: 'Tournament or group not found' };
        }

        const qualificationSpots = tournament.groups[0].qualificationSpots;

        // Get team's rank in group
        const groupTeams = await this.db.teamRegistration.findMany({
            where: { 
                groupId: team.groupId,
                tournamentId 
            },
            orderBy: { totalPoints: 'desc' }
        });

        const teamRank = groupTeams.findIndex(t => t.id === team.id) + 1;

        if (teamRank <= qualificationSpots) {
            return {
                qualifies: true,
                nextStage: team.currentStage + 1
            };
        } else {
            return {
                qualifies: false,
                reason: `Ranked ${teamRank}/${groupTeams.length}, needed top ${qualificationSpots}`
            };
        }
    }

    /**
     * Cache batch results for later aggregation
     */
    private async cacheBatchResults(
        tournamentId: string, 
        batchIndex: number, 
        results: any[]
    ): Promise<void> {
        const cacheKey = `batch:result:${tournamentId}:${batchIndex}`;
        await redis.setObject(cacheKey, {
            batchIndex,
            results,
            processedAt: new Date().toISOString(),
            resultCount: results.length
        }, 1800); // 30 minutes TTL

        logger.info(`💾 Cached batch results: ${cacheKey} (${results.length} results)`);
    }

    /**
     * Check if all batches are complete and trigger final aggregation
     */
    private async checkAndTriggerBatchCompletion(
        jobData: BatchProcessingJob, 
        result: any
    ): Promise<void> {
        const { tournamentId, batchIndex, totalBatches, operation } = jobData;

        // Mark this batch as complete
        await redis.set(`batch:complete:${tournamentId}:${batchIndex}`, 'true', 1800);

        // Check if all batches are complete
        const completedBatches = [];
        for (let i = 0; i < totalBatches; i++) {
            const isComplete = await redis.get(`batch:complete:${tournamentId}:${i}`);
            if (isComplete) completedBatches.push(i);
        }

        if (completedBatches.length === totalBatches) {
            logger.info(`🎯 All ${totalBatches} batches complete for tournament ${tournamentId}, triggering aggregation`);
            await this.triggerFinalAggregation(tournamentId, operation, totalBatches);
        } else {
            logger.info(`📊 Batch completion: ${completedBatches.length}/${totalBatches} for tournament ${tournamentId}`);
        }
    }

    /**
     * Trigger final aggregation when all batches complete
     */
    private async triggerFinalAggregation(
        tournamentId: string, 
        operation: string, 
        totalBatches: number
    ): Promise<void> {
        try {
            if (operation === 'leaderboard') {
                // Aggregate all batch results into final leaderboard
                await this.aggregateLeaderboardBatches(tournamentId, totalBatches);
            }

            // Clean up batch completion markers
            for (let i = 0; i < totalBatches; i++) {
                await redis.delete(`batch:complete:${tournamentId}:${i}`);
                await redis.delete(`batch:result:${tournamentId}:${i}`);
            }

            logger.info(`🏆 Final aggregation completed for tournament ${tournamentId}`);

        } catch (error) {
            logger.error(`Error in final aggregation for tournament ${tournamentId}:`, error);
        }
    }

    /**
     * Aggregate leaderboard results from all batches
     */
    private async aggregateLeaderboardBatches(
        tournamentId: string, 
        totalBatches: number
    ): Promise<void> {
        const allResults = [];

        // Collect results from all batches
        for (let i = 0; i < totalBatches; i++) {
            const batchResult = await redis.getObject<CachedBatchResult>(`batch:result:${tournamentId}:${i}`);
            if (batchResult && batchResult.results) {
                allResults.push(...batchResult.results);
            }
        }

        // Sort by total points
        allResults.sort((a, b) => b.totalPoints - a.totalPoints);

        // Generate final leaderboard
        const finalLeaderboard = allResults.map((team, index) => ({
            ...team,
            rank: index + 1,
            aggregatedAt: new Date().toISOString()
        }));

        // Cache final leaderboard
        await redis.setObject(
            `leaderboard:tournament:${tournamentId}:final`, 
            finalLeaderboard, 
            3600 // 1 hour TTL
        );

        // Trigger leaderboard service to refresh official leaderboard
        await leaderboardService.generateTournamentLeaderboard(tournamentId);

        logger.info(`📊 Aggregated ${allResults.length} team results into final leaderboard`);
    }
}