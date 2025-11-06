import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import logger from '../utils/logger';
import { ResponseHelper } from '../utils/responseHelper';
import { discordRegistrationService } from '../services/discordRegistrationService';
import { discordMeritService } from '../services/discordMeritService';
import { discordDelayService } from '../services/discordDelayService';
import { discordBanService } from '../services/discordBanService';
import { discordToggleService } from '../services/discordToggleService';

export class DiscordRegistrationController {

    static startRegistrationSession = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { name, groupId, channelId, duration, maxSlots } = req.body;

        const sessionData = {
            guildId: serverId,
            channelId,
            name,
            groupId,
            duration,
            maxSlots,
            createdBy: req.body.createdBy || 'system'
        };

        const session = await discordRegistrationService.startRegistrationSession(sessionData);

        if (!session) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create registration session'));
        }

        return res.status(201).json(ResponseHelper.success('Registration session started successfully', session));
    });

    static getActiveSessions = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;

        const sessions = await discordRegistrationService.getActiveSessions(serverId);

        if (!sessions) {
            return res.status(404).json(ResponseHelper.notFound('No sessions found'));
        }

        return res.json(ResponseHelper.success('Sessions retrieved successfully', sessions));
    });

    static toggleSession = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, sessionId } = req.params;

        const result = await discordRegistrationService.toggleSession(serverId, sessionId);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Session not found'));
        }

        return res.json(ResponseHelper.success('Session toggled successfully', result));
    });

    static endSession = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, sessionId } = req.params;

        const result = await discordRegistrationService.endSession(serverId, sessionId);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Session not found or already ended'));
        }

        return res.json(ResponseHelper.success('Session ended successfully', result));
    });


    static joinQueue = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { teamName, userDiscord, sessionId } = req.body;

        const queueData = {
            sessionId: sessionId,
            guildId: serverId,
            teamName,
            userId: userDiscord,
            userDiscord
        };

        const result = await discordRegistrationService.joinQueue(queueData);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to join queue'));
        }

        return res.status(201).json(ResponseHelper.success('Team added to queue successfully', result));
    });

    static removeFromQueue = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, userId } = req.params;
        const { sessionId, teamName } = req.body;

        const result = await discordRegistrationService.removeTeamFromQueue(
            sessionId,
            teamName,
            req.body.removedBy || 'admin'
        );

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Team not found in queue'));
        }

        return res.json(ResponseHelper.success('Team removed from queue successfully'));
    });

    static getQueueStatus = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { sessionId } = req.query;
        const queryOptions = req.query;

        if (!sessionId) {
            return res.status(400).json(ResponseHelper.validationError('Session ID is required'));
        }

        const queueStatus = await discordRegistrationService.getQueueStatus(sessionId as string, queryOptions);

        if (!queueStatus) {
            return res.status(404).json(ResponseHelper.notFound('No queue found'));
        }

        return res.json(ResponseHelper.success('Queue status retrieved successfully', queueStatus));
    });

    static processQueue = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { sessionId } = req.body;

        // Process queue by ending the session (which triggers queue processing)
        const result = await discordRegistrationService.endSession(serverId, sessionId);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('No queue to process'));
        }

        return res.json(ResponseHelper.success('Queue processed successfully', result));
    });


    static getTeamMerit = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, teamName } = req.params;

        const merit = await discordMeritService.getTeamMerit(serverId, teamName);

        return res.json(ResponseHelper.success('Team merit retrieved successfully', { merit }));
    });

    static updateTeamMerit = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, teamName } = req.params;
        const { meritChange, action, reason, updatedBy } = req.body;

        const updateData = {
            guildId: serverId,
            teamName,
            meritChange,
            action,
            reason,
            updatedBy
        };

        const result = await discordMeritService.updateTeamMerit(updateData);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to update merit'));
        }

        return res.json(ResponseHelper.success('Team merit updated successfully', result));
    });

    static getMeritRankings = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const options = req.query;

        const rankings = await discordMeritService.getGuildMeritRankings(serverId, options);

        if (!rankings) {
            return res.status(404).json(ResponseHelper.notFound('No merit rankings found'));
        }

        return res.json(ResponseHelper.success('Merit rankings retrieved successfully', rankings));
    });

    static getMeritRequirements = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;

        const requirements = {
            minimumMerit: 50,
            maximumMerit: 200,
            defaultMerit: 100,
            actions: {
                GOOD_REGISTRATION: 5,
                ATTENDED_MATCH: 10,
                SLOT_WASTE: -15,
                BAN_VIOLATION: -25,
                ADMIN_ADJUSTMENT: 0
            }
        };

        return res.json(ResponseHelper.success('Merit requirements retrieved successfully', requirements));
    });


    static getRegistrationStatus = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;

        const status = await discordToggleService.getToggleStatus(serverId);

        const defaultStatus = {
            enabled: true,
            toggledBy: 'system',
            toggledByName: 'System',
            toggledAt: new Date().toISOString(),
            toggleCount: 0
        };

        return res.json(ResponseHelper.success('Registration status retrieved successfully', status || defaultStatus));
    });

    static toggleRegistration = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { enabled, reason } = req.body;

        const toggleData = {
            guildId: serverId,
            enabled,
            toggledBy: req.body.toggledBy || 'admin',
            toggledByName: req.body.toggledByName || 'Admin User',
            reason
        };

        const result = await discordToggleService.toggleRegistration(toggleData);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to toggle registration'));
        }

        return res.json(ResponseHelper.success(`Registration ${enabled ? 'enabled' : 'disabled'} successfully`, result));
    });

    static setRegistrationDelay = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { delayMinutes, reason, teamName } = req.body;

        const delayData = {
            guildId: serverId,
            teamName,
            delayMinutes,
            reason,
            createdBy: req.body.setBy || 'admin'
        };

        const result = await discordDelayService.setRegistrationDelay(delayData);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to set registration delay'));
        }

        return res.status(201).json(ResponseHelper.success('Registration delay set successfully', result));
    });

    static getDelayStatus = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;

        const delays = await discordDelayService.getGuildDelays(serverId);

        if (!delays) {
            return res.status(404).json(ResponseHelper.notFound('No delays found'));
        }

        return res.json(ResponseHelper.success('Delay status retrieved successfully', delays));
    });

    static clearDelay = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { delayId } = req.body;

        if (!delayId) {
            return res.status(400).json(ResponseHelper.validationError('Delay ID is required'));
        }

        const result = await discordDelayService.removeRegistrationDelay(
            serverId,
            delayId,
            req.body.removedBy || 'admin'
        );

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('No active delay found'));
        }

        return res.json(ResponseHelper.success('Registration delay cleared successfully'));
    });

    static banTeam = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;
        const { teamName, punishmentType, reason, bannedBy, bannedByName, duration } = req.body;

        const banData = {
            guildId: serverId,
            teamName,
            punishmentType,
            reason,
            bannedBy,
            bannedByName,
            duration
        };

        const result = await discordBanService.banTeam(banData);

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to ban team'));
        }

        return res.status(201).json(ResponseHelper.success('Team banned successfully', result));
    });

    static getBannedTeams = asyncHandler(async (req: Request, res: Response) => {
        const { serverId } = req.params;

        const bans = await discordBanService.getGuildBans(serverId);

        if (!bans) {
            return res.status(404).json(ResponseHelper.notFound('No bans found'));
        }

        return res.json(ResponseHelper.success('Banned teams retrieved successfully', bans));
    });

    static checkTeamBan = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, teamName } = req.params;

        const ban = await discordBanService.getTeamBanInfo(serverId, teamName);

        const result = {
            isBanned: !!ban,
            ban: ban || null
        };

        return res.json(ResponseHelper.success('Ban status checked successfully', result));
    });

    static unbanTeam = asyncHandler(async (req: Request, res: Response) => {
        const { serverId, teamName } = req.params;

        // First check if team is actually banned
        const ban = await discordBanService.getTeamBanInfo(serverId, teamName);

        if (!ban) {
            return res.status(404).json(ResponseHelper.notFound('Team not found or not banned'));
        }

        // Expire the ban (which effectively unbans the team)
        const result = await discordBanService.expireBan(
            serverId,
            ban.id,
            req.body.removedBy || 'admin'
        );

        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Failed to unban team'));
        }

        return res.json(ResponseHelper.success('Team unbanned successfully'));
    });
}