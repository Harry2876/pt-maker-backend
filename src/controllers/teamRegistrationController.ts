import { Request, Response } from 'express';
import { teamRegistrationService } from '../services/teamRegistrationService';
import { asyncHandler } from '../middleware/commonMiddleware';

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
            return res.status(400).json({
                success: false,
                message: 'Failed to create team registration',
                data: null
            });
        }

        return res.status(201).json({
            success: true,
            message: 'Team registration created successfully',
            data: registration
        });
    });

    // Get all team registrations for tournament
    static getTournamentTeamRegistrations = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const registrations = await teamRegistrationService.getTournamentTeamRegistrations(tournamentId, userId);

        if (!registrations || registrations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No team registrations found for the tournament',
                data: [],
                count: 0
            });
        }

        return res.json({
            success: true,
            message: 'Team registrations retrieved successfully',
            data: registrations,
            count: registrations.length
        });
    });

    // Get team registrations for specific group
    static getGroupTeamRegistrations = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const userId = req.user!.id;

        const registrations = await teamRegistrationService.getGroupTeamRegistrations(groupId, userId);

        if (!registrations || registrations.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No team registrations found for the group',
                data: [],
                count: 0
            });
        }

        return res.json({
            success: true,
            message: 'Group team registrations retrieved successfully',
            data: registrations,
            count: registrations.length
        });
    });

    // Get specific team registration
    static getTeamRegistrationById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const registration = await teamRegistrationService.getTeamRegistrationById(id, userId);

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Team registration not found',
                data: null
            });
        }

        return res.json({
            success: true,
            message: 'Team registration retrieved successfully',
            data: registration
        });
    });

    // Update team registration
    static updateTeamRegistration = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const registration = await teamRegistrationService.updateTeamRegistration(id, userId, updateData);

        if (!registration) {
            return res.status(404).json({
                success: false,
                message: 'Team registration not found',
                data: null
            });
        }

        return res.json({
            success: true,
            message: 'Team registration updated successfully',
            data: registration
        });
    });
}