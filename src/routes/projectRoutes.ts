import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { projectService } from '../services/projectService';

const projectRouter = express.Router();

// GET /api/v1/projects
projectRouter.get('/', authenticateUser, async (req, res) => {
    try {
        const projects = await projectService.getUserProjects(req.user!.id);
        
        return res.json({
            success: true,
            projects: projects || [],
            count: projects?.length || 0
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch projects';
        return res.status(500).json({ error: errorMessage });
    }
});

// POST /api/v1/projects
projectRouter.post('/', authenticateUser, async (req, res) => {
    try {
        const { name, description, gameMode, teamCount, settings } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Project name is required' });
        }
        
        const project = await projectService.createProject(req.user!.id, {
            name,
            description,
            gameMode,
            teamCount,
            settings
        });
        
        if (!project) {
            return res.status(500).json({ error: 'Failed to create project' });
        }
        
        return res.status(201).json({
            success: true,
            project,
            message: 'Project created successfully'
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
        return res.status(400).json({ error: errorMessage });
    }
});

// GET /api/v1/projects/:id
projectRouter.get('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        
        const project = await projectService.getProjectById(id, req.user!.id);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        return res.json({
            success: true,
            project
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch project';
        return res.status(500).json({ error: errorMessage });
    }
});

// PUT /api/v1/projects/:id
projectRouter.put('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        const project = await projectService.updateProject(id, req.user!.id, updateData);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        return res.json({
            success: true,
            project,
            message: 'Project updated successfully'
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update project';
        return res.status(400).json({ error: errorMessage });
    }
});

// DELETE /api/v1/projects/:id
projectRouter.delete('/:id', authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await projectService.deleteProject(id, req.user!.id);
        
        if (!result) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        return res.json(result);
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
        return res.status(400).json({ error: errorMessage });
    }
});

export default projectRouter;