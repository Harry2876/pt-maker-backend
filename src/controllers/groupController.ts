import { Request, Response } from 'express';
import { groupService } from '../services/groupService';
import { asyncHandler } from '../middleware/commonMiddleware';

export class GroupController {
    // Create group in tournament
    static createGroup = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { name, maxTeams, qualificationSpots } = req.body;
        const userId = req.user!.id;

        const group = await groupService.createGroup(tournamentId, userId, {
            name,
            maxTeams,
            qualificationSpots
        });

        if (!group) {
            return res.status(400).json({
                success: false,
                message: 'Failed to create group',
                data: null
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Group created successfully',
            data: group
        });
    });

    // Get all groups for tournament
    static getTournamentGroups = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const groups = await groupService.getTournamentGroups(tournamentId, userId);

        if (!groups || groups.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No groups found for the tournament',
                data: [],
                count: 0
            });
        }

        return res.json({
            success: true,
            message: 'Groups retrieved successfully',
            data: groups,
            count: groups.length
        });
    });

    // Get specific group
    static getGroupById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const group = await groupService.getGroupById(id, userId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found',
                data: null
            });
        }

        return res.json({
            success: true,
            message: 'Group retrieved successfully',
            data: group
        });
    });

    // Update group
    static updateGroup = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const group = await groupService.updateGroup(id, userId, updateData);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Group not found',
                data: null
            });
        }

        return res.json({
            success: true,
            message: 'Group updated successfully',
            data: group
        });
    });

    // Delete group
    static deleteGroup = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const result = await groupService.deleteGroup(id, userId);

        if (!result || !result.success) {
            return res.status(404).json({
                success: false,
                message: result?.message || 'Group not found',
                data: null
            });
        }

        return res.json({
            success: true,
            message: result.message || 'Group deleted successfully',
            data: null
        });
    });
}