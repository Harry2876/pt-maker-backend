import { BaseService } from './baseService';
import { QueueService } from './queueService';

export class GuildMemberService extends BaseService {
    /**
     * Create a new guild member - queues for database sync
     */
    async createGuildMember(memberData: {
        id: string;
        guildId: string;
        userId: string;
        nickname?: string;
        roles?: string[];
        joinedAt: string;
    }): Promise<typeof memberData> {
        try {

            const memberDataWithTimestamps = {
                ...memberData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            // Queue for immediate database sync
            await QueueService.syncImmediately('DISCORD_GUILD_MEMBER', memberData.id, memberDataWithTimestamps, memberData.userId);

            this.logger.info(`Guild member ${memberData.id} queued for database creation`);
            return memberData;
        } catch (error) {
            this.handleError(error, 'Create Guild Member');
            throw error;
        }
    }

    /**
     * Get guild member by ID - direct database query
     */
    async getGuildMemberById(memberId: string) {
        try {
            const member = await this.db.discordGuildMember.findUnique({
                where: { id: memberId },
                include: {
                    user: true,
                    guild: true
                }
            });

            return member;
        } catch (error) {
            this.handleError(error, 'Get Guild Member');
            throw error;
        }
    }

    /**
     * Get all members for a guild - direct database query
     */
    async getGuildMembers(guildId: string) {
        try {
            const members = await this.db.discordGuildMember.findMany({
                where: { guildId },
                include: {
                    user: true,
                    guild: true
                }
            });

            return members;
        } catch (error) {
            this.handleError(error, 'Get Guild Members');
            throw error;
        }
    }

    /**
     * Update guild member - queues for database sync
     */
    async updateGuildMember(memberId: string, updateData: {
        nickname?: string;
        roles?: string[];
    }): Promise<typeof updateData> {
        try {
            // Get existing member to get userId for queue
            const existingMember = await this.db.discordGuildMember.findUnique({
                where: { id: memberId }
            });

            if (!existingMember) {
                throw new Error(`Guild member ${memberId} not found`);
            }

            // Queue for database sync
            await QueueService.syncImmediately('DISCORD_GUILD_MEMBER', memberId, updateData, existingMember.userId);

            this.logger.info(`Guild member ${memberId} queued for database update`);
            return updateData;
        } catch (error) {
            this.handleError(error, 'Update Guild Member');
            throw error;
        }
    }

    /**
     * Remove guild member - direct database operation
     */
    async removeGuildMember(memberId: string): Promise<void> {
        try {
            await this.db.discordGuildMember.delete({
                where: { id: memberId }
            });

            this.logger.info(`Guild member ${memberId} removed from database`);
        } catch (error) {
            this.handleError(error, 'Remove Guild Member');
            throw error;
        }
    }

    /**
     * Bulk create guild members (for OAuth callback) - queues all for sync
     */
    async bulkCreateGuildMembers(members: Array<{
        id: string;
        guildId: string;
        userId: string;
        nickname?: string;
        roles?: string[];
        joinedAt: string;
    }>): Promise<typeof members> {
        try {
                    const createdMembers = [];

        for (const memberData of members) {
            // Add timestamps for EACH individual member
            const memberDataWithTimestamps = {
                ...memberData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Queue each member for database sync
            await QueueService.syncImmediately('DISCORD_GUILD_MEMBER', memberData.id, memberDataWithTimestamps, memberData.userId);
            createdMembers.push(memberData);
        }
            this.logger.info(`Queued ${createdMembers.length} guild members for database creation`);
            return createdMembers;
        } catch (error) {
            this.handleError(error, 'Bulk Create Guild Members');
            throw error;
        }
    }

    /**
     * Get member count for a guild
     */
    async getGuildMemberCount(guildId: string): Promise<number> {
        try {
            const count = await this.db.discordGuildMember.count({
                where: { guildId }
            });

            return count;
        } catch (error) {
            this.handleError(error, 'Get Guild Member Count');
            return 0;
        }
    }

    /**
     * Check if user is member of guild
     */
    async isUserMemberOfGuild(userId: string, guildId: string): Promise<boolean> {
        try {
            const member = await this.db.discordGuildMember.findFirst({
                where: {
                    userId,
                    guildId
                }
            });

            return !!member;
        } catch (error) {
            this.handleError(error, 'Check User Guild Membership');
            return false;
        }
    }
}

export const guildMemberService = new GuildMemberService();