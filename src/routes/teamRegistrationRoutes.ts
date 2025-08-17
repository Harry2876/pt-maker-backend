import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TeamRegistrationController } from '../controllers/teamRegistrationController';
import { 
    createTeamRegistrationSchema, 
    updateTeamRegistrationSchema, 
    teamRegistrationParamsSchema,
    tournamentTeamRegistrationParamsSchema 
} from '../validations/teamRegistrationValidation';
import { groupParamsSchema } from '../validations/groupValidation';

const teamRegistrationRouter = express.Router();

// Apply authentication to all team registration routes
teamRegistrationRouter.use(authenticateUser);

// Tournament-specific team registration routes
teamRegistrationRouter.get('/tournaments/:tournamentId/registrations', 
    validateRequest(tournamentTeamRegistrationParamsSchema, 'params'),
    TeamRegistrationController.getTournamentTeamRegistrations               // GET /team-registrations/tournaments/:tournamentId/registrations
);

teamRegistrationRouter.post('/tournaments/:tournamentId/registrations/create', 
    validateRequest(tournamentTeamRegistrationParamsSchema, 'params'),
    validateRequest(createTeamRegistrationSchema),
    TeamRegistrationController.createTeamRegistration                       // POST /team-registrations/tournaments/:tournamentId/registrations/create
);

// Group-specific team registration routes
teamRegistrationRouter.get('/groups/:groupId/registrations', 
    validateRequest(groupParamsSchema, 'params'),
    TeamRegistrationController.getGroupTeamRegistrations                    // GET /team-registrations/groups/:groupId/registrations
);

// Individual team registration operations
teamRegistrationRouter.get('/get/:id', 
    validateRequest(teamRegistrationParamsSchema, 'params'),
    TeamRegistrationController.getTeamRegistrationById                      // GET /team-registrations/get/:id
);

teamRegistrationRouter.put('/update/:id', 
    validateRequest(teamRegistrationParamsSchema, 'params'),
    validateRequest(updateTeamRegistrationSchema),
    TeamRegistrationController.updateTeamRegistration                       // PUT /team-registrations/update/:id
);

export default teamRegistrationRouter;