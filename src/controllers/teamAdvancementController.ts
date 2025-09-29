import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { teamQualificationService } from '../services/teamQualificationService';
import { tournamentStageService } from '../services/tournamentStageService';
import { groupService } from '../services/groupService';
import { ResponseHelper } from '../utils/responseHelper';
import { TeamDistributionStrategy, StageQualificationResult, StageProgressionResult } from '../types/teamAdvancement';
import { CreateStageGroupData } from '../types/group';
import redis from '../config/redis';

export class TeamAdvancementController {

    // Qualify teams from a stage
    static qualifyTeamsFromStage = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;

        const result = await teamQualificationService.qualifyTeamsFromStage(stageId, userId);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to qualify teams from stage'));
        }

        return res.json(ResponseHelper.success('Teams qualified successfully', result));
    });

    // Get qualification results for a stage
    static getStageQualificationResults = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;

        const result = await redis.getObject(`stage:${stageId}:qualification:result`);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('No qualification results found for this stage'));
        }

        return res.json(ResponseHelper.success('Qualification results retrieved successfully', result));
    });

    // Progress teams to next stage
    static progressTeamsToNextStage = asyncHandler(async (req: Request, res: Response) => {
        const { currentStageId, nextStageId } = req.params;
        const distributionStrategy: TeamDistributionStrategy = req.body;
        const userId = req.user!.id;

        // Validate distribution strategy
        if (!distributionStrategy.strategy) {
            return res.status(400).json(ResponseHelper.validationError('Distribution strategy is required'));
        }

        const result = await teamQualificationService.progressTeamsToNextStage(
            currentStageId,
            nextStageId,
            distributionStrategy,
            userId
        );

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to progress teams to next stage'));
        }

        return res.json(ResponseHelper.success('Teams progressed to next stage successfully', result));
    });

    // Complete stage progression (all-in-one)
    static completeStageProgression = asyncHandler(async (req: Request, res: Response) => {
        const { currentStageId, nextStageId } = req.params;
        const distributionStrategy: TeamDistributionStrategy = req.body;
        const userId = req.user!.id;

        // Validate distribution strategy
        if (!distributionStrategy.strategy) {
            return res.status(400).json(ResponseHelper.validationError('Distribution strategy is required'));
        }

        const result = await tournamentStageService.completeStageProgression(
            currentStageId,
            nextStageId,
            distributionStrategy,
            userId
        );

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to complete stage progression'));
        }

        return res.json(ResponseHelper.success('Stage progression completed successfully', result));
    });

    // Create groups for a stage
    static createStageGroups = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const { groupsData } = req.body;
        const userId = req.user!.id;

        // Validate groups data
        if (!groupsData || !Array.isArray(groupsData) || groupsData.length === 0) {
            return res.status(400).json(ResponseHelper.validationError('Groups data is required and must be a non-empty array'));
        }

        const createStageGroupData: CreateStageGroupData = {
            stageId,
            groupsData
        };

        const result = await groupService.createStageGroups(createStageGroupData, userId);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create stage groups'));
        }

        return res.status(201).json(ResponseHelper.success('Stage groups created successfully', result));
    });

    // Get groups for a stage
    static getStageGroups = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;

        const groups = await groupService.getStageGroups(stageId, userId);

        return res.json(ResponseHelper.success('Stage groups retrieved successfully', {
            stageId,
            totalGroups: groups.length,
            groups
        }));
    });

    // Get progression results for a stage
    static getStageProgressionResults = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;

        const result = await redis.getObject(`stage:${stageId}:progression:result`);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('No progression results found for this stage'));
        }

        return res.json(ResponseHelper.success('Progression results retrieved successfully', result));
    });

    // Get complete tournament progress
    static getTournamentProgress = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        try {
            // Get tournament stages
            const stages = await tournamentStageService.getTournamentStages(tournamentId, userId);

            if (stages.length === 0) {
                return res.status(404).json(ResponseHelper.notFound('No stages found for this tournament'));
            }

            // Get progress for each stage
            const stageProgress = [];
            for (const stage of stages) {
                const qualificationResult = await redis.getObject<StageQualificationResult>(`stage:${stage.id}:qualification:result`);
                const progressionResult = await redis.getObject<StageProgressionResult>(`stage:${stage.id}:progression:result`);
                const stageGroups = await groupService.getStageGroups(stage.id, userId);

                stageProgress.push({
                    stage: {
                        id: stage.id,
                        name: stage.name,
                        stageNumber: stage.stageNumber,
                        isActive: stage.isActive,
                        isCompleted: stage.isCompleted,
                        totalGroups: stageGroups.length
                    },
                    groups: stageGroups.length,
                    qualification: qualificationResult ? {
                        teamsQualified: qualificationResult.totalTeamsQualified,
                        teamsEliminated: qualificationResult.qualificationSummary.teamsEliminated,
                        averagePointsToQualify: qualificationResult.qualificationSummary.averagePointsToQualify
                    } : null,
                    progression: progressionResult ? {
                        teamsAdvanced: progressionResult.progressionSummary.teamsAdvanced,
                        newGroupsPopulated: progressionResult.progressionSummary.newGroupsPopulated
                    } : null
                });
            }

            // Calculate overall tournament progress
            const totalStages = stages.length;
            const completedStages = stages.filter(s => s.isCompleted).length;
            const currentStage = stages.find(s => s.isActive);

            const tournamentProgress = {
                tournamentId,
                totalStages,
                completedStages,
                currentStage: currentStage ? {
                    stageNumber: currentStage.stageNumber,
                    name: currentStage.name,
                    id: currentStage.id
                } : null,
                overallProgress: Math.round((completedStages / totalStages) * 100),
                stageProgress
            };

            return res.json(ResponseHelper.success('Tournament progress retrieved successfully', tournamentProgress));

        } catch (error) {
            return res.status(500).json(ResponseHelper.error('Failed to retrieve tournament progress', (error as any).message));
        }
    });
}