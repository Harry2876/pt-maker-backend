import { Request, Response } from 'express';
import { teamRegistrationService } from '../services/teamRegistrationService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { PaginationParams } from '../types/pagination';

export class TeamRegistrationController {
    // Create team registration in tournament
    static createTeamRegistration = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { teamName, contactInfo, groupId } = req.body;
        const userId = req.user!.id;

        const registration = await teamRegistrationService.createTeamRegistration(tournamentId, userId, {
            teamName,
            contactInfo,
            groupId
        });

        if (!registration) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create team registration'));
        }

        return res.status(201).json(ResponseHelper.success('Team registration created successfully', registration));
    });

    // Get all team registrations for tournament
    static getTournamentTeamRegistrations = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const registrations = await teamRegistrationService.getTournamentTeamRegistrations(tournamentId, userId);

        if (!registrations || registrations.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No team registrations found for the tournament'));
        }

        return res.json(ResponseHelper.success('Team registrations retrieved successfully', {
            registrations,
            count: registrations.length
        }));
    });

    // Get team registrations for specific group
    static getGroupTeamRegistrations = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const userId = req.user!.id;

        const registrations = await teamRegistrationService.getGroupTeamRegistrations(groupId, userId);

        if (!registrations || registrations.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No team registrations found for the group'));
        }

        return res.json(ResponseHelper.success('Group team registrations retrieved successfully', {
            registrations,
            count: registrations.length
        }));
    });

    // Get specific team registration
    static getTeamRegistrationById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const registration = await teamRegistrationService.getTeamRegistrationById(id, userId);

        if (!registration) {
            return res.status(404).json(ResponseHelper.notFound('Team registration not found'));
        }

        return res.json(ResponseHelper.success('Team registration retrieved successfully', registration));
    });

    // Update team registration
    static updateTeamRegistration = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const registration = await teamRegistrationService.updateTeamRegistration(id, userId, updateData);

        if (!registration) {
            return res.status(404).json(ResponseHelper.notFound('Team registration not found'));
        }

        return res.json(ResponseHelper.success('Team registration updated successfully', registration));
    });

        // Get tournament teams with pagination
    static getTournamentTeamRegistrationsPaginated = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;
        
        const paginationParams: PaginationParams = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: req.query.sortBy as string || 'totalPoints',
            sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
        };

        const result = await teamRegistrationService.getTournamentTeamRegistrationsPaginated(
            tournamentId,
            userId,
            paginationParams
        );

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Tournament teams not found'));
        }

        return res.json(ResponseHelper.success(
            `Retrieved ${result.data.length} teams (page ${result.meta.page} of ${result.meta.totalPages})`,
            {
                teams: result.data,
                pagination: result.meta
            }
        ));
    });

    // Get group teams with pagination
    static getGroupTeamRegistrationsPaginated = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const userId = req.user!.id;
        
        const paginationParams: PaginationParams = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: req.query.sortBy as string || 'totalPoints',
            sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
        };

        const result = await teamRegistrationService.getGroupTeamRegistrationsPaginated(
            groupId,
            userId,
            paginationParams
        );

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Group teams not found'));
        }

        return res.json(ResponseHelper.success(
            `Retrieved ${result.data.length} teams (page ${result.meta.page} of ${result.meta.totalPages})`,
            {
                teams: result.data,
                pagination: result.meta
            }
        ));
    });

    // Search teams across tournaments with pagination
    static searchTeamRegistrations = asyncHandler(async (req: Request, res: Response) => {
        const searchParams = {
            tournamentId: req.query.tournamentId as string,
            teamName: req.query.teamName as string,
            status: req.query.status as string,
            minPoints: req.query.minPoints ? parseInt(req.query.minPoints as string) : undefined,
            maxPoints: req.query.maxPoints ? parseInt(req.query.maxPoints as string) : undefined
        };

        const paginationParams: PaginationParams = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: req.query.sortBy as string || 'totalPoints',
            sortOrder: req.query.sortOrder as 'asc' | 'desc' || 'desc'
        };

        const result = await teamRegistrationService.searchTeamRegistrations(
            searchParams,
            paginationParams
        );

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('No teams found matching criteria'));
        }

        return res.json(ResponseHelper.success(
            `Found ${result.meta.total} teams matching criteria`,
            {
                teams: result.data,
                pagination: result.meta,
                searchParams
            }
        ));
    });
}


