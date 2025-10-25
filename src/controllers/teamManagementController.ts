import { Request, Response } from 'express';
import { teamEnrollmentService } from '../services/teamEnrollmentService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class TeamManagementController {
    // Set rate limit
    static setRateLimit = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, userId, action } = req.params;
        const { cooldownMinutes, isAdmin } = req.body;

        await teamEnrollmentService.setRateLimit(userId, guildId, action as 'enrollment' | 'leadership_management', cooldownMinutes, isAdmin);

        return res.json(ResponseHelper.success('Rate limit set successfully'));
    });

    // Log team activity
    static logTeamActivity = asyncHandler(async (req: Request, res: Response) => {
        const activityData = req.body;

        await teamEnrollmentService.logTeamActivity(activityData);

        return res.json(ResponseHelper.success('Team activity logged successfully'));
    });

    // Get teams by leader
    static getTeamsByLeader = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, leaderDiscord } = req.params;

        const teams = await teamEnrollmentService.getTeamsByLeader(guildId, leaderDiscord);

        if (!teams || teams.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No teams found for this leader'));
        }

        return res.json(ResponseHelper.success('Leader teams retrieved successfully', {
            teams,
            count: teams.length
        }));
    });

    // Get team activity history
    static getTeamActivityHistory = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;

        const activities = await teamEnrollmentService.getTeamActivityHistory(guildId, teamName);

        if (!activities || activities.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No activity history found for this team'));
        }

        return res.json(ResponseHelper.success('Team activity history retrieved successfully', {
            activities,
            count: activities.length
        }));
    });

    // Check rate limit
    static checkRateLimit = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, userId, action } = req.params;

        const rateLimit = await teamEnrollmentService.checkRateLimit(userId, guildId, action as 'enrollment' | 'leadership_management');

        if (rateLimit) {
            return res.status(429).json(ResponseHelper.error('Rate limit active', 'RATE_LIMITED', `Try again after ${rateLimit.cooldownUntil}`));
        }

        return res.json(ResponseHelper.success('No rate limit active'));
    });
}