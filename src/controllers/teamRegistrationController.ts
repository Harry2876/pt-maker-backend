import { Request, Response } from 'express';
import { teamRegistrationService } from '../services/teamRegistrationService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

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
}