import { BaseService } from './baseService';
import { ProcessingStatus } from '../generated/prisma';

export class MatchService extends BaseService {

    async createMatch(projectId: string, matchData: {
        matchNumber: number;
        mapName?: string;
        totalTeams?: number;
    }) {
        try {
            const match = await this.db.match.create({
                data: {
                    matchNumber: matchData.matchNumber,
                    mapName: matchData.mapName,
                    totalTeams: matchData.totalTeams,
                    projectId,
                    processingStatus: 'PENDING'
                }
            });

            this.logger.info(`Match created: ${match.id} for project ${projectId}`);
            return match;

        } catch (error) {
            this.handleError(error, 'Create match');
            return null;
        }
    }

    async getMatchById(matchId: string) {
        try {
            const match = await this.db.match.findUnique({
                where: { id: matchId },
                include: {
                    project: {
                        select: {
                            id: true,
                            name: true,
                            userId: true
                        }
                    },
                    imageUploads: true,
                    teamResults: {
                        orderBy: { position: 'asc' }
                    }
                }
            });

            return match;

        } catch (error) {
            this.handleError(error, 'Get match by ID');
            return null;
        }
    }

    async uploadMatchImages(matchId: string, files: Array<{
        filename: string;
        originalName: string;
        size: number;
        mimetype: string;
        path: string;
        imageType: 'SLOT_ASSIGNMENT' | 'RESULT_SCREEN' | 'KILL_FEED' | 'OTHER';
    }>) {
        try {
            // Update match status
            await this.db.match.update({
                where: { id: matchId },
                data: { processingStatus: 'UPLOADING' }
            });

            // Create image upload records
            const imageUploads = await Promise.all(
                files.map(file => 
                    this.db.imageUpload.create({
                        data: {
                            filename: file.filename,
                            originalName: file.originalName,
                            fileSize: file.size,
                            mimeType: file.mimetype,
                            imageType: file.imageType,
                            storageUrl: file.path,
                            matchId
                        }
                    })
                )
            );

            this.logger.info(`${files.length} images uploaded for match ${matchId}`);
            return imageUploads;

        } catch (error) {
            this.handleError(error, 'Upload match images');
            return null;
        }
    }

    async processMatchResults(matchId: string, aiProcessedData: {
        teamResults: Array<{
            teamName: string;
            position: number;
            kills: number;
            points: number;
            survivalTime?: string;
            isEliminated: boolean;
        }>;
        processingTime: number;
    }) {
        try {
            // Update match with processing results
            const match = await this.db.match.update({
                where: { id: matchId },
                data: {
                    processingStatus: 'COMPLETED',
                    pointsData: aiProcessedData,
                    processingTime: aiProcessedData.processingTime
                }
            });

            // Create team results
            await this.db.teamResult.createMany({
                data: aiProcessedData.teamResults.map(team => ({
                    teamName: team.teamName,
                    position: team.position,
                    kills: team.kills,
                    points: team.points,
                    survivalTime: team.survivalTime,
                    isEliminated: team.isEliminated,
                    matchId
                }))
            });

            this.logger.info(`Match ${matchId} processing completed`);
            return match;

        } catch (error) {
            this.handleError(error, 'Process match results');
            return null;
        }
    }

    async updateMatchStatus(matchId: string, status: ProcessingStatus, errorMessage?: string) {
        try {
            const match = await this.db.match.update({
                where: { id: matchId },
                data: {
                    processingStatus: status,
                    errorMessage: errorMessage || null,
                    updatedAt: new Date()
                }
            });

            this.logger.info(`Match ${matchId} status updated to ${status}`);
            return match;

        } catch (error) {
            this.handleError(error, 'Update match status');
            return null;
        }
    }

    async getProjectMatches(projectId: string) {
        try {
            const matches = await this.db.match.findMany({
                where: { projectId },
                include: {
                    teamResults: {
                        orderBy: { position: 'asc' }
                    },
                    _count: {
                        select: { 
                            imageUploads: true,
                            teamResults: true 
                        }
                    }
                },
                orderBy: { matchNumber: 'asc' }
            });

            return matches;

        } catch (error) {
            this.handleError(error, 'Get project matches');
            return null;
        }
    }
}

export const matchService = new MatchService();
