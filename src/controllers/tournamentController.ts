import { Request,Response } from "express";
import { tournamentService } from "../services/tournamentService";
import { asyncHandler } from "../middleware/commonMiddleware";
import logger from "../utils/logger";
import { ResponseHelper } from '../utils/responseHelper';

export class TournamentController {
    static createTournament = asyncHandler(async (req:Request, res:Response) => {
        const {
            name,
            game,
            status,
            tournamentType,
            maxTeams,
            entryFee,
            prizePool,
            totalStages,
            tournamentFormat,
            maxTeamsPerGroup
        } = req.body;

        const userId = req.user!.id;

        const tournament = await tournamentService.createTournament(userId, {
            name,
            game,
            status,
            tournamentType,
            maxTeams,
            entryFee,
            prizePool,
            totalStages,
            tournamentFormat,
            maxTeamsPerGroup
        });

        return res.status(201).json(ResponseHelper.success('Tournament created successfully', tournament));
    });

    static getUserTournaments = asyncHandler(async (req:Request, res:Response) => {
        const userId = req.user!.id;

        const tournaments = await tournamentService.getUserTournaments(userId);

        if (!tournaments || tournaments.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No tournaments found for the user'));
        } else {
            return res.status(200).json(ResponseHelper.success('User tournaments fetched successfully', {
                tournaments,
                count: tournaments.length
            }));
        }
    });

    static getTournamentById = asyncHandler(async (req:Request, res:Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const tournament = await tournamentService.getTournamentById(id, userId);

        if (!tournament) {
            return res.status(404).json(ResponseHelper.notFound('Tournament not found'));
        }

        return res.status(200).json(ResponseHelper.success('Tournament fetched successfully', tournament));
    });

    static updateTournament = asyncHandler(async (req:Request, res:Response) => {
        const {id} = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const updatedTournament = await tournamentService.updateTournament(id, userId, updateData);

        if (!updatedTournament) {
            return res.status(404).json(ResponseHelper.notFound('Tournament not found or not authorized'));
        }

        return res.status(200).json(ResponseHelper.success('Tournament updated successfully', updatedTournament));
    });

    static deleteTournament = asyncHandler(async (req:Request, res:Response) => {
        const {id} = req.params;
        const userId = req.user!.id;

        const deletedTournament = await tournamentService.deleteTournament(id, userId);

        if (!deletedTournament) {
            return res.status(404).json(ResponseHelper.notFound('Tournament not found or not authorized'));
        }

        return res.status(200).json(ResponseHelper.success('Tournament deleted successfully', deletedTournament));
    });
}