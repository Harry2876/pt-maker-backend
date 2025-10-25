import { Request, Response } from 'express';
import { teamEnrollmentService } from '../services/teamEnrollmentService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class TeamEnrollmentController {
    // Enroll team
    static createTeamEnrollment = asyncHandler(async (req: Request, res: Response) => {
        const { guildId } = req.params;
        const { teamName, leaderId, leaderIgn, leaderDiscord, players, threadId } = req.body;
        const enrolledBy = req.user?.id || 'system'; // Adjust based on your auth

        const teamEnrollment = await teamEnrollmentService.enrollTeam({
            guildId,
            teamName,
            leaderId,
            leaderIgn,
            leaderDiscord,
            players,
            threadId,
            enrolledBy
        });

        if (!teamEnrollment) {
            return res.status(400).json(ResponseHelper.validationError('Failed to enroll team'));
        }

        return res.status(201).json(ResponseHelper.success('Team enrolled successfully', teamEnrollment));
    });

    // Get teams by guild
    static getTeamsByGuild = asyncHandler(async (req: Request, res: Response) => {
        const { guildId } = req.params;

        const teams = await teamEnrollmentService.getTeamsByGuild(guildId);

        if (!teams || teams.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No teams found for this guild'));
        }

        return res.json(ResponseHelper.success('Teams retrieved successfully', {
            teams,
            count: teams.length
        }));
    });

    // Get team by name
    static getTeamByName = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;

        const team = await teamEnrollmentService.getTeamByName(guildId, teamName);

        if (!team) {
            return res.status(404).json(ResponseHelper.notFound('Team not found'));
        }

        return res.json(ResponseHelper.success('Team retrieved successfully', team));
    });

    // Update team
    static updateTeamEnrollment = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;
        const updateData = req.body;
        const updatedBy = req.user?.id || 'system';

        const updatedTeam = await teamEnrollmentService.updateTeam(guildId, teamName, updateData, updatedBy);

        if (!updatedTeam) {
            return res.status(404).json(ResponseHelper.notFound('Team not found'));
        }

        return res.json(ResponseHelper.success('Team updated successfully', updatedTeam));
    });

    // Delete team
    static deleteTeamEnrollment = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;
        const deletedBy = req.user?.id || 'system';

        const result = await teamEnrollmentService.deleteTeam(guildId, teamName, deletedBy);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Team not found'));
        }

        return res.json(ResponseHelper.success('Team deleted successfully'));
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

    // Check rate limit
    static checkRateLimit = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, userId, action } = req.params;

        const rateLimit = await teamEnrollmentService.checkRateLimit(userId, guildId, action as 'enrollment' | 'leadership_management');

        if (rateLimit) {
            return res.status(429).json(ResponseHelper.error('Rate limit active', 'RATE_LIMITED', `Try again after ${rateLimit.cooldownUntil}`));
        }

        return res.json(ResponseHelper.success('No rate limit active'));
    });

    // Get team name change history
    static getTeamNameChangeHistory = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;

        const history = await teamEnrollmentService.getTeamNameChangeHistory(guildId, teamName);

        if (!history) {
            return res.status(500).json(ResponseHelper.error('Failed to get team name change history', 'GET_HISTORY_ERROR'));
        }

        return res.json(ResponseHelper.success('Team name change history retrieved', history));
    });

    // Get teams where user is a leader
    static getUserTeams = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, discordTag } = req.params;

        const result = await teamEnrollmentService.getUserTeams(guildId, discordTag);

        if (!result) {
            return res.status(500).json(ResponseHelper.error('Failed to get user teams', 'GET_USER_TEAMS_ERROR'));
        }

        if (result.totalCount === 0) {
            return res.status(404).json(ResponseHelper.notFound('No teams found for this user'));
        }

        return res.json(ResponseHelper.success('User teams retrieved', result));
    });

    // Check if player is already enrolled in any team
    static checkPlayerEnrollment = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, discordTag } = req.params;

        const result = await teamEnrollmentService.checkPlayerEnrollment(guildId, discordTag);

        if (!result) {
            return res.status(500).json(ResponseHelper.error('Failed to check player enrollment', 'CHECK_PLAYER_ENROLLMENT_ERROR'));
        }

        if (result.isEnrolled) {
            return res.json(ResponseHelper.success('Player enrollment found', {
                isEnrolled: true,
                teamName: result.teamName,
                playerRole: result.playerRole
            }));
        }

        return res.json(ResponseHelper.success('Player not enrolled', {
            isEnrolled: false
        }));
    });

    // Transfer team leadership to another member
    static transferTeamLeadership = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;
        const { newLeaderDiscordTag, newLeaderIgn, currentLeaderDiscordTag } = req.body;

        const result = await teamEnrollmentService.transferTeamLeadership(
            guildId, 
            teamName, 
            {
                newLeaderDiscord: newLeaderDiscordTag,
                newLeaderIgn: newLeaderIgn,
                transferredBy: req.body.transferredBy || currentLeaderDiscordTag
            }
        );

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to transfer leadership'));
        }

        return res.json(ResponseHelper.success('Leadership transferred successfully', result));
    });

    // Update team players
    static updateTeamPlayers = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;
        const { players } = req.body;

        const result = await teamEnrollmentService.updateTeamPlayers(guildId, teamName, players);

        if (!result.success) {
            return res.status(400).json(ResponseHelper.validationError(result.error || 'Update failed'));
        }

        return res.json(ResponseHelper.success('Team players updated successfully', result.data));
    });

    // Change team name
    static changeTeamName = asyncHandler(async (req: Request, res: Response) => {
        const { guildId, teamName } = req.params;
        const { newTeamName, changedBy } = req.body;

        const result = await teamEnrollmentService.changeTeamName(guildId, teamName, newTeamName, changedBy);

        if (!result.success) {
            return res.status(400).json(ResponseHelper.validationError(result.error || 'Name change failed'));
        }

        return res.json(ResponseHelper.success('Team name changed successfully', result.data));
    });
}