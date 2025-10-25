import { BaseWorker } from "./baseWorker";
import { Job } from "bullmq";
import { Queues } from "../config/queues";
import { DiscordSyncJob } from "../types/queue";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class DiscordSyncWorker extends BaseWorker<DiscordSyncJob> {
    constructor() {
        super(Queues.DISCORD_SYNC, { concurrency: 2 });
    }

    protected async processJob(job: Job<DiscordSyncJob>): Promise<any> {
        const { type, entityId, data, userId } = job.data;

        logger.info(`Processing Discord sync job: ${type} for entity: ${entityId}`);

        try {
            switch (type) {
                // Team Enrollment Operations
                case 'TEAM_ENROLLMENT_CREATE':
                    return await this.syncTeamEnrollmentCreate(data);
                case 'TEAM_ENROLLMENT_UPDATE':
                    return await this.syncTeamEnrollmentUpdate(entityId, data);
                case 'TEAM_ENROLLMENT_DELETE':
                    return await this.syncTeamEnrollmentDelete(entityId);

                // User Rate Limit Operations
                case 'USER_RATE_LIMIT_CREATE':
                    return await this.syncUserRateLimitCreate(data);
                case 'USER_RATE_LIMIT_UPDATE':
                    return await this.syncUserRateLimitUpdate(entityId, data);

                // Team Name Change Operations
                case 'TEAM_NAME_CHANGE_CREATE':
                    return await this.syncTeamNameChangeCreate(data);

                // Team Activity Log Operations
                case 'TEAM_ACTIVITY_LOG_CREATE':
                    return await this.syncTeamActivityLogCreate(data);

                // Discord Guild Operations (keep existing for now)
                case 'DISCORD_GUILD_CREATE':
                    return await this.syncDiscordGuildCreate(data);
                case 'DISCORD_GUILD_UPDATE':
                    return await this.syncDiscordGuildUpdate(entityId, data);
                case 'DISCORD_GUILD_DELETE':
                    return await this.syncDiscordGuildDelete(entityId);

                // Discord User Operations
                case 'DISCORD_USER_CREATE':
                    return await this.syncDiscordUserCreate(data);
                case 'DISCORD_USER_UPDATE':
                    return await this.syncDiscordUserUpdate(entityId, data);

                // Discord Guild Member Operations
                case 'DISCORD_GUILD_MEMBER_CREATE':
                    return await this.syncDiscordGuildMemberCreate(data);
                case 'DISCORD_GUILD_MEMBER_UPDATE':
                    return await this.syncDiscordGuildMemberUpdate(entityId, data);

                // Bot State Operations
                case 'BOT_STATE_CREATE':
                    return await this.syncBotStateCreate(data);
                case 'BOT_STATE_UPDATE':
                    return await this.syncBotStateUpdate(entityId, data);

                default:
                    throw new Error(`Unknown Discord sync type: ${type}`);
            }
        } catch (error) {
            logger.error(`Error processing Discord sync job: ${type}:`, error);

            // Update redis with error status
            await redis.hset(`discord_sync:error:${entityId}`, {
                error: (error as any).message,
                timestamp: new Date().toISOString(),
                retryCount: job.attemptsMade.toString()
            });

            throw error;
        }
    }

    // Team Enrollment Sync Methods
    private async syncTeamEnrollmentCreate(data: any): Promise<any> {
        try {
            logger.info(`Syncing team enrollment create: ${data.id}`);

            const teamEnrollment = await db.teamEnrollment.create({
                data: {
                    id: data.id,
                    guildId: data.guildId,
                    teamName: data.teamName,
                    leaderId: data.leaderId,
                    leaderIgn: data.leaderIgn,
                    leaderDiscord: data.leaderDiscord,
                    players: data.players,
                    isVerified: data.isVerified,
                    isComplete: data.isComplete,
                    enrollmentStep: data.enrollmentStep,
                    threadId: data.threadId,
                    enrolledBy: data.enrolledBy,
                    enrolledAt: new Date(data.enrolledAt),
                    verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : null
                }
            });

            // Update Redis status
            await redis.hset(`team_enrollment:${data.guildId}:${data.teamName}`, {
                dbStatus: 'SYNCED'
            });

            logger.info(`Team enrollment ${data.id} synced to database successfully`);
            return teamEnrollment;
        } catch (error) {
            logger.error(`Failed to sync team enrollment create: ${data.id}`, error);
            throw error;
        }
    }

    private async syncTeamEnrollmentUpdate(entityId: string, data: any): Promise<any> {
        try {
            logger.info(`Syncing team enrollment update: ${entityId}`);

            const teamEnrollment = await db.teamEnrollment.update({
                where: { id: entityId },
                data: {
                    ...data,
                    verifiedAt: data.verifiedAt ? new Date(data.verifiedAt) : undefined
                }
            });

            logger.info(`Team enrollment ${entityId} updated in database successfully`);
            return teamEnrollment;
        } catch (error) {
            logger.error(`Failed to sync team enrollment update: ${entityId}`, error);
            throw error;
        }
    }

    private async syncTeamEnrollmentDelete(entityId: string): Promise<any> {
        try {
            logger.info(`Syncing team enrollment delete: ${entityId}`);

            const teamEnrollment = await db.teamEnrollment.delete({
                where: { id: entityId }
            });

            logger.info(`Team enrollment ${entityId} deleted from database successfully`);
            return teamEnrollment;
        } catch (error) {
            logger.error(`Failed to sync team enrollment delete: ${entityId}`, error);
            throw error;
        }
    }

    // User Rate Limit Sync Methods
    private async syncUserRateLimitCreate(data: any): Promise<any> {
        try {
            logger.info(`Syncing user rate limit create: ${data.userId}_${data.guildId}_${data.action}`);

            const rateLimit = await db.userRateLimit.create({
                data: {
                    userId: data.userId,
                    guildId: data.guildId,
                    action: data.action,
                    lastAttempt: new Date(data.lastAttempt),
                    attemptCount: data.attemptCount,
                    cooldownUntil: new Date(data.cooldownUntil),
                    isAdmin: data.isAdmin
                }
            });

            logger.info(`User rate limit synced to database successfully`);
            return rateLimit;
        } catch (error) {
            logger.error(`Failed to sync user rate limit create`, error);
            throw error;
        }
    }

    private async syncUserRateLimitUpdate(entityId: string, data: any): Promise<any> {
        try {
            logger.info(`Syncing user rate limit update: ${entityId}`);

            const [userId, guildId, action] = entityId.split('_');
            
            const rateLimit = await db.userRateLimit.update({
                where: {
                    userId_guildId_action: {
                        userId,
                        guildId,
                        action
                    }
                },
                data: {
                    lastAttempt: data.lastAttempt ? new Date(data.lastAttempt) : undefined,
                    attemptCount: data.attemptCount,
                    cooldownUntil: data.cooldownUntil ? new Date(data.cooldownUntil) : undefined,
                    isAdmin: data.isAdmin
                }
            });

            logger.info(`User rate limit ${entityId} updated in database successfully`);
            return rateLimit;
        } catch (error) {
            logger.error(`Failed to sync user rate limit update: ${entityId}`, error);
            throw error;
        }
    }

    // Team Name Change Sync Methods
    private async syncTeamNameChangeCreate(data: any): Promise<any> {
        try {
            logger.info(`Syncing team name change create: ${data.teamId}`);

            const nameChange = await db.teamNameChange.create({
                data: {
                    teamId: data.teamId,
                    guildId: data.guildId,
                    oldName: data.oldName,
                    newName: data.newName,
                    changedBy: data.changedBy,
                    changedAt: new Date()
                }
            });

            logger.info(`Team name change synced to database successfully`);
            return nameChange;
        } catch (error) {
            logger.error(`Failed to sync team name change create`, error);
            throw error;
        }
    }

    // Team Activity Log Sync Methods
    private async syncTeamActivityLogCreate(data: any): Promise<any> {
        try {
            logger.info(`Syncing team activity log create: ${data.id}`);

            const activityLog = await db.teamActivityLog.create({
                data: {
                    id: data.id,
                    teamId: data.teamId,
                    guildId: data.guildId,
                    action: data.action,
                    performedBy: data.performedBy,
                    timestamp: new Date(data.timestamp)
                }
            });

            logger.info(`Team activity log synced to database successfully`);
            return activityLog;
        } catch (error) {
            logger.error(`Failed to sync team activity log create`, error);
            throw error;
        }
    }

    // Discord Operations (moved from DatabaseSyncWorker)
    private async syncDiscordGuildCreate(guildData: any): Promise<void> {
        try {
            const guild = await db.discordGuild.create({
                data: {
                    id: guildData.id,
                    name: guildData.name,
                    icon: guildData.icon,
                    description: guildData.description,
                    memberCount: guildData.memberCount || 0,
                    ownerId: guildData.ownerId,
                    botEnabled: guildData.botEnabled || true,
                    commandPrefix: guildData.commandPrefix || 'sz',
                    isPremium: guildData.isPremium || false,
                    premiumUntil: guildData.premiumUntil ? new Date(guildData.premiumUntil) : null,
                    createdAt: new Date(guildData.createdAt),
                    updatedAt: new Date(guildData.updatedAt || guildData.createdAt)
                }
            });

            // Update Redis status
            await redis.hset(`guild:${guild.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`guild:${guild.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Discord Guild ${guild.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Discord Guild ${guildData.id} already exists in database`);
            } else {
                logger.error(`Error creating Discord Guild ${guildData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncDiscordGuildUpdate(guildId: string, updateData: any): Promise<void> {
        try {
            await db.discordGuild.update({
                where: { id: guildId },
                data: {
                    ...updateData,
                    premiumUntil: updateData.premiumUntil ? new Date(updateData.premiumUntil) : undefined,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`guild:${guildId}`, 'dbStatus', 'SYNCED');
            logger.info(`Discord Guild ${guildId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating Discord Guild ${guildId}:`, error);
            throw error;
        }
    }

    private async syncDiscordGuildDelete(guildId: string): Promise<void> {
        try {
            await db.discordGuild.delete({
                where: { id: guildId }
            });

            // Clean up Redis cache
            await redis.delete(`guild:${guildId}`);
            logger.info(`Discord Guild ${guildId} deleted successfully from database`);
        } catch (error) {
            logger.error(`Error deleting Discord Guild ${guildId}:`, error);
            throw error;
        }
    }

    private async syncDiscordUserCreate(userData: any): Promise<void> {
        try {
            const user = await db.discordUser.create({
                data: {
                    id: userData.id,
                    username: userData.username,
                    discriminator: userData.discriminator,
                    avatar: userData.avatar,
                    email: userData.email,
                    createdAt: new Date(userData.createdAt),
                    updatedAt: new Date(userData.updatedAt || userData.createdAt)
                }
            });

            await redis.hset(`discord_user:${user.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Discord User ${user.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Discord User ${userData.id} already exists in database`);
            } else {
                logger.error(`Error creating Discord User ${userData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncDiscordUserUpdate(userId: string, updateData: any): Promise<void> {
        try {
            await db.discordUser.update({
                where: { id: userId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`discord_user:${userId}`, 'dbStatus', 'SYNCED');
            logger.info(`Discord User ${userId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating Discord User ${userId}:`, error);
            throw error;
        }
    }

    private async syncDiscordGuildMemberCreate(memberData: any): Promise<void> {
        try {
            const member = await db.discordGuildMember.create({
                data: {
                    id: memberData.id,
                    guildId: memberData.guildId,
                    userId: memberData.userId,
                    nickname: memberData.nickname,
                    roles: memberData.roles || [],
                    joinedAt: new Date(memberData.joinedAt),
                    createdAt: new Date(memberData.createdAt),
                    updatedAt: new Date(memberData.updatedAt || memberData.createdAt)
                }
            });

            await redis.hset(`guild_member:${member.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Discord Guild Member ${member.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Discord Guild Member ${memberData.id} already exists in database`);
            } else {
                logger.error(`Error creating Discord Guild Member ${memberData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncDiscordGuildMemberUpdate(memberId: string, updateData: any): Promise<void> {
        try {
            await db.discordGuildMember.update({
                where: { id: memberId },
                data: {
                    ...updateData,
                    joinedAt: updateData.joinedAt ? new Date(updateData.joinedAt) : undefined,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`guild_member:${memberId}`, 'dbStatus', 'SYNCED');
            logger.info(`Discord Guild Member ${memberId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating Discord Guild Member ${memberId}:`, error);
            throw error;
        }
    }

    private async syncBotStateCreate(stateData: any): Promise<void> {
        try {
            await db.botState.create({
                data: {
                    id: stateData.id,
                    guildId: stateData.guildId,
                    state: stateData.state,
                    previousState: stateData.previousState,
                    reason: stateData.reason,
                    changedAt: new Date(stateData.changedAt),
                    changedBy: stateData.changedBy,
                    metadata: stateData.metadata,
                    createdAt: new Date(stateData.createdAt),
                    updatedAt: new Date(stateData.updatedAt)
                }
            });

            logger.info(`Bot State ${stateData.id} created successfully in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Bot State ${stateData.id} already exists in database`);
            } else {
                logger.error(`Error creating Bot State ${stateData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncBotStateUpdate(stateId: string, updateData: any): Promise<void> {
        try {
            await db.botState.update({
                where: { id: stateId },
                data: {
                    ...updateData,
                    changedAt: updateData.changedAt ? new Date(updateData.changedAt) : undefined,
                    updatedAt: new Date()
                }
            });

            logger.info(`Bot State ${stateId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating Bot State ${stateId}:`, error);
            throw error;
        }
    }
}

// Export singleton instance (following your pattern)
export const discordSyncWorker = new DiscordSyncWorker();