import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { quickSeriesService } from '../services/quickSeriesService';

export class QuickSeriesController {

    /**
     * POST /api/v1/quick-pt/series
     * Create a new Tournament Series
     */
    static createTournamentSeries = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { seriesName, game, totalMatches, positionPointsConfig, killPointsValue, scoringDescription } = req.body;

        const tournamentSeries = await quickSeriesService.createTournamentSeries(userId, {
            seriesName,
            game,
            totalMatches,
            positionPointsConfig,
            killPointsValue,
            scoringDescription
        });

        return res.status(201).json(
            ResponseHelper.success('Tournament Series created successfully', tournamentSeries)
        );
    });

    /**
     * POST /api/v1/quick-pt/series/:id/matches
     * Add a match to the series
     */
    static addMatchToSeries = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const { quickMatchId } = req.body;
        const userId = req.user!.id;

        const seriesMatch = await quickSeriesService.addMatchToSeries(seriesId, quickMatchId, userId);

        return res.status(201).json(
            ResponseHelper.success('Match added to series successfully', seriesMatch)
        );
    });

    /**
     * GET /api/v1/quick-pt/series/:id/leaderboard
     * Get series leaderboard
     */
    static getSeriesLeaderboard = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;

        const leaderboard = await quickSeriesService.getSeriesLeaderboard(seriesId, userId);

        if (!leaderboard) {
            return res.status(404).json(ResponseHelper.notFound('Series leaderboard not found'));
        }

        return res.json(
            ResponseHelper.success('Series leaderboard retrieved successfully', leaderboard)
        );
    });

    /**
     * GET /api/v1/quick-pt/series/:id
     * Get tournament series by ID
     */
    static getTournamentSeries = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;

        const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);

        if (!series) {
            return res.status(404).json(ResponseHelper.notFound('Tournament series not found'));
        }

        return res.json(
            ResponseHelper.success('Tournament series retrieved successfully', series)
        );
    });

    /**
     * GET /api/v1/quick-pt/series/:id/matches
     * Get matches in a series
     */
    static getSeriesMatches = asyncHandler(async (req: Request, res: Response) => {
        const { id: seriesId } = req.params;
        const userId = req.user!.id;

        const matches = await quickSeriesService.getSeriesMatches(seriesId, userId);

        return res.json(
            ResponseHelper.success('Series matches retrieved successfully', matches)
        );
    });

    /**
 * GET /api/v1/quick-pt/series
 * List all Tournament Series for user
 */
static listUserSeries = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { status, page, limit } = req.query;

    const result = await quickSeriesService.listUserSeries(userId, {
        status: status as any,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined
    });

    return res.json(
        ResponseHelper.success('Tournament Series retrieved successfully', result)
    );
});

/**
 * PUT /api/v1/quick-pt/series/:id
 * Update Tournament Series
 */
static updateTournamentSeries = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const updateData = req.body;

    const series = await quickSeriesService.updateTournamentSeries(id, userId, updateData);

    if (!series) {
        return res.status(404).json(ResponseHelper.notFound('Tournament series not found'));
    }

    return res.json(
        ResponseHelper.success('Tournament Series updated successfully', series)
    );
});

/**
 * DELETE /api/v1/quick-pt/series/:id
 * Delete Tournament Series
 */
static deleteTournamentSeries = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    await quickSeriesService.deleteTournamentSeries(id, userId);

    return res.json(
        ResponseHelper.success('Tournament Series deleted successfully')
    );
});
}