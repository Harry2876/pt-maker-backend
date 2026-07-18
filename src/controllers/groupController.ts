import { Request, Response } from 'express';
import { groupService } from '../services/groupService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class GroupController {
    // Create group in tournament
    static createGroup = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { name, maxTeams, qualificationSpots, stageId } = req.body;
        const userId = req.user!.id;

        const group = await groupService.createGroup(tournamentId, userId, {
            name,
            maxTeams,
            qualificationSpots,
            stageId
        });

        if (!group) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create group'));
        }

        return res.status(201).json(ResponseHelper.success('Group created successfully', group));
    });

    // Get all groups for tournament
    static getTournamentGroups = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const groups = await groupService.getTournamentGroups(tournamentId, userId);

        if (!groups || groups.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No groups found for the tournament'));
        }

        return res.json(ResponseHelper.success('Groups retrieved successfully', {
            groups,
            count: groups.length
        }));
    });

    // Get specific group
    static getGroupById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const group = await groupService.getGroupById(id, userId);

        if (!group) {
            return res.status(404).json(ResponseHelper.notFound('Group not found'));
        }

        return res.json(ResponseHelper.success('Group retrieved successfully', group));
    });

    // Update group
    static updateGroup = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const group = await groupService.updateGroup(id, userId, updateData);

        if (!group) {
            return res.status(404).json(ResponseHelper.notFound('Group not found'));
        }

        return res.json(ResponseHelper.success('Group updated successfully', group));
    });

    // Delete group
    static deleteGroup = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const result = await groupService.deleteGroup(id, userId);

        if (!result || !result.success) {
            return res.status(404).json(ResponseHelper.notFound(result?.message || 'Group not found'));
        }

        return res.json(ResponseHelper.success(result.message || 'Group deleted successfully'));
    });
}