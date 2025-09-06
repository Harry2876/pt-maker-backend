import { Request, Response } from 'express';
import { leaderboardService } from '../services/leaderboardService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class LeaderboardController {
    // Get tournament leaderboard
    static getTournamentLeaderboard = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;

        const leaderboard = await leaderboardService.getTournamentLeaderboard(tournamentId);

        if (!leaderboard) {
            return res.status(404).json(ResponseHelper.notFound('Tournament leaderboard not found'));
        }

        return res.json(ResponseHelper.success('Tournament leaderboard retrieved successfully', leaderboard));
    });

    // Get group leaderboard
    static getGroupLeaderboard = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;

        const leaderboard = await leaderboardService.generateGroupLeaderboard(groupId);

        if (!leaderboard) {
            return res.status(404).json(ResponseHelper.notFound('Group leaderboard not found'));
        }

        return res.json(ResponseHelper.success('Group leaderboard retrieved successfully', leaderboard));
    });

    // Get live standings
    static getLiveStandings = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;

        const liveStandings = await leaderboardService.getLiveStandings(tournamentId);

        if (!liveStandings) {
            return res.status(404).json(ResponseHelper.notFound('Live standings not available'));
        }

        return res.json(ResponseHelper.success('Live standings retrieved successfully', liveStandings));
    });

    // Refresh leaderboard (force regeneration)
    static refreshLeaderboard = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { forceRefresh = true, includeGroups, notifyTeams } = req.body;

        const result = await leaderboardService.refreshLeaderboard(tournamentId, {
            forceRefresh,
            includeGroups,
            notifyTeams
        });

        if (!result.success) {
            return res.status(400).json(ResponseHelper.validationError('Failed to refresh leaderboard', result.errors.join(', ')));
        }

        return res.json(ResponseHelper.success('Leaderboard refreshed successfully', result));
    });

    // Search leaderboard entries
    static searchLeaderboard = asyncHandler(async (req: Request, res: Response) => {
        const searchFilters = req.body;

        const searchResult = await leaderboardService.searchLeaderboard(searchFilters);

        return res.json(ResponseHelper.success('Leaderboard search completed', searchResult));
    });

    // Get tournament top performers
    static getTopPerformers = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { limit = '10', type = 'points' } = req.query;

        const leaderboard = await leaderboardService.getTournamentLeaderboard(tournamentId);

        if (!leaderboard) {
            return res.status(404).json(ResponseHelper.notFound('Tournament leaderboard not found'));
        }

        let sortedEntries = [...leaderboard.entries];

        // Sort by different criteria
        switch (type) {
            case 'kills':
                sortedEntries.sort((a, b) => b.totalKills - a.totalKills);
                break;
            case 'wins':
                sortedEntries.sort((a, b) => b.wins - a.wins);
                break;
            case 'average':
                sortedEntries.sort((a, b) => b.averageKills - a.averageKills);
                break;
            default: // points
                sortedEntries.sort((a, b) => b.totalPoints - a.totalPoints);
        }

        const topPerformers = sortedEntries.slice(0, parseInt(limit as string));

        return res.json(ResponseHelper.success(`Top ${type} performers retrieved successfully`, {
            type,
            performers: topPerformers,
            count: topPerformers.length
        }));
    });

    // Get leaderboard statistics
    static getLeaderboardStats = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;

        const leaderboard = await leaderboardService.getTournamentLeaderboard(tournamentId);

        if (!leaderboard) {
            return res.status(404).json(ResponseHelper.notFound('Tournament leaderboard not found'));
        }

        // Calculate statistics
        const totalKills = leaderboard.entries.reduce((sum, entry) => sum + entry.totalKills, 0);
        const totalPoints = leaderboard.entries.reduce((sum, entry) => sum + entry.totalPoints, 0);
        const averageKills = leaderboard.entries.length > 0 ? totalKills / leaderboard.entries.length : 0;
        const averagePoints = leaderboard.entries.length > 0 ? totalPoints / leaderboard.entries.length : 0;

        const topTeam = leaderboard.entries[0];
        const totalWins = leaderboard.entries.reduce((sum, entry) => sum + entry.wins, 0);

        const stats = {
            totalTeams: leaderboard.totalTeams,
            totalMatches: leaderboard.totalMatches,
            totalKills,
            totalPoints,
            averageKills,
            averagePoints,
            totalWins,
            topTeam: topTeam ? {
                name: topTeam.teamName,
                points: topTeam.totalPoints,
                kills: topTeam.totalKills,
                wins: topTeam.wins
            } : null,
            lastUpdated: leaderboard.lastUpdated
        };

        return res.json(ResponseHelper.success('Leaderboard statistics retrieved successfully', stats));
    });
}