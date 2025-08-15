import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { MatchController } from '../controllers/matchController';
import { 
    createMatchSchema, 
    updateMatchSchema, 
    matchParamsSchema,
    tournamentParamsSchema 
} from '../validations/matchValidation';

const matchRouter = express.Router();

// Apply authentication to all match routes
matchRouter.use(authenticateUser);

// Tournament-specific match routes (nested resources)
matchRouter.get('/tournaments/:tournamentId/matches', 
    validateRequest(tournamentParamsSchema, 'params'),
    MatchController.getTournamentMatches                                     // GET /matches/tournaments/:tournamentId/matches
);

matchRouter.post('/tournaments/:tournamentId/matches/create', 
    validateRequest(tournamentParamsSchema, 'params'),
    validateRequest(createMatchSchema),
    MatchController.createMatch                                              // POST /matches/tournaments/:tournamentId/matches/create
);

// Individual match operations
matchRouter.get('/get/:id', 
    validateRequest(matchParamsSchema, 'params'),
    MatchController.getMatchById                                             // GET /matches/get/:id
);

matchRouter.put('/update/:id', 
    validateRequest(matchParamsSchema, 'params'),
    validateRequest(updateMatchSchema),
    MatchController.updateMatch                                              // PUT /matches/update/:id
);

matchRouter.delete('/delete/:id', 
    validateRequest(matchParamsSchema, 'params'),
    MatchController.deleteMatch                                              // DELETE /matches/delete/:id
);

export default matchRouter;