import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { leaderboardService } from './leaderboardService';
import { teamRegistrationService } from './teamRegistrationService';
import { groupService } from './groupService';
import {
    TeamQualificationCriteria,
    QualifiedTeam,
    GroupQualificationResult,
    StageQualificationResult,
    EliminatedTeam,
    StageProgressionConfig,
    StageProgressionResult,
    GroupTeamAssignment,
    TeamDistributionStrategy
} from '../types/teamAdvancement';
import { TournamentCache, TournamentStageCache } from '../types/tournament';
import { GroupCache } from '../types/group';
import { TeamRegistrationCache } from '../types/teamRegistration';
import { MatchResultCache } from '../types/matchResult';
import { randomUUID } from 'crypto';
import { waitForAllDbSync } from '../utils/dbSyncHelper';

export class TeamQualificationService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Qualify teams from all groups in a stage
    async qualifyTeamsFromStage(stageId: string, userId: string): Promise<StageQualificationResult | null> {
        try {
            // 1. Get stage info
            const stage = await redis.hgetObject<TournamentStageCache>(`stage:${stageId}`);
            if (!stage) {
                throw new Error('Stage not found');
            }

            // 2. Verify tournament access
            const tournament = await redis.hgetObject<TournamentCache>(`tournament:${stage.tournamentId}`);
            if (!tournament || tournament.userId !== userId) {
                throw new Error('Access denied');
            }

            // 3. Get all groups in this stage
            const stageGroups = await this.getStageGroups(stageId);
            
            if (stageGroups.length === 0) {
                throw new Error('No groups found for this stage');
            }

            await this.ensureStageResultsSynced(stageGroups);

            await leaderboardService.refreshLeaderboard(stage.tournamentId, {
                forceRefresh: true,
                includeGroups: stageGroups.map(group => group.id)
            });

            // 4. Process qualification for each group
            const groupResults: GroupQualificationResult[] = [];
            let totalTeamsQualified = 0;
            let totalTeamsStarted = 0;

            for (const group of stageGroups) {
                const groupResult = await this.qualifyTeamsFromGroup(
                    group.id, 
                    {
                        qualificationSpots: group.qualificationSpots,
                        qualificationMethod: 'TOP_POINTS',
                        tieBreakingRules: [
                            { priority: 1, method: 'TOTAL_KILLS' },
                            { priority: 2, method: 'BEST_POSITION' }
                        ]
                    }
                );

                if (groupResult) {
                    groupResults.push(groupResult);
                    totalTeamsQualified += groupResult.qualifiedTeams.length;
                    totalTeamsStarted += groupResult.totalTeams;
                }
            }

            // 5. Calculate qualification summary
            const averagePointsToQualify = this.calculateAverageQualificationPoints(groupResults);

            const stageResult: StageQualificationResult = {
                stageId,
                stageName: stage.name,
                totalGroups: stageGroups.length,
                totalTeamsStarted,
                totalTeamsQualified,
                groupResults,
                qualificationSummary: {
                    teamsAdvanced: totalTeamsQualified,
                    teamsEliminated: totalTeamsStarted - totalTeamsQualified,
                    averagePointsToQualify
                }
            };

            // 6. Cache the result
            await redis.setObject(`stage:${stageId}:qualification:result`, stageResult, this.CACHE_TTL);

            this.logger.info(`Teams qualified from stage ${stageId}: ${totalTeamsQualified}/${totalTeamsStarted}`);
            return stageResult;

        } catch (error) {
            this.handleError(error, 'Qualify teams from stage');
            return null;
        }
    }

    // Qualify teams from a single group
    async qualifyTeamsFromGroup(groupId: string, criteria: TeamQualificationCriteria): Promise<GroupQualificationResult | null> {
        try {
            // 1. Get group info
            const group = await redis.hgetObject<GroupCache>(`group:${groupId}`);
            if (!group) {
                throw new Error('Group not found');
            }

            // 2. Get group leaderboard (teams ranked by points)
            const leaderboard = await leaderboardService.generateGroupLeaderboard(groupId);
            if (!leaderboard) {
                throw new Error('Could not generate group leaderboard');
            }

            // 3. Apply qualification logic
            const { qualified, eliminated } = this.applyQualificationCriteria(
                leaderboard.entries,
                criteria,
                groupId,
                group.name
            );

            // 4. Update team registration statuses
            await this.updateTeamStatuses(qualified, eliminated);

            const groupResult: GroupQualificationResult = {
                groupId,
                groupName: group.name,
                totalTeams: leaderboard.entries.length,
                qualificationSpots: criteria.qualificationSpots,
                qualifiedTeams: qualified,
                eliminatedTeams: eliminated
            };

            this.logger.info(`Group ${groupId} qualification: ${qualified.length} qualified, ${eliminated.length} eliminated`);
            return groupResult;

        } catch (error) {
            this.handleError(error, 'Qualify teams from group');
            return null;
        }
    }

    // Progress teams to next stage (following organizer's structure)
    async progressTeamsToNextStage(
        currentStageId: string, 
        nextStageId: string,
        distributionStrategy: TeamDistributionStrategy,
        userId: string
    ): Promise<StageProgressionResult | null> {
        try {
            // 1. Get qualification results from current stage
            const qualificationResult = await redis.getObject<StageQualificationResult>(
                `stage:${currentStageId}:qualification:result`
            );
            
            if (!qualificationResult) {
                throw new Error('No qualification results found. Please qualify teams first.');
            }

            // 2. Get next stage configuration (created by organizer)
            const nextStage = await redis.hgetObject<TournamentStageCache>(`stage:${nextStageId}`);
            if (!nextStage) {
                throw new Error('Next stage not found. Please create the next stage first.');
            }

            // 3. Get next stage groups (created by organizer)
            const nextStageGroups = await this.getStageGroups(nextStageId);
            if (nextStageGroups.length === 0) {
                throw new Error('No groups found in next stage. Please create groups first.');
            }

            // 4. Collect all qualified teams
            const allQualifiedTeams = qualificationResult.groupResults.flatMap(
                result => result.qualifiedTeams
            );

            if (allQualifiedTeams.length === 0) {
                throw new Error('No qualified teams found for progression');
            }

            // 5. Distribute teams into existing groups (following organizer's structure)
            const teamDistribution = await this.distributeTeamsIntoExistingGroups(
                allQualifiedTeams,
                nextStageGroups,
                distributionStrategy
            );

            // 6. Update team registrations with new group assignments
            await this.updateTeamGroupAssignments(teamDistribution);

            // 7. Create progression result
            const progressionResult: StageProgressionResult = {
                fromStage: {
                    stageId: currentStageId,
                    stageName: qualificationResult.stageName,
                    totalTeamsQualified: allQualifiedTeams.length
                },
                toStage: {
                    stageId: nextStageId,
                    stageName: nextStage.name,
                    totalGroups: nextStageGroups.length,
                    maxTeamsPerGroup: nextStageGroups[0]?.maxTeams || 25
                },
                teamDistribution,
                progressionSummary: {
                    teamsAdvanced: allQualifiedTeams.length,
                    newGroupsPopulated: teamDistribution.length,
                    averageTeamsPerGroup: Math.round(allQualifiedTeams.length / teamDistribution.length),
                    managementSlotsReserved: teamDistribution.reduce((sum, group) => sum + group.managementSlots, 0)
                }
            };

            // 8. Cache the progression result
            await redis.setObject(
                `stage:${currentStageId}:progression:result`, 
                progressionResult, 
                this.CACHE_TTL
            );

            this.logger.info(`Teams progressed from stage ${currentStageId} to ${nextStageId}: ${allQualifiedTeams.length} teams distributed`);
            return progressionResult;

        } catch (error) {
            this.handleError(error, 'Progress teams to next stage');
            return null;
        }
    }

    // Apply qualification criteria to team list
    private applyQualificationCriteria(
        teamEntries: any[], 
        criteria: TeamQualificationCriteria,
        groupId: string,
        groupName: string
    ): { qualified: QualifiedTeam[], eliminated: EliminatedTeam[] } {
        
        // Sort teams based on qualification method
        const sortedTeams = this.sortTeamsByCriteria(teamEntries, criteria);
        
        const qualified: QualifiedTeam[] = [];
        const eliminated: EliminatedTeam[] = [];

        sortedTeams.forEach((team, index) => {
            const position = index + 1;
            
            if (position <= criteria.qualificationSpots) {
                qualified.push({
                    teamRegistrationId: team.teamRegistrationId,
                    teamName: team.teamName,
                    finalGroupPosition: position,
                    totalPoints: team.totalPoints,
                    totalKills: team.totalKills,
                    fromGroupId: groupId,
                    fromGroupName: groupName,
                    qualificationReason: `Qualified as #${position} (Top ${criteria.qualificationSpots})`
                });
            } else {
                eliminated.push({
                    teamRegistrationId: team.teamRegistrationId,
                    teamName: team.teamName,
                    finalGroupPosition: position,
                    totalPoints: team.totalPoints,
                    eliminationReason: `Eliminated at #${position} (Only top ${criteria.qualificationSpots} qualify)`
                });
            }
        });

        return { qualified, eliminated };
    }

    // Sort teams based on qualification criteria
    private sortTeamsByCriteria(teams: any[], criteria: TeamQualificationCriteria): any[] {
        return teams.sort((a, b) => {
            // Primary sort by total points (descending)
            if (a.totalPoints !== b.totalPoints) {
                return b.totalPoints - a.totalPoints;
            }

            // Apply tie-breaking rules
            for (const rule of criteria.tieBreakingRules) {
                const comparison = this.applyTieBreakingRule(a, b, rule.method);
                if (comparison !== 0) {
                    return comparison;
                }
            }

            return 0; // Complete tie
        });
    }

    // Apply individual tie-breaking rule
    private applyTieBreakingRule(teamA: any, teamB: any, method: string): number {
        switch (method) {
            case 'TOTAL_KILLS':
                return teamB.totalKills - teamA.totalKills;
            case 'BEST_POSITION':
                return teamA.bestPosition - teamB.bestPosition; // Lower position is better
            case 'WINS':
                return teamB.wins - teamA.wins;
            case 'HEAD_TO_HEAD':
                // TODO: Implement head-to-head comparison if needed
                return 0;
            default:
                return 0;
        }
    }

    // Update team registration statuses after qualification
    private async updateTeamStatuses(qualified: QualifiedTeam[], eliminated: EliminatedTeam[]) {
        try {
            // Update qualified teams
            for (const team of qualified) {
                await teamRegistrationService.updateTeamRegistration(
                    team.teamRegistrationId,
                    'system',
                    {
                        registrationStatus: 'QUALIFIED',
                        finalPosition: team.finalGroupPosition,
                        totalPoints: team.totalPoints
                    }
                );
            }

            // Update eliminated teams
            for (const team of eliminated) {
                await teamRegistrationService.updateTeamRegistration(
                    team.teamRegistrationId,
                    'system',
                    {
                        registrationStatus: 'ELIMINATED',
                        finalPosition: team.finalGroupPosition,
                        totalPoints: team.totalPoints
                    }
                );
            }

        } catch (error) {
            this.logger.error('Failed to update team statuses:', error);
        }
    }

    // Distribute teams into existing groups (created by organizer)
    private async distributeTeamsIntoExistingGroups(
        qualifiedTeams: QualifiedTeam[],
        targetGroups: GroupCache[],
        strategy: TeamDistributionStrategy
    ): Promise<GroupTeamAssignment[]> {
        
        // Calculate available slots per group (reserve management slots)
        const managementSlotsPerGroup = 2; // Default, can be configurable
        const effectiveSlotsPerGroup = targetGroups.map(group => ({
            ...group,
            availableSlots: group.maxTeams - managementSlotsPerGroup
        }));

        // Check if we have enough capacity
        const totalAvailableSlots = effectiveSlotsPerGroup.reduce((sum, group) => sum + group.availableSlots, 0);
        if (qualifiedTeams.length > totalAvailableSlots) {
            throw new Error(`Not enough capacity: ${qualifiedTeams.length} teams but only ${totalAvailableSlots} slots available`);
        }

        // Apply distribution strategy
        let distributedTeams: GroupTeamAssignment[];

        switch (strategy.strategy) {
            case 'RANDOM':
                distributedTeams = this.randomDistribution(qualifiedTeams, effectiveSlotsPerGroup, managementSlotsPerGroup);
                break;
            case 'BALANCED':
                distributedTeams = this.balancedDistribution(qualifiedTeams, effectiveSlotsPerGroup, managementSlotsPerGroup);
                break;
            case 'SNAKE_DRAFT':
                distributedTeams = this.snakeDraftDistribution(qualifiedTeams, effectiveSlotsPerGroup, managementSlotsPerGroup);
                break;
            case 'SEEDED':
                distributedTeams = this.seededDistribution(qualifiedTeams, effectiveSlotsPerGroup, managementSlotsPerGroup);
                break;
            default:
                distributedTeams = this.balancedDistribution(qualifiedTeams, effectiveSlotsPerGroup, managementSlotsPerGroup);
        }

        return distributedTeams;
    }

    // Distribution strategy implementations
    private randomDistribution(teams: QualifiedTeam[], groups: any[], managementSlots: number): GroupTeamAssignment[] {
        const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
        return this.distributeTeamsEvenly(shuffledTeams, groups, managementSlots);
    }

    private balancedDistribution(teams: QualifiedTeam[], groups: any[], managementSlots: number): GroupTeamAssignment[] {
        const sortedTeams = [...teams].sort((a, b) => b.totalPoints - a.totalPoints);
        return this.distributeTeamsEvenly(sortedTeams, groups, managementSlots);
    }

    private snakeDraftDistribution(teams: QualifiedTeam[], groups: any[], managementSlots: number): GroupTeamAssignment[] {
        // Sort teams by performance
        const sortedTeams = [...teams].sort((a, b) => b.totalPoints - a.totalPoints);
        
        // Initialize group assignments
        const assignments: GroupTeamAssignment[] = groups.map(group => ({
            groupId: group.id,
            groupName: group.name,
            assignedTeams: [],
            managementSlots,
            totalSlots: group.maxTeams,
            filledSlots: 0
        }));

        // Snake draft distribution
        let currentGroupIndex = 0;
        let direction = 1;

        for (const team of sortedTeams) {
            assignments[currentGroupIndex].assignedTeams.push(team);
            assignments[currentGroupIndex].filledSlots++;
            
            // Move to next group in snake pattern
            currentGroupIndex += direction;
            if (currentGroupIndex >= groups.length) {
                currentGroupIndex = groups.length - 1;
                direction = -1;
            } else if (currentGroupIndex < 0) {
                currentGroupIndex = 0;
                direction = 1;
            }
        }

        return assignments;
    }

    private seededDistribution(teams: QualifiedTeam[], groups: any[], managementSlots: number): GroupTeamAssignment[] {
        const sortedTeams = [...teams].sort((a, b) => b.totalPoints - a.totalPoints);
        
        // Initialize group assignments
        const assignments: GroupTeamAssignment[] = groups.map(group => ({
            groupId: group.id,
            groupName: group.name,
            assignedTeams: [],
            managementSlots,
            totalSlots: group.maxTeams,
            filledSlots: 0
        }));

        // Round-robin seeding (spread top teams across groups)
        sortedTeams.forEach((team, index) => {
            const groupIndex = index % groups.length;
            assignments[groupIndex].assignedTeams.push(team);
            assignments[groupIndex].filledSlots++;
        });

        return assignments;
    }

    // Helper: Distribute teams evenly
    private distributeTeamsEvenly(teams: QualifiedTeam[], groups: any[], managementSlots: number): GroupTeamAssignment[] {
        const assignments: GroupTeamAssignment[] = groups.map(group => ({
            groupId: group.id,
            groupName: group.name,
            assignedTeams: [],
            managementSlots,
            totalSlots: group.maxTeams,
            filledSlots: 0
        }));

        // Distribute teams round-robin
        teams.forEach((team, index) => {
            const groupIndex = index % groups.length;
            assignments[groupIndex].assignedTeams.push(team);
            assignments[groupIndex].filledSlots++;
        });

        return assignments;
    }

    // Update team registrations with new group assignments
    private async updateTeamGroupAssignments(teamDistribution: GroupTeamAssignment[]) {
        try {
            for (const groupAssignment of teamDistribution) {
                for (const team of groupAssignment.assignedTeams) {
                    await teamRegistrationService.updateTeamRegistration(
                        team.teamRegistrationId,
                        'system',
                        {
                            groupId: groupAssignment.groupId,
                            registrationStatus: 'CONFIRMED' // Ready for next stage
                        }
                    );
                }
            }
        } catch (error) {
            this.logger.error('Failed to update team group assignments:', error);
        }
    }

    // Helper methods
    private async ensureStageResultsSynced(groups: GroupCache[]): Promise<void> {
        const pendingResultKeys: string[] = [];

        for (const group of groups) {
            const matchIds = await redis.smembers(`group:${group.id}:matches`);

            for (const matchId of matchIds) {
                const resultIds = await redis.smembers(`match:${matchId}:results`);

                for (const resultId of resultIds) {
                    const result = await redis.hgetObject<MatchResultCache>(`matchResult:${resultId}`);
                    if (result?.finalStatus === 'PUBLISHED' && result.dbStatus !== 'SYNCED') {
                        pendingResultKeys.push(`matchResult:${resultId}`);
                    }
                }
            }
        }

        if (pendingResultKeys.length > 0) {
            await waitForAllDbSync(pendingResultKeys);
        }
    }

    private async getStageGroups(stageId: string): Promise<GroupCache[]> {
        try {
            const groupIds = await redis.smembers(`stage:${stageId}:groups`);

            if (groupIds.length === 0) {
                const dbGroups = await this.db.group.findMany({
                    where: { stageId },
                    orderBy: { name: 'asc' }
                });

                return dbGroups.map(group => ({
                    id: group.id,
                    name: group.name,
                    maxTeams: group.maxTeams,
                    qualificationSpots: group.qualificationSpots,
                    tournamentId: group.tournamentId,
                    stageId: group.stageId ?? undefined,
                    createdAt: group.createdAt.toISOString(),
                    updatedAt: group.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                }));
            }

            const groups: GroupCache[] = [];

            for (const groupId of groupIds) {
                const group = await redis.hgetObject<GroupCache>(`group:${groupId}`);
                if (group) {
                    groups.push(group);
                }
            }

            return groups;
        } catch (error) {
            this.logger.error('Failed to get stage groups:', error);
            return [];
        }
    }

    private calculateAverageQualificationPoints(groupResults: GroupQualificationResult[]): number {
        const allQualifiedTeams = groupResults.flatMap(result => result.qualifiedTeams);
        if (allQualifiedTeams.length === 0) return 0;

        const totalPoints = allQualifiedTeams.reduce((sum, team) => sum + team.totalPoints, 0);
        return Math.round(totalPoints / allQualifiedTeams.length);
    }
}

export const teamQualificationService = new TeamQualificationService();