import { Request, Response } from 'express';
import { tournamentCollaboratorService } from '../services/tournamentCollaboratorService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class TournamentCollaboratorController {
    // Create collaborator (invite user)
    static createCollaborator = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { userId, role } = req.body;
        const invitedBy = req.user!.id;

        const collaborator = await tournamentCollaboratorService.createCollaborator({
            tournamentId,
            userId,
            role,
            invitedBy
        });

        if (!collaborator) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create collaborator'));
        }

        return res.status(201).json(ResponseHelper.success('Collaborator invited successfully', collaborator));
    });

    // Get tournament collaborators
    static getTournamentCollaborators = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const collaborators = await tournamentCollaboratorService.getTournamentCollaborators(tournamentId);

        if (!collaborators || collaborators.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No collaborators found for this tournament'));
        }

        return res.status(200).json(ResponseHelper.success('Tournament collaborators retrieved successfully', {
            collaborators,
            count: collaborators.length
        }));
    });

    // Get collaborator by ID
    static getCollaboratorById = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;

        const collaborator = await tournamentCollaboratorService.getCollaboratorById(collaboratorId);

        if (!collaborator) {
            return res.status(404).json(ResponseHelper.notFound('Collaborator not found'));
        }

        return res.status(200).json(ResponseHelper.success('Collaborator retrieved successfully', collaborator));
    });

    // Update collaborator
    static updateCollaborator = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        const updatedCollaborator = await tournamentCollaboratorService.updateCollaborator(collaboratorId, updateData, userId);

        if (!updatedCollaborator) {
            return res.status(404).json(ResponseHelper.notFound('Collaborator not found or update failed'));
        }

        return res.status(200).json(ResponseHelper.success('Collaborator updated successfully', updatedCollaborator));
    });

    // Delete collaborator (remove from tournament)
    static deleteCollaborator = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;
        const userId = req.user!.id;

        const deleted = await tournamentCollaboratorService.deleteCollaborator(collaboratorId, userId);

        if (!deleted) {
            return res.status(404).json(ResponseHelper.notFound('Collaborator not found or deletion failed'));
        }

        return res.status(200).json(ResponseHelper.success('Collaborator removed successfully'));
    });

    // Accept collaboration invitation
    static acceptInvitation = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;
        const userId = req.user!.id;

        const accepted = await tournamentCollaboratorService.updateCollaborator(collaboratorId, { 
            status: 'ACTIVE' 
        }, userId);

        if (!accepted) {
            return res.status(404).json(ResponseHelper.notFound('Invitation not found or already processed'));
        }

        return res.status(200).json(ResponseHelper.success('Collaboration invitation accepted successfully', accepted));
    });

    // Decline collaboration invitation
    static declineInvitation = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;
        const userId = req.user!.id;

        // When declining, we delete the invitation instead of updating status
        const deleted = await tournamentCollaboratorService.deleteCollaborator(collaboratorId, userId);

        if (!deleted) {
            return res.status(404).json(ResponseHelper.notFound('Invitation not found or already processed'));
        }

        return res.status(200).json(ResponseHelper.success('Collaboration invitation declined and removed'));
    });

    // Get user permissions for tournament
    static getUserPermissions = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const permissions = await tournamentCollaboratorService.getUserPermissions(tournamentId, userId);

        return res.status(200).json(ResponseHelper.success('User permissions retrieved successfully', permissions));
    });

    // Get user's collaborations (tournaments they collaborate on)
    static getUserCollaborations = asyncHandler(async (req: Request, res: Response) => {
        // Stub — not implemented; data is intentionally empty (see API docs)
        return res.status(200).json(ResponseHelper.success('User collaborations endpoint ready', {}));
    });

    // Change collaborator role
    static changeCollaboratorRole = asyncHandler(async (req: Request, res: Response) => {
        const { collaboratorId } = req.params;
        const { role } = req.body;
        const userId = req.user!.id;

        const updated = await tournamentCollaboratorService.updateCollaborator(collaboratorId, { role }, userId);

        if (!updated) {
            return res.status(404).json(ResponseHelper.notFound('Collaborator not found or role change failed'));
        }

        return res.status(200).json(ResponseHelper.success('Collaborator role updated successfully', updated));
    });

    // Bulk invite collaborators
    static bulkInviteCollaborators = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { collaborators } = req.body; // Array of { userId, role }
        const invitedBy = req.user!.id;

        const results = [];
        
        for (const collab of collaborators) {
            const result = await tournamentCollaboratorService.createCollaborator({
                tournamentId,
                userId: collab.userId,
                role: collab.role,
                invitedBy
            });
            results.push(result);
        }

        const successCount = results.filter(r => r !== null).length;

        return res.status(201).json(ResponseHelper.success(`Bulk invitation completed. ${successCount}/${collaborators.length} successful`, {
            results,
            successCount,
            totalCount: collaborators.length
        }));
    });
}