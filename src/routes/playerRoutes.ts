import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { PlayerController } from '../controllers/playerController';
import {
    createPlayerSchema,
    updatePlayerSchema,
    playerParamsSchema,
    playerStatsQuerySchema
} from '../validations/playerValidation';

const playerRouter = express.Router();

playerRouter.use(authenticateUser);

playerRouter.get('/top', PlayerController.getTopPlayers);

playerRouter.post(
    '/search',
    PlayerController.searchPlayers
);

playerRouter.post(
    '/create',
    validateRequest(createPlayerSchema),
    PlayerController.createPlayer
);

playerRouter.get(
    '/get/:id',
    validateRequest(playerParamsSchema, 'params'),
    PlayerController.getPlayerById
);

playerRouter.get(
    '/get/:id/stats',
    validateRequest(playerParamsSchema, 'params'),
    validateRequest(playerStatsQuerySchema, 'query'),
    PlayerController.getPlayerStats
);

playerRouter.put(
    '/update/:id',
    validateRequest(playerParamsSchema, 'params'),
    validateRequest(updatePlayerSchema),
    PlayerController.updatePlayer
);

playerRouter.delete(
    '/delete/:id',
    validateRequest(playerParamsSchema, 'params'),
    PlayerController.deletePlayer
);

playerRouter.get('/', PlayerController.getPlayers);

export default playerRouter;
