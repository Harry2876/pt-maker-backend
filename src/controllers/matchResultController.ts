import { Request, Response } from 'express';
import { matchResultService } from '../services/matchResultService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class MatchResultController {
    // Create match result
    static createMatchResult = asyncHandler(async (req: Request, res: Response) => {
        const { matchId } = req.params;
        const { screenshotUrl, teamResults, notes } = req.body;
        const userId = req.user!.id;

        const matchResult = await matchResultService.createMatchResult({
            matchId,
            screenshotUrl,
            teamResults,
            notes
        }, userId);

        if (!matchResult) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create match result'));
        }

        return res.status(201).json(ResponseHelper.success('Match result created successfully', matchResult));
    });

    // Get match results
    static getMatchResults = asyncHandler(async (req: Request, res: Response) => {
        const { matchId } = req.params;
        const userId = req.user!.id;

        const results = await matchResultService.getMatchResults(matchId, userId);

        if (!results || results.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No match results found'));
        }

        return res.json(ResponseHelper.success('Match results retrieved successfully', {
            results,
            count: results.length
        }));
    });

    // Get match result by ID
    static getMatchResultById = asyncHandler(async (req: Request, res: Response) => {
        const { resultId } = req.params;
        const userId = req.user!.id;

        const result = await matchResultService.getMatchResultById(resultId, userId);

        if (!result) {
            return res.status(404).json(ResponseHelper.notFound('Match result not found'));
        }

        return res.json(ResponseHelper.success('Match result retrieved successfully', result));
    });

    // Update match result
    static updateMatchResult = asyncHandler(async (req: Request, res: Response) => {
        const { resultId } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        const updatedResult = await matchResultService.updateMatchResult(resultId, updateData, userId);

        if (!updatedResult) {
            return res.status(400).json(ResponseHelper.validationError('Failed to update match result'));
        }

        return res.json(ResponseHelper.success('Match result updated successfully', updatedResult));
    });

    // Verify match results manually
    static verifyResults = asyncHandler(async (req: Request, res: Response) => {
        const { resultId } = req.params;
        const verificationData = req.body;
        const userId = req.user!.id;

        const verification = await matchResultService.verifyResults(resultId, verificationData, userId);

        if (!verification.success) {
            return res.status(400).json(ResponseHelper.validationError(verification.message));
        }

        return res.json(ResponseHelper.success('Results verified successfully', verification));
    });

    // Publish verified results
    static publishResults = asyncHandler(async (req: Request, res: Response) => {
        const { resultId } = req.params;
        const publishData = req.body;
        const userId = req.user!.id;

        const publication = await matchResultService.publishResults(resultId, publishData, userId);

        if (!publication.success) {
            return res.status(400).json(ResponseHelper.validationError(publication.message));
        }

        return res.json(ResponseHelper.success('Results published successfully', publication));
    });

    // Delete match result
    static deleteMatchResult = asyncHandler(async (req: Request, res: Response) => {
        const { resultId } = req.params;
        const userId = req.user!.id;

        const deleted = await matchResultService.deleteMatchResult(resultId, userId);

        if (!deleted) {
            return res.status(400).json(ResponseHelper.validationError('Failed to delete match result'));
        }

        return res.json(ResponseHelper.success('Match result deleted successfully'));
    });

    // Calculate scores for team results (utility endpoint)
    static calculateScores = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { teamResults } = req.body;
        const userId = req.user!.id;

        try {
            const calculatedResults = await matchResultService.calculateTeamScores(tournamentId, teamResults);

            return res.json(ResponseHelper.success('Scores calculated successfully', {
                teamResults: calculatedResults
            }));

        } catch (error) {
            return res.status(400).json(ResponseHelper.validationError('Failed to calculate scores'));
        }
    });

    // Get tournament results summary
    static getTournamentResults = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        // This will be implemented when we have tournament-wide result queries
        // For now, return basic response
        return res.json(ResponseHelper.success('Tournament results endpoint ready', {
            message: 'This endpoint will provide tournament-wide results summary',
            tournamentId
        }));
    });
}