import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { GroupController } from '../controllers/groupController';
import { 
    createGroupSchema, 
    updateGroupSchema, 
    groupParamsSchema,
    tournamentGroupParamsSchema 
} from '../validations/groupValidation';

const groupRouter = express.Router();

// Apply authentication to all group routes
groupRouter.use(authenticateUser);

// Tournament-specific group routes (nested resources)
groupRouter.get('/tournaments/:tournamentId/groups', 
    validateRequest(tournamentGroupParamsSchema, 'params'),
    GroupController.getTournamentGroups                                     // GET /groups/tournaments/:tournamentId/groups
);

groupRouter.post('/tournaments/:tournamentId/groups/create', 
    validateRequest(tournamentGroupParamsSchema, 'params'),
    validateRequest(createGroupSchema),
    GroupController.createGroup                                              // POST /groups/tournaments/:tournamentId/groups/create
);

// Individual group operations
groupRouter.get('/get/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.getGroupById                                             // GET /groups/get/:id
);

groupRouter.put('/update/:id', 
    validateRequest(groupParamsSchema, 'params'),
    validateRequest(updateGroupSchema),
    GroupController.updateGroup                                              // PUT /groups/update/:id
);

groupRouter.delete('/delete/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.deleteGroup                                              // DELETE /groups/delete/:id
);

export default groupRouter;