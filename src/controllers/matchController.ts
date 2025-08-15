import { Request, Response } from 'express';
import { matchService } from '../services/matchService';
import { asyncHandler } from '../middleware/commonMiddleware';

export class MatchController {
    // Create match in tournament
    static createMatch = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { matchNumber, matchDate } = req.body;
        const userId = req.user!.id;

        const match = await matchService.createMatch(tournamentId, userId, {
            matchNumber,
            matchDate: matchDate ? new Date(matchDate) : undefined
        });

        return res.status(201).json({
            success: true,
            message: 'Match created successfully',
            data: match
        });
    });

    // Get all matches for tournament
    static getTournamentMatches = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const matches = await matchService.getTournamentMatches(tournamentId, userId);

        if (!matches || matches.length === 0) {
            return res.status(404).json({
            success: false,
            message: 'No matches found for the tournament',
            data: [],
            count: 0
            });
        }

        return res.json({
            success: true,
            message: 'Matches retrieved successfully',
            data: matches,
            count: matches.length
        });
    });

    // Get specific match
    static getMatchById = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const match = await matchService.getMatchById(id, userId);

        if (!match) {
            return res.status(404).json({
            success: false,
            message: 'Match not found',
            data: null
            });
        }

        return res.json({
            success: true,
            message: 'Match retrieved successfully',
            data: match
        });
    });

    // Update match
    static updateMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const match = await matchService.updateMatch(id, userId, updateData);

        if (!match) {
            return res.status(404).json({
            success: false,
            message: 'Match not found',
            data: null
            });
        }

        return res.json({
            success: true,
            message: 'Match updated successfully',
            data: match
        });
    });

    // Delete match
    static deleteMatch = asyncHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const result = await matchService.deleteMatch(id, userId);

        if (!result || !result.success) {
            return res.status(404).json({
            success: false,
            message: result?.message || 'Match not found',
            data: null
            });
        }

        return res.json({
            success: true,
            message: result.message || 'Match deleted successfully',
            data: null
        });
    });
}