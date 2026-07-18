import { Request, Response } from 'express';
import { matchService } from '../services/matchService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class MatchController {
    // Create match in tournament
    static createMatch = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { matchNumber, matchDate, groupId } = req.body;
        const userId = req.user!.id;

        const match = await matchService.createMatch(tournamentId, userId, {
            matchNumber,
            matchDate: matchDate ? new Date(matchDate) : undefined,
            groupId
        });

        return res.status(201).json(ResponseHelper.success('Match created successfully', match));
    });

    // Get all matches for tournament
    static getTournamentMatches = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const matches = await matchService.getTournamentMatches(tournamentId, userId);

        if (!matches || matches.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No matches found for the tournament'));
        }

        return res.json(ResponseHelper.success('Matches retrieved successfully', {
            matches,
            count: matches.length
        }));
    });

    // Get specific match
    static getMatchById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const match = await matchService.getMatchById(id, userId);

        if (!match) {
            return res.status(404).json(ResponseHelper.notFound('Match not found'));
        }

        return res.json(ResponseHelper.success('Match retrieved successfully', match));
    });

    // Update match
    static updateMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const match = await matchService.updateMatch(id, userId, updateData);

        if (!match) {
            return res.status(404).json(ResponseHelper.notFound('Match not found'));
        }

        return res.json(ResponseHelper.success('Match updated successfully', match));
    });

    // Delete match
    static deleteMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const result = await matchService.deleteMatch(id, userId);

        if (!result || !result.success) {
            return res.status(404).json(ResponseHelper.notFound(result?.message || 'Match not found'));
        }

        return res.json(ResponseHelper.success(result.message || 'Match deleted successfully'));
    });
}
