import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TournamentController } from '../controllers/tournamentController';
import { 
    createTournamentSchema, 
    updateTournamentSchema, 
    tournamentParamsSchema 
} from '../validations/tournamentValidation';

const tournamentRouter = express.Router();

// Apply authentication to all tournament routes
tournamentRouter.use(authenticateUser);

// Tournament CRUD Operations
tournamentRouter.get('/', TournamentController.getUserTournaments);                    // GET /tournaments
tournamentRouter.post('/create', 
    validateRequest(createTournamentSchema), 
    TournamentController.createTournament                                             // POST /tournaments/create
);

tournamentRouter.get('/get/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    TournamentController.getTournamentById                                            // GET /tournaments/:id
);

tournamentRouter.put('/update/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    validateRequest(updateTournamentSchema),
    TournamentController.updateTournament                                             // PUT /tournaments/:id
);

tournamentRouter.delete('/delete/:id', 
    validateRequest(tournamentParamsSchema, 'params'),
    TournamentController.deleteTournament                                             // DELETE /tournaments/:id
);

export default tournamentRouter;
