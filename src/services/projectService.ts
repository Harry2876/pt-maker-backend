import { BaseService } from './baseService';
import { ProjectStatus } from '../generated/prisma';

export class ProjectService extends BaseService {

    async createProject(userId: string, projectData: {
        name: string;
        description?: string;
        gameMode?: string;
        teamCount?: number;
        settings?: any;
    }) {
        try {
            const project = await this.db.project.create({
                data: {
                    name: projectData.name,
                    description: projectData.description,
                    gameMode: projectData.gameMode || 'Classic',
                    teamCount: projectData.teamCount,
                    settings: projectData.settings,
                    userId
                }
            });

            this.logger.info(`Project created: ${project.name} by user ${userId}`);
            return project;

        } catch (error) {
            this.handleError(error, 'Project creation');
            return null;
        }
    }

    async getUserProjects(userId: string) {
        try {
            const projects = await this.db.project.findMany({
                where: { userId },
                include: {
                    matches: {
                        select: {
                            id: true,
                            matchNumber: true,
                            processingStatus: true,
                            createdAt: true
                        }
                    },
                    _count: {
                        select: { matches: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            return projects;

        } catch (error) {
            this.handleError(error, 'Get user projects');
            return null;
        }
    }

    async getProjectById(projectId: string, userId: string) {
        try {
            const project = await this.db.project.findFirst({
                where: { 
                    id: projectId,
                    userId // Ensure user owns the project
                },
                include: {
                    matches: {
                        include: {
                            teamResults: true
                        },
                        orderBy: { matchNumber: 'asc' }
                    }
                }
            });

            if (!project) {
                throw new Error('Project not found or access denied');
            }

            return project;

        } catch (error) {
            this.handleError(error, 'Get project by ID');
            return null;
        }
    }

    async updateProject(projectId: string, userId: string, updateData: {
        name?: string;
        description?: string;
        gameMode?: string;
        teamCount?: number;
        settings?: any;
        status?: ProjectStatus;
    }) {
        try {
            const project = await this.db.project.updateMany({
                where: {
                    id: projectId,
                    userId // Ensure user owns the project
                },
                data: updateData
            });

            if (project.count === 0) {
                throw new Error('Project not found or access denied');
            }

            this.logger.info(`Project ${projectId} updated by user ${userId}`);
            
            // Return updated project
            return await this.getProjectById(projectId, userId);

        } catch (error) {
            this.handleError(error, 'Update project');
            return null;
        }
    }

    async deleteProject(projectId: string, userId: string) {
        try {
            const project = await this.db.project.deleteMany({
                where: {
                    id: projectId,
                    userId // Ensure user owns the project
                }
            });

            if (project.count === 0) {
                throw new Error('Project not found or access denied');
            }

            this.logger.info(`Project ${projectId} deleted by user ${userId}`);
            return { success: true, message: 'Project deleted successfully' };

        } catch (error) {
            this.handleError(error, 'Delete project');
            return null;
        }
    }
}

export const projectService = new ProjectService();
