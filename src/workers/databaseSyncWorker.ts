import { BaseWorker } from "./baseWorker";
import { Job } from "bullmq";
import { Queues } from "../config/queues";
import { DatabaseSyncJob, BatchSyncJob } from "../types/queue";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";
import { MatchController } from "@/controllers/matchController";

export class DatabaseSyncWorker extends BaseWorker<DatabaseSyncJob> {
    constructor() {
        super(Queues.DATABASE_SYNC, { concurrency: 2 });
    }

    protected async processJob(job: Job<DatabaseSyncJob>): Promise<any> {
        const { type, entityId, data, userId } = job.data;

        logger.info(`Processing database sync job: ${type} for entity: ${entityId}`);

        try {
            switch (type) {
                case 'TOURNAMENT_CREATE':
                    return await this.syncTournamentCreate(data);
                case 'TOURNAMENT_UPDATE':
                    return await this.syncTournamentUpdate(entityId, data);
                case 'TOURNAMENT_DELETE':
                    return await this.syncTournamentDelete(entityId);
                case 'MATCH_CREATE':
                    return await this.syncMatchCreate(data);
                case 'MATCH_UPDATE':
                    return await this.syncMatchUpdate(entityId, data);
                case 'GROUP_CREATE':
                    return await this.syncGroupCreate(data);
                case 'GROUP_UPDATE':
                    return await this.syncGroupUpdate(entityId, data);
                case 'GROUP_DELETE':
                    return await this.syncGroupDelete(entityId);
                case 'TEAM_REGISTRATION_CREATE':
                    return await this.syncTeamRegistrationCreate(data);
                case 'TEAM_REGISTRATION_UPDATE':
                    return await this.syncTeamRegistrationUpdate(entityId, data);
                case 'TOURNAMENT_STAGE_CREATE':
                    return await this.syncTournamentStageCreate(data);
                case 'TOURNAMENT_STAGE_UPDATE':
                    return await this.syncTournamentStageUpdate(entityId, data);
                case 'DELETE_TOURNAMENT_STAGE_CREATE':
                    return await this.syncTournamentStageDelete(entityId);
                case 'SCREENSHOT_CREATE':
                    return await this.syncScreenshotCreate(data);
                case 'SCREENSHOT_DELETE':
                    return await this.syncScreenshotDelete(entityId, data);
                case "BATCH_SYNC":
                    return await this.processBatchSync();
                case 'SCORING_RULE_CREATE':
                    return await this.syncScoringRuleCreate(data);
                case 'SCORING_RULE_UPDATE':
                    return await this.syncScoringRuleUpdate(entityId, data);
                case 'DELETE_SCORING_RULE':
                    return await this.syncScoringRuleDelete(entityId);
                case 'MATCH_RESULT_CREATE':
                    return await this.syncMatchResultCreate(data);
                case 'MATCH_RESULT_UPDATE':
                    return await this.syncMatchResultUpdate(entityId, data);
                case 'DELETE_MATCH_RESULT':
                    return await this.syncMatchResultDelete(entityId);
                case 'SLOT_ASSIGNMENT_CREATE':
                    return await this.syncSlotAssignmentCreate(data);
                case 'SLOT_ASSIGNMENT_UPDATE':
                    return await this.syncSlotAssignmentUpdate(entityId, data);
                case 'SLOT_ASSIGNMENT_DELETE':
                    return await this.syncSlotAssignmentDelete(entityId);
                case 'DISCORD_GUILD_CREATE':
                    return await this.syncDiscordGuildCreate(data);
                case 'DISCORD_GUILD_UPDATE':
                    return await this.syncDiscordGuildUpdate(entityId, data);
                case 'DISCORD_GUILD_DELETE':
                    return await this.syncDiscordGuildDelete(entityId);
                case 'DISCORD_USER_CREATE':
                    return await this.syncDiscordUserCreate(data);
                case 'DISCORD_USER_UPDATE':
                    return await this.syncDiscordUserUpdate(entityId, data);
                case 'DISCORD_GUILD_MEMBER_CREATE':
                    return await this.syncDiscordGuildMemberCreate(data);
                case 'DISCORD_GUILD_MEMBER_UPDATE':
                    return await this.syncDiscordGuildMemberUpdate(entityId, data);
                default:
                    throw new Error(`Unknown sync type: ${type}`);
            }
        } catch (error) {
            logger.error(`Error processing database sync job: ${type}:`, error);

            //update redis with error status
            await redis.hset(`sync:error:${entityId}`, {
                error: (error as any).message,
                timestamp: new Date().toISOString(),
                retryCount: job.attemptsMade.toString()
            });

            throw error;
        }
    }

    private async syncTournamentCreate(tournamentData: any): Promise<void> {
        try {
            //create in database
            const tournament = await db.tournament.create({
                data: {
                    id: tournamentData.id,
                    name: tournamentData.name,
                    game: tournamentData.game,
                    status: tournamentData.status,
                    userId: tournamentData.userId,
                    createdAt: new Date(tournamentData.createdAt),
                    updatedAt: new Date(tournamentData.updatedAt || tournamentData.createdAt)
                }
            });

            //update redis status
            await redis.hset(`tournament:${tournament.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`tournament:${tournament.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.info(`Tournament ${tournament.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Tournament ${tournamentData.id} already exists in database`);
            } else {
                logger.error(`Error creating tournament ${tournamentData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncTournamentUpdate(tournamentId: string, updateData: any): Promise<void> {
        try {
            await db.tournament.update({
                where: { id: tournamentId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`tournament:${tournamentId}`, 'dbStatus', 'SYNCED');
            logger.info(`Tournament ${tournamentId} updated successfully in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Tournament ${tournamentId} update conflict:`, error);
            } else {
                logger.error(`Error updating tournament ${tournamentId}:`, error);
            }
            throw error;
        }
    }

    private async syncTournamentDelete(tournamentId: string): Promise<void> {
        try {
            await db.tournament.delete({
                where: { id: tournamentId }
            });

            //clean up redis cache
            await redis.delete(`tournament:${tournamentId}`);
            logger.info(`Tournament ${tournamentId} deleted successfully from database`);
        } catch (error) {
            logger.error(`Error deleting tournament ${tournamentId}:`, error);
            throw error;
        }
    }

    private async syncMatchCreate(matchData: any): Promise<void> {
        try {
            const match = await db.match.create({
                data: {
                    id: matchData.id,
                    matchNumber: matchData.matchNumber,
                    status: matchData.status,
                    tournamentId: matchData.tournamentId,
                    matchDate: new Date(matchData.matchDate),
                    createdAt: new Date(matchData.createdAt),
                    updatedAt: new Date(matchData.updatedAt || matchData.createdAt)
                }
            });

            await redis.hset(`match:${match.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Match ${match.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Match ${matchData.id} already exists in database`);
                await redis.hset(`match:${matchData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating match ${matchData.id}:`, error);
            }
            throw error;
        }
    }

    private async syncMatchUpdate(matchId: string, updateData: any): Promise<void> {
        try {
            await db.match.update({
                where: { id: matchId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`match:${matchId}`, 'dbStatus', 'SYNCED');
            logger.info(`Match ${matchId} updated successfully in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Match ${matchId} update conflict:`, error);
            } else {
                logger.error(`Error updating match ${matchId}:`, error);
            }
            throw error;
        }
    }

    private async syncScreenshotCreate(screenshotData: any): Promise<void> {
        try {
            const screenshot = await db.screenshot.create({
                data: {
                    id: screenshotData.id,
                    originalName: screenshotData.originalName,
                    fileName: screenshotData.fileName,
                    fileSize: screenshotData.fileSize,
                    mimeType: screenshotData.mimeType,
                    type: screenshotData.type,
                    storageUrl: screenshotData.storageUrl,
                    matchId: screenshotData.matchId,
                    uploadedAt: new Date(screenshotData.uploadedAt),
                }
            });

            await redis.hset(`screenshot:${screenshot.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Screenshot ${screenshot.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Screenshot ${screenshotData.id} already exists in database`);
                await redis.hset(`screenshot:${screenshotData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating screenshot ${screenshotData.id}:`, error);
            }
            throw error;
        }
    }

    private async syncScreenshotDelete(screenshotId: string, data: any): Promise<void> {
        try {
            //delete from database
            await db.screenshot.delete({
                where: { id: screenshotId }
            });

            // //delete physical file if path provided
            // if (data.filePath) {
            //     try {
            //         await fs.unlink(data.filePath);
            //         logger.info(`Screenshot file ${data.filePath} deleted successfully`);
            //     } catch (error) {
            //         logger.warn(`Error deleting screenshot file ${data.filePath}:`, error);
            //     }
            // }

            //cleanup redis cache
            await redis.delete(`screenshot:${screenshotId}`);
            logger.info(`Screenshot ${screenshotId} deleted successfully from database`);
        } catch (error) {
            logger.error(`Error deleting screenshot ${screenshotId}:`, error);
            throw error;
        }
    }

    private async syncGroupCreate(groupData: any): Promise<void> {
        try {
            const group = await db.group.create({
                data: {
                    id: groupData.id,
                    name: groupData.name,
                    maxTeams: groupData.maxTeams,
                    qualificationSpots: groupData.qualificationSpots,
                    tournamentId: groupData.tournamentId,
                    createdAt: new Date(groupData.createdAt),
                    updatedAt: new Date(groupData.updatedAt || groupData.createdAt)
                }
            });

            await redis.hset(`group:${group.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Group ${group.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Group ${groupData.id} already exists in database`);
                await redis.hset(`group:${groupData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating group ${groupData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncGroupUpdate(groupId: string, updateData: any): Promise<void> {
        try {
            await db.group.update({
                where: { id: groupId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`group:${groupId}`, 'dbStatus', 'SYNCED');
            logger.info(`Group ${groupId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating group ${groupId}:`, error);
            throw error;
        }
    }

    private async syncGroupDelete(groupId: string): Promise<void> {
        try {
            await db.group.delete({
                where: { id: groupId }
            });

            await redis.delete(`group:${groupId}`);
            logger.info(`Group ${groupId} deleted successfully from database`);
        } catch (error) {
            logger.error(`Error deleting group ${groupId}:`, error);
            throw error;
        }
    }

    private async syncTeamRegistrationCreate(registrationData: any): Promise<void> {
        try {
            const registration = await db.teamRegistration.create({
                data: {
                    id: registrationData.id,
                    teamName: registrationData.teamName,
                    contactInfo: registrationData.contactInfo,
                    registrationStatus: registrationData.registrationStatus,
                    finalPosition: registrationData.finalPosition,
                    totalPoints: registrationData.totalPoints,
                    tournamentId: registrationData.tournamentId,
                    groupId: registrationData.groupId,
                    createdAt: new Date(registrationData.createdAt),
                    updatedAt: new Date(registrationData.updatedAt || registrationData.createdAt)
                }
            });

            await redis.hset(`teamRegistration:${registration.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Team registration ${registration.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Team registration ${registrationData.id} already exists in database`);
                await redis.hset(`teamRegistration:${registrationData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating team registration ${registrationData.id}:`, error);
                throw error;
            }
        }
    }

    private async syncTeamRegistrationUpdate(registrationId: string, updateData: any): Promise<void> {
        try {
            await db.teamRegistration.update({
                where: { id: registrationId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`teamRegistration:${registrationId}`, 'dbStatus', 'SYNCED');
            logger.info(`Team registration ${registrationId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating team registration ${registrationId}:`, error);
            throw error;
        }
    }

    private async processBatchSync(): Promise<void> {
        logger.info('Starting batch sync process');

        //get all pending items from the redis
        const tournamentKeys = await redis.keys('tournaments:*');
        const matchKeys = await redis.keys('match:*');

        let syncCount = 0;

        //process tournaments
        for (const key of tournamentKeys) {
            const tournament = await redis.hgetObject<any>(key);
            if (tournament && tournament.dbStatus !== 'SYNCED') {
                try {
                    await this.syncTournamentCreate(tournament);
                    syncCount++;
                } catch (error) {
                    logger.error(`Error syncing tournament ${tournament.id}:`, error);
                }
            }
        }

        //process matches
        for (const key of matchKeys) {
            const match = await redis.hgetObject<any>(key);
            if (match && match.dbStatus !== 'SYNCED') {
                try {
                    await this.syncMatchCreate(match);
                    syncCount++;
                } catch (error) {
                    logger.error(`Error syncing match ${match.id}:`, error);
                }
            }
        }

        logger.info(`Batch sync process completed. Total items synced to database: ${syncCount}`);
    }
    private async syncScoringRuleCreate(scoringRuleData: any): Promise<void> {
        try {
            const scoringRule = await db.scoringRule.create({
                data: {
                    id: scoringRuleData.id,
                    tournamentId: scoringRuleData.tournamentId,
                    ruleName: scoringRuleData.ruleName,
                    ruleType: scoringRuleData.ruleType,
                    isActive: scoringRuleData.isActive,
                    priority: scoringRuleData.priority,
                    killPoints: scoringRuleData.killPoints,
                    positionMultiplier: scoringRuleData.positionMultiplier,
                    customFormula: scoringRuleData.customFormula,
                    description: scoringRuleData.description,
                    createdBy: scoringRuleData.createdBy,
                    createdAt: new Date(scoringRuleData.createdAt),
                    updatedAt: new Date(scoringRuleData.updatedAt)
                }
            });

            await redis.hset(`scoringRule:${scoringRule.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Scoring rule ${scoringRule.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Scoring rule ${scoringRuleData.id} already exists in database`);
                await redis.hset(`scoringRule:${scoringRuleData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating scoring rule ${scoringRuleData.id}:`, error);
            }
            throw error;
        }
    }

    private async syncScoringRuleUpdate(ruleId: string, updateData: any): Promise<void> {
        try {
            await db.scoringRule.update({
                where: { id: ruleId },
                data: {
                    ...updateData,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`scoringRule:${ruleId}`, 'dbStatus', 'SYNCED');
            logger.info(`Scoring rule ${ruleId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating scoring rule ${ruleId}:`, error);
            throw error;
        }
    }

    private async syncScoringRuleDelete(ruleId: string): Promise<void> {
        try {
            await db.scoringRule.delete({
                where: { id: ruleId }
            });

            await redis.delete(`scoringRule:${ruleId}`);
            logger.info(`Scoring rule ${ruleId} deleted from database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Scoring rule ${ruleId} not found in database, considering as deleted`);
            } else {
                logger.error(`Error deleting scoring rule ${ruleId}:`, error);
                throw error;
            }
        }
    }
    private async syncMatchResultCreate(matchResultData: any): Promise<void> {
        try {
            // Extract team results for database storage
            const teamResults = matchResultData.teamResults || [];

            // Create match results in database for each team
            for (const teamResult of teamResults) {
                await db.matchResult.create({
                    data: {
                        id: `${matchResultData.id}_${teamResult.teamRegistrationId}`,
                        matchId: matchResultData.matchId,
                        teamRegistrationId: teamResult.teamRegistrationId,
                        slotNumber: teamResult.slotNumber,
                        position: teamResult.position,
                        totalKills: teamResult.kills,
                        killPoints: teamResult.scoreBreakdown?.find((s: any) => s.ruleType === 'KILL_POINTS')?.points || 0,
                        positionPoints: teamResult.scoreBreakdown?.find((s: any) => s.ruleType === 'POSITION_POINTS')?.points || 0,
                        totalMatchPoints: teamResult.totalScore,
                        playerResults: {
                            teamName: teamResult.teamName,
                            kills: teamResult.kills,
                            damage: teamResult.damage,
                            scoreBreakdown: teamResult.scoreBreakdown
                        },
                        verifiedBy: matchResultData.verifiedBy,
                        verifiedAt: matchResultData.verifiedAt ? new Date(matchResultData.verifiedAt) : null
                    }
                });
            }

            await redis.hset(`matchResult:${matchResultData.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Match result ${matchResultData.id} synced to database successfully`);

        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Match result ${matchResultData.id} already exists in database`);
                await redis.hset(`matchResult:${matchResultData.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating match result ${matchResultData.id}:`, error);
            }
            throw error;
        }
    }

    private async syncMatchResultUpdate(resultId: string, updateData: any): Promise<void> {
        try {
            // Update team results in database
            if (updateData.teamResults) {
                for (const teamResult of updateData.teamResults) {
                    await db.matchResult.updateMany({
                        where: {
                            matchId: updateData.matchId,
                            teamRegistrationId: teamResult.teamRegistrationId
                        },
                        data: {
                            position: teamResult.position,
                            totalKills: teamResult.kills,
                            killPoints: teamResult.scoreBreakdown?.find((s: any) => s.ruleType === 'KILL_POINTS')?.points || 0,
                            positionPoints: teamResult.scoreBreakdown?.find((s: any) => s.ruleType === 'POSITION_POINTS')?.points || 0,
                            totalMatchPoints: teamResult.totalScore,
                            playerResults: {
                                teamName: teamResult.teamName,
                                kills: teamResult.kills,
                                damage: teamResult.damage,
                                scoreBreakdown: teamResult.scoreBreakdown
                            },
                            verifiedBy: updateData.verifiedBy,
                            verifiedAt: updateData.verifiedAt ? new Date(updateData.verifiedAt) : null,
                            updatedAt: new Date()
                        }
                    });
                }
            }

            await redis.hset(`matchResult:${resultId}`, 'dbStatus', 'SYNCED');
            logger.info(`Match result ${resultId} updated successfully in database`);

        } catch (error) {
            logger.error(`Error updating match result ${resultId}:`, error);
            throw error;
        }
    }

    private async syncMatchResultDelete(resultId: string): Promise<void> {
        try {
            // Delete all match results for this result ID
            await db.matchResult.deleteMany({
                where: {
                    id: {
                        startsWith: resultId
                    }
                }
            });

            await redis.delete(`matchResult:${resultId}`);
            logger.info(`Match result ${resultId} deleted from database successfully`);

        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Match result ${resultId} not found in database, considering as deleted`);
            } else {
                logger.error(`Error deleting match result ${resultId}:`, error);
                throw error;
            }
        }
    }

    private async syncSlotAssignmentCreate(slotData: any): Promise<void> {
        try {
            const slotAssignment = await db.slotAssignment.create({
                data: {
                    id: slotData.id,
                    slotNumber: slotData.slotNumber,
                    groupId: slotData.groupId,
                    teamRegistrationId: slotData.teamRegistrationId,
                    isActive: slotData.isActive,
                    assignedAt: new Date(slotData.assignedAt),
                    assignedBy: slotData.assignedBy,
                }
            });

            await redis.hset(`slotAssignment:${slotAssignment.id}`, 'dbStatus', 'SYNCED');
            logger.info(`Slot assignment ${slotAssignment.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Slot assignment ${slotData.id} already exists in database`);
            } else {
                throw error;
            }
        }
    }

    private async syncSlotAssignmentUpdate(slotId: string, updateData: any): Promise<void> {
        try {
            const updated = await db.slotAssignment.update({
                where: { id: slotId },
                data: {
                    teamRegistrationId: updateData.teamRegistrationId,
                    isActive: updateData.isActive,
                    assignedAt: updateData.assignedAt ? new Date(updateData.assignedAt) : undefined,
                }
            });

            await redis.hset(`slotAssignment:${slotId}`, 'dbStatus', 'SYNCED');
            logger.info(`Slot assignment ${slotId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating slot assignment ${slotId}:`, error);
            throw error;
        }
    }
    private async syncSlotAssignmentDelete(slotId: string): Promise<void> {
        try {
            await db.slotAssignment.delete({
                where: { id: slotId }
            });

            await redis.delete(`slotAssignment:${slotId}`);
            logger.info(`Slot assignment ${slotId} deleted from database successfully`);
        } catch (error) {
            logger.error(`Error deleting slot assignment ${slotId}:`, error);
            throw error;
        }
    }
    private async syncTournamentStageCreate(data: any): Promise<void> {
        try {
            const tournamentStage = await db.tournamentStage.create({
                data: {
                    id: data.id,
                    name: data.name,
                    stageNumber: data.stageNumber,
                    totalGroups: data.totalGroups,
                    qualificationSpots: data.qualificationSpots,
                    stageFormat: data.stageFormat,
                    isActive: data.isActive,
                    isCompleted: data.isCompleted,
                    tournamentId: data.tournamentId,
                    createdAt: new Date(data.createdAt),
                    updatedAt: new Date(data.updatedAt || data.createdAt)
                }
            });

            await redis.hset(`stage:${tournamentStage.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`stage:${tournamentStage.id}`, 'dbSyncedAt', new Date().toISOString());
            logger.info(`Tournament stage ${tournamentStage.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Tournament stage ${data.id} already exists in database`);
                await redis.hset(`stage:${data.id}`, 'dbStatus', 'SYNCED');
                await redis.hset(`stage:${data.id}`, 'dbSyncedAt', new Date().toISOString());
            } else {
                logger.error(`Error creating tournament stage ${data.id}:`, error);
                await redis.hset(`stage:${data.id}`, 'dbStatus', 'ERROR');
                throw error;
            }
        }
    }

    private async syncTournamentStageUpdate(entityId: string, data: any): Promise<void> {
        try {
            await db.tournamentStage.update({
                where: { id: entityId },
                data: {
                    name: data.name,
                    stageNumber: data.stageNumber,
                    totalGroups: data.totalGroups,
                    qualificationSpots: data.qualificationSpots,
                    stageFormat: data.stageFormat,
                    isActive: data.isActive,
                    isCompleted: data.isCompleted,
                    updatedAt: new Date()
                }
            });

            await redis.hset(`stage:${entityId}`, 'dbStatus', 'SYNCED');
            await redis.hset(`stage:${entityId}`, 'dbSyncedAt', new Date().toISOString());
            logger.info(`Tournament stage ${entityId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating tournament stage ${entityId}:`, error);
            await redis.hset(`stage:${entityId}`, 'dbStatus', 'ERROR');
            throw error;
        }
    }

    private async syncTournamentStageDelete(entityId: string): Promise<void> {
        try {
            await db.tournamentStage.delete({
                where: { id: entityId }
            });

            // Clean up Redis cache
            await redis.delete(`stage:${entityId}`);
            logger.info(`Tournament stage ${entityId} deleted from database successfully`);
        } catch (error) {
            logger.error(`Error deleting tournament stage ${entityId}:`, error);
            throw error;
        }
    }

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
}