import { Request, Response } from "express";
import { guildMemberService } from "../services/guildMemberService";
import { guildService } from "../services/guildService";
import { asyncHandler } from "../middleware/commonMiddleware";
import { ResponseHelper } from "../utils/responseHelper";
import logger from "../utils/logger";
import { randomUUID } from 'crypto';

export class GuildMemberController {

    // Get all members for a guild
    static getGuildMembers = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;

            // First verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Get all members
            const members = await guildMemberService.getGuildMembers(guildId);

            return res.json(ResponseHelper.success('Guild members retrieved successfully', {
                guildId,
                memberCount: members.length,
                members: members.map(member => ({
                    id: member.id,
                    userId: member.userId,
                    nickname: member.nickname,
                    roles: member.roles,
                    joinedAt: member.joinedAt,
                    isAdmin: member.isAdmin,
                    canManageTournaments: member.canManageTournaments,
                    user: {
                        id: member.user.id,
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        avatar: member.user.avatar
                    }
                }))
            }));

        } catch (error) {
            logger.error('Failed to get guild members:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve guild members'));
        }
    });

    // Get specific guild member
    static getGuildMember = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId, memberId } = req.params;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Get specific member
            const member = await guildMemberService.getGuildMemberById(memberId);

            if (!member || member.guildId !== guildId) {
                return res.status(404).json(ResponseHelper.notFound('Guild member not found'));
            }

            return res.json(ResponseHelper.success('Guild member retrieved successfully', {
                member: {
                    id: member.id,
                    userId: member.userId,
                    guildId: member.guildId,
                    nickname: member.nickname,
                    roles: member.roles,
                    joinedAt: member.joinedAt,
                    isAdmin: member.isAdmin,
                    canManageTournaments: member.canManageTournaments,
                    createdAt: member.createdAt,
                    user: {
                        id: member.user.id,
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        avatar: member.user.avatar,
                        verified: member.user.verified
                    },
                    guild: {
                        id: member.guild.id,
                        name: member.guild.name,
                        icon: member.guild.icon
                    }
                }
            }));

        } catch (error) {
            logger.error('Failed to get guild member:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve guild member'));
        }
    });

    // Add member to guild
    static addGuildMember = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;
            const { userId, nickname, roles } = req.body;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Check if member already exists
            const existingMember = await guildMemberService.isUserMemberOfGuild(userId, guildId);
            if (existingMember) {
                return res.status(409).json(ResponseHelper.validationError('User is already a member of this guild'));
            }

            // Create new member
            const memberData = {
                id: randomUUID(),
                guildId,
                userId,
                nickname: nickname || null,
                roles: roles || [],
                joinedAt: new Date().toISOString()
            };

            const newMember = await guildMemberService.createGuildMember(memberData);

            return res.status(201).json(ResponseHelper.success('Guild member added successfully', {
                member: newMember
            }));

        } catch (error) {
            logger.error('Failed to add guild member:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to add guild member'));
        }
    });

    // Update guild member
    static updateGuildMember = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId, memberId } = req.params;
            const updateData = req.body;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Verify member exists and belongs to guild
            const member = await guildMemberService.getGuildMemberById(memberId);
            if (!member || member.guildId !== guildId) {
                return res.status(404).json(ResponseHelper.notFound('Guild member not found'));
            }

            // Update member
            const updatedMember = await guildMemberService.updateGuildMember(memberId, updateData);

            return res.json(ResponseHelper.success('Guild member updated successfully', {
                member: updatedMember
            }));

        } catch (error) {
            logger.error('Failed to update guild member:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to update guild member'));
        }
    });

    // Remove guild member
    static removeGuildMember = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId, memberId } = req.params;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Verify member exists and belongs to guild
            const member = await guildMemberService.getGuildMemberById(memberId);
            if (!member || member.guildId !== guildId) {
                return res.status(404).json(ResponseHelper.notFound('Guild member not found'));
            }

            // Remove member
            await guildMemberService.removeGuildMember(memberId);

            return res.json(ResponseHelper.success('Guild member removed successfully', {
                removedMemberId: memberId,
                guildId
            }));

        } catch (error) {
            logger.error('Failed to remove guild member:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to remove guild member'));
        }
    });

    // Get member count for guild
    static getGuildMemberCount = asyncHandler(async (req: Request, res: Response) => {
        try {
            const { guildId } = req.params;

            // Verify guild exists
            const guild = await guildService.getGuildById(guildId);
            if (!guild) {
                return res.status(404).json(ResponseHelper.notFound('Guild not found'));
            }

            // Get member count
            const count = await guildMemberService.getGuildMemberCount(guildId);

            return res.json(ResponseHelper.success('Guild member count retrieved successfully', {
                guildId,
                memberCount: count
            }));

        } catch (error) {
            logger.error('Failed to get guild member count:', error);
            return res.status(500).json(ResponseHelper.serverError('Failed to retrieve guild member count'));
        }
    });
    // Bulk sync guild members (for bot join events)
static bulkSyncGuildMembers = asyncHandler(async (req: Request, res: Response) => {
    try {
        const { guildId } = req.params;
        const { members } = req.body;

        // Verify guild exists
        const guild = await guildService.getGuildById(guildId);
        if (!guild) {
            return res.status(404).json(ResponseHelper.notFound('Guild not found'));
        }

        if (!Array.isArray(members) || members.length === 0) {
            return res.status(400).json(ResponseHelper.validationError('Members array is required'));
        }

        if (members.length > 500) {
            return res.status(400).json(ResponseHelper.validationError('Maximum 500 members per sync'));
        }

        // Prepare member data with IDs
        const memberData = members.map(member => ({
            id: randomUUID(),
            guildId,
            userId: member.userId,
            nickname: member.nickname,
            roles: member.roles || [],
            joinedAt: member.joinedAt
        }));

        // Bulk create members
        const result = await guildMemberService.bulkCreateGuildMembers(memberData);

        return res.status(201).json(ResponseHelper.success('Guild members synced successfully', {
            guildId,
            syncedCount: result.length,
            members: result
        }));

    } catch (error) {
        logger.error('Failed to bulk sync guild members:', error);
        return res.status(500).json(ResponseHelper.serverError('Failed to sync guild members'));
    }
});
}