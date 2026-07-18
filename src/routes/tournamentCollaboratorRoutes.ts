import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TournamentCollaboratorController } from '../controllers/tournamentCollaboratorController';
import {
    tournamentCollaboratorParamsSchema,
    collaboratorParamsSchema,
    createCollaboratorSchema,
    updateCollaboratorSchema,
    changeCollaboratorRoleSchema,
    bulkInviteCollaboratorsSchema
} from '../validations/collaboratorValidation';

const tournamentCollaboratorRouter = express.Router();

tournamentCollaboratorRouter.use(authenticateUser);

tournamentCollaboratorRouter.get(
    '/tournaments/:tournamentId/collaborators',
    validateRequest(tournamentCollaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.getTournamentCollaborators
);

tournamentCollaboratorRouter.post(
    '/tournaments/:tournamentId/collaborators',
    validateRequest(tournamentCollaboratorParamsSchema, 'params'),
    validateRequest(createCollaboratorSchema),
    TournamentCollaboratorController.createCollaborator
);

tournamentCollaboratorRouter.post(
    '/tournaments/:tournamentId/collaborators/bulk',
    validateRequest(tournamentCollaboratorParamsSchema, 'params'),
    validateRequest(bulkInviteCollaboratorsSchema),
    TournamentCollaboratorController.bulkInviteCollaborators
);

tournamentCollaboratorRouter.get(
    '/tournaments/:tournamentId/permissions',
    validateRequest(tournamentCollaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.getUserPermissions
);

tournamentCollaboratorRouter.get(
    '/collaborators/:collaboratorId',
    validateRequest(collaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.getCollaboratorById
);

tournamentCollaboratorRouter.put(
    '/collaborators/:collaboratorId',
    validateRequest(collaboratorParamsSchema, 'params'),
    validateRequest(updateCollaboratorSchema),
    TournamentCollaboratorController.updateCollaborator
);

tournamentCollaboratorRouter.delete(
    '/collaborators/:collaboratorId',
    validateRequest(collaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.deleteCollaborator
);

tournamentCollaboratorRouter.post(
    '/collaborators/:collaboratorId/accept',
    validateRequest(collaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.acceptInvitation
);

tournamentCollaboratorRouter.post(
    '/collaborators/:collaboratorId/decline',
    validateRequest(collaboratorParamsSchema, 'params'),
    TournamentCollaboratorController.declineInvitation
);

tournamentCollaboratorRouter.put(
    '/collaborators/:collaboratorId/role',
    validateRequest(collaboratorParamsSchema, 'params'),
    validateRequest(changeCollaboratorRoleSchema),
    TournamentCollaboratorController.changeCollaboratorRole
);

tournamentCollaboratorRouter.get(
    '/user/collaborations',
    TournamentCollaboratorController.getUserCollaborations
);

export default tournamentCollaboratorRouter;
