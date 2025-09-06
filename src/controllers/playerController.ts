import { Request, Response } from 'express';
import { playerService } from '../services/playerService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class PlayerController {
    // Create new player
    static createPlayer = asyncHandler(async (req: Request, res: Response) => {
        const { name, gameUuid, email, phoneNumber } = req.body;
        const userId = req.user!.id;

        const player = await playerService.createPlayer({
            name,
            gameUuid,
            email,
            phoneNumber
        }, userId);

        if (!player) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create player'));
        }

        return res.status(201).json(ResponseHelper.success('Player created successfully', player));
    });

    // Get all players with search and filtering
    static getPlayers = asyncHandler(async (req: Request, res: Response) => {
        const { page = '1', limit = '10', search, gameUuid, minMatches, maxMatches } = req.query;

        const searchFilters = {
            name: search as string,
            gameUuid: gameUuid as string,
            minMatches: minMatches ? parseInt(minMatches as string) : undefined,
            maxMatches: maxMatches ? parseInt(maxMatches as string) : undefined
        };

        const players = await playerService.searchPlayers(
            searchFilters.name || '',
            parseInt(limit as string)
        );

        return res.json(ResponseHelper.success('Players retrieved successfully', players));
    });

    // Get player by ID
    static getPlayerById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;

        const player = await playerService.getPlayerById(id);

        if (!player) {
            return res.status(404).json(ResponseHelper.notFound('Player not found'));
        }

        return res.json(ResponseHelper.success('Player retrieved successfully', player));
    });

    // Update player
    static updatePlayer = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        const updatedPlayer = await playerService.updatePlayerStats(id, updateData, userId);

        if (!updatedPlayer) {
            return res.status(404).json(ResponseHelper.notFound('Player not found or update failed'));
        }

        return res.json(ResponseHelper.success('Player updated successfully', updatedPlayer));
    });

    // Delete player
    static deletePlayer = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const deleted = await playerService.deletePlayer(id, userId);

        if (!deleted) {
            return res.status(404).json(ResponseHelper.notFound('Player not found or deletion failed'));
        }

        return res.json(ResponseHelper.success('Player deleted successfully'));
    });

    // Get player statistics for a tournament
    static getPlayerStats = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { tournamentId } = req.query;

        if (!tournamentId) {
            return res.status(400).json(ResponseHelper.validationError('Tournament ID is required'));
        }

        const stats = await playerService.getPlayerTournamentStats(id, tournamentId as string);

        if (!stats) {
            return res.status(404).json(ResponseHelper.notFound('Player tournament stats not found'));
        }

        return res.json(ResponseHelper.success('Player stats retrieved successfully', stats));
    });

    // Get top performing players
    static getTopPlayers = asyncHandler(async (req: Request, res: Response) => {
        const { limit = '10' } = req.query;

        const topPlayers = await playerService.getTopPlayers(parseInt(limit as string));

        return res.json(ResponseHelper.success('Top players retrieved successfully', {
            players: topPlayers,
            count: topPlayers.length
        }));
    });

    // Search players with advanced filters
    static searchPlayers = asyncHandler(async (req: Request, res: Response) => {
        const searchFilters = req.body;
        const { page = 1, limit = 10 } = req.query;

        const searchResult = await playerService.searchPlayers(
            searchFilters,
            parseInt(limit as string)
        );

        return res.json(ResponseHelper.success('Player search completed', {
            players: searchResult,
            count: searchResult.length
        }));
    });
}