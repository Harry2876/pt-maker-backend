import { Job } from "bullmq";
import { BaseWorker } from "./baseWorker";
import { ScalableQueues } from "../config/scalableQueues";
import { LeaderboardBatchJob, TournamentScaleDetector } from "../types/scalableQueue";
import { leaderboardService } from "../services/leaderboardService";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class LeaderboardBatchWorker extends BaseWorker<LeaderboardBatchJob> {
    private db = db;

    constructor() {
        // Moderate concurrency for leaderboard processing
        super(ScalableQueues.LEADERBOARD_BATCH, { 
            concurrency: 10 // Process multiple leaderboards simultaneously
        });
    }

    protected async processJob(job: Job<LeaderboardBatchJob>): Promise<any> {
        const { 
            tournamentId, 
            tournamentScale, 
            teamCount,
            groupIds,
            calculateGlobal,
            forceRefresh,
            stageId,
            processingStrategy 
        } = job.data;

        const startTime = Date.now();
        
        logger.info(`📊 Processing leaderboard batch for tournament ${tournamentId}`, {
            scale: tournamentScale,
            teamCount,
            groupIds: groupIds?.length || 0,
            calculateGlobal,
            stageId,
            strategy: processingStrategy,
            jobId: job.id
        });

        try {
            let result;

            // Choose processing strategy based on scale and requirements
            if (calculateGlobal) {
                result = await this.processGlobalLeaderboard(job.data);
            } else if (groupIds && groupIds.length > 0) {
                result = await this.processGroupLeaderboards(job.data);
            } else if (stageId) {
                result = await this.processStageLeaderboard(job.data);
            } else {
                result = await this.processTournamentLeaderboard(job.data);
            }

            const processingTime = Date.now() - startTime;
            
            logger.info(`✅ Leaderboard batch completed`, {
                tournamentId,
                processingTime: `${processingTime}ms`,
                resultType: result.type,
                entriesProcessed: result.entriesCount
            });

            return result;

        } catch (error) {
            const processingTime = Date.now() - startTime;
            
            logger.error(`❌ Leaderboard batch processing failed`, {
                tournamentId,
                error: error instanceof Error ? error.message : String(error),
                processingTime: `${processingTime}ms`
            });

            throw error;
        }
    }

    /**
     * Process global tournament leaderboard
     */
    private async processGlobalLeaderboard(jobData: LeaderboardBatchJob): Promise<any> {
        const { tournamentId, teamCount, forceRefresh } = jobData;
        
        logger.info(`🌍 Processing global leaderboard for ${teamCount} teams`);

        // Check if we should use batch processing for large tournaments
        if (teamCount > 1000) {
            return await this.processGlobalLeaderboardInBatches(jobData);
        }

        // For smaller tournaments, use existing service
        const leaderboard = await leaderboardService.generateTournamentLeaderboard(tournamentId);
        
        if (leaderboard) {
            // Cache the result with extended TTL for global leaderboards
            await redis.setObject(
                `leaderboard:global:${tournamentId}`, 
                leaderboard, 
                7200 // 2 hours TTL for global leaderboards
            );

            return {
                type: 'global',
                tournamentId,
                entriesCount: leaderboard.entries.length,
                cached: true
            };
        }

        throw new Error('Failed to generate global leaderboard');
    }

    /**
     * Process global leaderboard in batches for very large tournaments
     */
    private async processGlobalLeaderboardInBatches(jobData: LeaderboardBatchJob): Promise<any> {
        const { tournamentId, teamCount } = jobData;
        const batchSize = 500; // Process 500 teams per batch
        const totalBatches = Math.ceil(teamCount / batchSize);
        
        logger.info(`🔄 Processing global leaderboard in ${totalBatches} batches`);

        const allEntries = [];
        
        // Process in batches to avoid memory issues
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const offset = batchIndex * batchSize;
            
            try {
                // Get team registrations for this batch
                const batchTeams = await this.db.teamRegistration.findMany({
                    where: { tournamentId },
                    skip: offset,
                    take: batchSize,
                    include: {
                        matchResults: {
                            include: {
                                match: true
                            }
                        }
                    },
                    orderBy: { totalPoints: 'desc' }
                });

                // Calculate leaderboard entries for this batch
                const batchEntries = await this.calculateBatchLeaderboardEntries(batchTeams);
                allEntries.push(...batchEntries);

                logger.info(`📈 Batch ${batchIndex + 1}/${totalBatches} processed (${batchEntries.length} entries)`);

            } catch (error) {
                logger.error(`Error processing leaderboard batch ${batchIndex}:`, error);
                // Continue with other batches even if one fails
            }
        }

        // Sort final results
        allEntries.sort((a, b) => b.totalPoints - a.totalPoints);

        // Add rankings
        const finalLeaderboard = allEntries.map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));

        // Cache the final result
        await redis.setObject(
            `leaderboard:global:${tournamentId}`, 
            {
                entries: finalLeaderboard,
                generatedAt: new Date().toISOString(),
                tournamentId,
                totalTeams: finalLeaderboard.length
            }, 
            7200 // 2 hours TTL
        );

        return {
            type: 'global_batched',
            tournamentId,
            entriesCount: finalLeaderboard.length,
            batchesProcessed: totalBatches,
            cached: true
        };
    }

    /**
     * Process multiple group leaderboards
     */
    private async processGroupLeaderboards(jobData: LeaderboardBatchJob): Promise<any> {
        const { tournamentId, groupIds } = jobData;
        
        logger.info(`📊 Processing ${groupIds!.length} group leaderboards`);

        const results = [];

        // Process groups in parallel batches
        const concurrentGroups = 5; // Process 5 groups at a time
        for (let i = 0; i < groupIds!.length; i += concurrentGroups) {
            const groupBatch = groupIds!.slice(i, i + concurrentGroups);
            
            const batchPromises = groupBatch.map(async (groupId) => {
                try {
                    const groupLeaderboard = await this.processGroupLeaderboard(tournamentId, groupId);
                    return { groupId, success: true, entries: groupLeaderboard.entries.length };
                } catch (error) {
                    logger.error(`Error processing group ${groupId} leaderboard:`, error);
                    return { groupId, success: false, error: error instanceof Error ? error.message : String(error) };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            logger.info(`📈 Group batch ${i/concurrentGroups + 1} completed`);
        }

        return {
            type: 'groups',
            tournamentId,
            groupsProcessed: results.length,
            successfulGroups: results.filter(r => r.success).length,
            results
        };
    }

    /**
     * Process single group leaderboard
     */
    private async processGroupLeaderboard(tournamentId: string, groupId: string): Promise<any> {
        // Get group teams and their results
        const groupTeams = await this.db.teamRegistration.findMany({
            where: { 
                tournamentId,
                groupId 
            },
            include: {
                matchResults: {
                    include: {
                        match: true
                    }
                }
            },
            orderBy: { totalPoints: 'desc' }
        });

        // Calculate leaderboard entries
        const entries = await this.calculateBatchLeaderboardEntries(groupTeams);

        // Sort by points
        entries.sort((a, b) => b.totalPoints - a.totalPoints);

        // Add rankings
        const rankedEntries = entries.map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));

        const groupLeaderboard = {
            groupId,
            tournamentId,
            entries: rankedEntries,
            generatedAt: new Date().toISOString()
        };

        // Cache group leaderboard
        await redis.setObject(
            `leaderboard:group:${groupId}`, 
            groupLeaderboard, 
            3600 // 1 hour TTL for group leaderboards
        );

        return groupLeaderboard;
    }

    /**
     * Process stage leaderboard
     */
    private async processStageLeaderboard(jobData: LeaderboardBatchJob): Promise<any> {
        const { tournamentId, stageId } = jobData;
        
        logger.info(`🎯 Processing stage leaderboard for stage ${stageId}`);

        // Get all groups in this stage
        const stageGroups = await this.db.group.findMany({
            where: { 
                tournamentId,
                stageId 
            },
            include: {
                teamRegistrations: {
                    include: {
                        matchResults: {
                            include: {
                                match: true
                            }
                        }
                    }
                }
            }
        });

        // Aggregate all teams from all groups in stage
        const allStageTeams = stageGroups.flatMap(group => group.teamRegistrations);

        // Calculate leaderboard entries
        const entries = await this.calculateBatchLeaderboardEntries(allStageTeams);

        // Sort and rank
        entries.sort((a, b) => b.totalPoints - a.totalPoints);
        const rankedEntries = entries.map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));

        const stageLeaderboard = {
            stageId,
            tournamentId,
            entries: rankedEntries,
            generatedAt: new Date().toISOString()
        };

        // Cache stage leaderboard
        await redis.setObject(
            `leaderboard:stage:${stageId}`, 
            stageLeaderboard, 
            5400 // 1.5 hours TTL for stage leaderboards
        );

        return {
            type: 'stage',
            tournamentId,
            stageId,
            entriesCount: rankedEntries.length,
            cached: true
        };
    }

    /**
     * Process regular tournament leaderboard
     */
    private async processTournamentLeaderboard(jobData: LeaderboardBatchJob): Promise<any> {
        const { tournamentId } = jobData;
        
        logger.info(`🏆 Processing tournament leaderboard`);

        // Use existing leaderboard service
        const leaderboard = await leaderboardService.generateTournamentLeaderboard(tournamentId);
        
        if (leaderboard) {
            return {
                type: 'tournament',
                tournamentId,
                entriesCount: leaderboard.entries.length,
                cached: false
            };
        }

        throw new Error('Failed to generate tournament leaderboard');
    }

    /**
     * Calculate leaderboard entries for a batch of teams
     */
    private async calculateBatchLeaderboardEntries(teams: any[]): Promise<any[]> {
        const entries = [];

        for (const team of teams) {
            try {
                // Calculate team statistics
                const matchResults = team.matchResults || [];
                
                const totalMatches = matchResults.length;
                const totalKills = matchResults.reduce((sum: number, result: any) => sum + result.totalKills, 0);
                const totalPoints = matchResults.reduce((sum: number, result: any) => sum + result.totalMatchPoints, 0);
                const positions = matchResults.map((result: any) => result.position);
                
                const wins = matchResults.filter((result: any) => result.position === 1).length;
                const top5Finishes = matchResults.filter((result: any) => result.position <= 5).length;
                const top10Finishes = matchResults.filter((result: any) => result.position <= 10).length;

                entries.push({
                    teamRegistrationId: team.id,
                    teamName: team.teamName,
                    totalMatches,
                    totalKills,
                    totalPoints,
                    averageKills: totalMatches > 0 ? totalKills / totalMatches : 0,
                    averagePosition: positions.length > 0 ? 
                        positions.reduce((a: number, b: number) => a + b, 0) / positions.length : 25,
                    bestPosition: positions.length > 0 ? Math.min(...positions) : 25,
                    wins,
                    top5Finishes,
                    top10Finishes,
                    winRate: totalMatches > 0 ? (wins / totalMatches) * 100 : 0
                });

            } catch (error) {
                logger.error(`Error calculating stats for team ${team.id}:`, error);
            }
        }

        return entries;
    }
}