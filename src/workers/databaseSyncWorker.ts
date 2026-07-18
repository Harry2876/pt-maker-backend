import { BaseWorker } from "./baseWorker";
import { Job } from "bullmq";
import { Queues } from "../config/queues";
import { DatabaseSyncJob, BatchSyncJob } from "../types/queue";
import logger from "../utils/logger";
import redis from "../config/redis";
import { db } from "../config/database";

export class DatabaseSyncWorker extends BaseWorker<DatabaseSyncJob> {
    constructor() {
        super(Queues.DATABASE_SYNC, { concurrency: 2 });
    }

    protected async processJob(job: Job<DatabaseSyncJob>): Promise<any> {
        const { type, entityId, data, userId } = job.data;

        logger.debug(`Processing database sync job: ${type} for entity: ${entityId}`);

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
                case 'MATCH_DELETE':
                    return await this.syncMatchDelete(entityId);
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
                case 'TEAM_REGISTRATION_DELETE':
                    return await this.syncTeamRegistrationDelete(entityId);
                case 'COLLABORATOR_CREATE':
                    return await this.syncCollaboratorCreate(data);
                case 'COLLABORATOR_UPDATE':
                    return await this.syncCollaboratorUpdate(entityId, data);
                case 'DELETE_COLLABORATOR':
                    return await this.syncCollaboratorDelete(entityId);
                case 'PLAYER_CREATE':
                    return await this.syncPlayerCreate(data);
                case 'PLAYER_UPDATE':
                    return await this.syncPlayerUpdate(entityId, data);
                case 'PLAYER_DELETE':
                    return await this.syncPlayerDelete(entityId);
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
                    tournamentType: tournamentData.tournamentType || 'TOURNAMENT',
                    maxTeams: tournamentData.maxTeams,
                    entryFee: tournamentData.entryFee,
                    prizePool: tournamentData.prizePool,
                    totalStages: tournamentData.totalStages ?? 1,
                    currentStage: tournamentData.currentStage ?? 1,
                    tournamentFormat: tournamentData.tournamentFormat || 'ELIMINATION',
                    maxTeamsPerGroup: tournamentData.maxTeamsPerGroup ?? 25,
                    allowCollaborators: tournamentData.allowCollaborators ?? false,
                    createdAt: new Date(tournamentData.createdAt),
                    updatedAt: new Date(tournamentData.updatedAt || tournamentData.createdAt)
                }
            });

            //update redis status
            await redis.hset(`tournament:${tournament.id}`, 'dbStatus', 'SYNCED');
            await redis.hset(`tournament:${tournament.id}`, 'dbSyncedAt', new Date().toISOString());

            logger.debug(`Tournament ${tournament.id} created and synced to database successfully`);
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
            logger.debug(`Tournament ${tournamentId} updated successfully in database`);
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
            logger.debug(`Tournament ${tournamentId} deleted successfully from database`);
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
                    groupId: matchData.groupId,
                    matchDate: new Date(matchData.matchDate),
                    createdAt: new Date(matchData.createdAt),
                    updatedAt: new Date(matchData.updatedAt || matchData.createdAt)
                }
            });

            await redis.hset(`match:${match.id}`, 'dbStatus', 'SYNCED');
            logger.debug(`Match ${match.id} created and synced to database successfully`);
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
            logger.debug(`Match ${matchId} updated successfully in database`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.error(`Match ${matchId} update conflict:`, error);
            } else {
                logger.error(`Error updating match ${matchId}:`, error);
            }
            throw error;
        }
    }

    private async syncMatchDelete(matchId: string): Promise<void> {
        try {
            await db.match.delete({
                where: { id: matchId }
            });

            logger.debug(`Match ${matchId} deleted successfully from database`);
        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Match ${matchId} not found in database for deletion`);
            } else {
                logger.error(`Error deleting match ${matchId}:`, error);
                throw error;
            }
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
            logger.debug(`Screenshot ${screenshot.id} created and synced to database successfully`);
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
            logger.debug(`Screenshot ${screenshotId} deleted successfully from database`);
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
                    stageId: groupData.stageId,
                    createdAt: new Date(groupData.createdAt),
                    updatedAt: new Date(groupData.updatedAt || groupData.createdAt)
                }
            });

            await redis.hset(`group:${group.id}`, 'dbStatus', 'SYNCED');
            logger.debug(`Group ${group.id} created and synced to database successfully`);
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
            logger.debug(`Group ${groupId} updated successfully in database`);
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
            logger.debug(`Group ${groupId} deleted successfully from database`);
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
            logger.debug(`Team registration ${registration.id} created and synced to database successfully`);
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
            const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
            if (updateData.teamName !== undefined) updatePayload.teamName = updateData.teamName;
            if (updateData.contactInfo !== undefined) updatePayload.contactInfo = updateData.contactInfo;
            if (updateData.registrationStatus !== undefined) updatePayload.registrationStatus = updateData.registrationStatus;
            if (updateData.finalPosition !== undefined) updatePayload.finalPosition = updateData.finalPosition;
            if (updateData.totalPoints !== undefined) updatePayload.totalPoints = updateData.totalPoints;
            if (updateData.groupId !== undefined) updatePayload.groupId = updateData.groupId;

            await db.teamRegistration.update({
                where: { id: registrationId },
                data: updatePayload
            });

            await redis.hset(`teamRegistration:${registrationId}`, 'dbStatus', 'SYNCED');
            logger.debug(`Team registration ${registrationId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating team registration ${registrationId}:`, error);
            throw error;
        }
    }

    private async syncTeamRegistrationDelete(registrationId: string): Promise<void> {
        try {
            await db.teamRegistration.delete({
                where: { id: registrationId }
            });

            logger.debug(`Team registration ${registrationId} deleted successfully from database`);
        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Team registration ${registrationId} not found in database for deletion`);
            } else {
                logger.error(`Error deleting team registration ${registrationId}:`, error);
                throw error;
            }
        }
    }

    private async processBatchSync(): Promise<void> {
        logger.debug('Starting batch sync process');

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

        logger.debug(`Batch sync process completed. Total items synced to database: ${syncCount}`);
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
            logger.debug(`Scoring rule ${scoringRule.id} created and synced to database successfully`);
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
            logger.debug(`Scoring rule ${ruleId} updated successfully in database`);
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
            logger.debug(`Scoring rule ${ruleId} deleted from database successfully`);
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
            logger.debug(`Match result ${matchResultData.id} synced to database successfully`);

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
            logger.debug(`Match result ${resultId} updated successfully in database`);

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
            logger.debug(`Match result ${resultId} deleted from database successfully`);

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
            logger.debug(`Slot assignment ${slotAssignment.id} created and synced to database successfully`);
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
            logger.debug(`Slot assignment ${slotId} updated successfully in database`);
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
            logger.debug(`Slot assignment ${slotId} deleted from database successfully`);
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
            logger.debug(`Tournament stage ${tournamentStage.id} created and synced to database successfully`);
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
            const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
            if (data.name !== undefined) updatePayload.name = data.name;
            if (data.stageNumber !== undefined) updatePayload.stageNumber = data.stageNumber;
            if (data.totalGroups !== undefined) updatePayload.totalGroups = data.totalGroups;
            if (data.qualificationSpots !== undefined) updatePayload.qualificationSpots = data.qualificationSpots;
            if (data.stageFormat !== undefined) updatePayload.stageFormat = data.stageFormat;
            if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
            if (data.isCompleted !== undefined) updatePayload.isCompleted = data.isCompleted;

            await db.tournamentStage.update({
                where: { id: entityId },
                data: updatePayload
            });

            await redis.hset(`stage:${entityId}`, 'dbStatus', 'SYNCED');
            await redis.hset(`stage:${entityId}`, 'dbSyncedAt', new Date().toISOString());
            logger.debug(`Tournament stage ${entityId} updated successfully in database`);
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
            logger.debug(`Tournament stage ${entityId} deleted from database successfully`);
        } catch (error) {
            logger.error(`Error deleting tournament stage ${entityId}:`, error);
            throw error;
        }
    }

    private async syncCollaboratorCreate(data: any): Promise<void> {
        try {
            await db.tournamentCollaborator.create({
                data: {
                    id: data.id,
                    tournamentId: data.tournamentId,
                    userId: data.userId,
                    role: data.role,
                    status: data.status,
                    invitedBy: data.invitedBy,
                    invitedAt: new Date(data.invitedAt),
                    acceptedAt: data.acceptedAt ? new Date(data.acceptedAt) : null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            await redis.hset(`collaborator:${data.id}`, 'dbStatus', 'SYNCED');
            logger.debug(`Collaborator ${data.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Collaborator ${data.id} already exists in database`);
                await redis.hset(`collaborator:${data.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating collaborator ${data.id}:`, error);
                throw error;
            }
        }
    }

    private async syncCollaboratorUpdate(collaboratorId: string, data: any): Promise<void> {
        try {
            const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
            if (data.role !== undefined) updatePayload.role = data.role;
            if (data.status !== undefined) updatePayload.status = data.status;
            if (data.acceptedAt !== undefined) {
                updatePayload.acceptedAt = data.acceptedAt ? new Date(data.acceptedAt) : null;
            }

            await db.tournamentCollaborator.update({
                where: { id: collaboratorId },
                data: updatePayload
            });

            await redis.hset(`collaborator:${collaboratorId}`, 'dbStatus', 'SYNCED');
            logger.debug(`Collaborator ${collaboratorId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating collaborator ${collaboratorId}:`, error);
            throw error;
        }
    }

    private async syncCollaboratorDelete(collaboratorId: string): Promise<void> {
        try {
            await db.tournamentCollaborator.delete({
                where: { id: collaboratorId }
            });

            logger.debug(`Collaborator ${collaboratorId} deleted successfully from database`);
        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Collaborator ${collaboratorId} not found in database for deletion`);
            } else {
                logger.error(`Error deleting collaborator ${collaboratorId}:`, error);
                throw error;
            }
        }
    }

    private async syncPlayerCreate(data: any): Promise<void> {
        try {
            await db.player.create({
                data: {
                    id: data.id,
                    name: data.name,
                    gameUuid: data.gameUuid,
                    email: data.email,
                    phoneNumber: data.phoneNumber,
                    totalMatches: data.totalMatches ?? 0,
                    totalKills: data.totalKills ?? 0,
                    totalPoints: data.totalPoints ?? 0,
                    averageKills: data.averageKills ?? 0,
                    bestPosition: data.bestPosition,
                    createdAt: new Date(data.createdAt),
                    updatedAt: new Date(data.updatedAt || data.createdAt)
                }
            });

            await redis.hset(`player:${data.id}`, 'dbStatus', 'SYNCED');
            logger.debug(`Player ${data.id} created and synced to database successfully`);
        } catch (error) {
            if ((error as any).code === 'P2002') {
                logger.warn(`Player ${data.id} already exists in database`);
                await redis.hset(`player:${data.id}`, 'dbStatus', 'SYNCED');
            } else {
                logger.error(`Error creating player ${data.id}:`, error);
                throw error;
            }
        }
    }

    private async syncPlayerUpdate(playerId: string, data: any): Promise<void> {
        try {
            const updatePayload: Record<string, unknown> = { updatedAt: new Date() };
            if (data.name !== undefined) updatePayload.name = data.name;
            if (data.gameUuid !== undefined) updatePayload.gameUuid = data.gameUuid;
            if (data.email !== undefined) updatePayload.email = data.email;
            if (data.phoneNumber !== undefined) updatePayload.phoneNumber = data.phoneNumber;
            if (data.totalMatches !== undefined) updatePayload.totalMatches = data.totalMatches;
            if (data.totalKills !== undefined) updatePayload.totalKills = data.totalKills;
            if (data.totalPoints !== undefined) updatePayload.totalPoints = data.totalPoints;
            if (data.averageKills !== undefined) updatePayload.averageKills = data.averageKills;
            if (data.bestPosition !== undefined) updatePayload.bestPosition = data.bestPosition;

            await db.player.update({
                where: { id: playerId },
                data: updatePayload
            });

            await redis.hset(`player:${playerId}`, 'dbStatus', 'SYNCED');
            logger.debug(`Player ${playerId} updated successfully in database`);
        } catch (error) {
            logger.error(`Error updating player ${playerId}:`, error);
            throw error;
        }
    }

    private async syncPlayerDelete(playerId: string): Promise<void> {
        try {
            await db.player.delete({
                where: { id: playerId }
            });

            logger.debug(`Player ${playerId} deleted successfully from database`);
        } catch (error) {
            if ((error as any).code === 'P2025') {
                logger.warn(`Player ${playerId} not found in database for deletion`);
            } else {
                logger.error(`Error deleting player ${playerId}:`, error);
                throw error;
            }
        }
    }

}