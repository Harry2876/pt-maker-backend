import { Request,Response } from "express";
import { tournamentService } from "../services/tournamentService";
import { asyncHandler } from "../middleware/commonMiddleware";
import logger from "../utils/logger";

export class TournamentController {
    static createTournament = asyncHandler(async (req:Request, res:Response) => {
        const {name, game, status} = req.body;

        const userId = req.user!.id;

        const tournament = await tournamentService.createTournament(userId,{
            name,
            game,
            status
        });

        return res.status(201).json({
            success: true,
            message: 'Tournament created successfully',
            data: tournament
        });
    });

    static getUserTournaments = asyncHandler(async (req:Request, res:Response) => {
        const userId = req.user!.id;

        const tournaments = await tournamentService.getUserTournaments(userId);

        if (!tournaments || tournaments.length === 0) {
            return res.status(404).json({
            success: false,
            message: 'No tournaments found for the user',
            data: [],
            count: 0
            });
        } else {
            return res.status(200).json({
            success: true,
            message: 'User tournaments fetched successfully',
            data: tournaments,
            count: tournaments.length
            });
        }
    });

    static getTournamentById = asyncHandler(async (req:Request, res:Response) => {
        const { id } = req.params;
        const userId = req.user!.id;

        const tournament = await tournamentService.getTournamentById(id, userId);

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found',
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Tournament fetched successfully',
            data: tournament
        });
    });

    static updateTournament = asyncHandler(async (req:Request, res:Response) => {
        const {id} = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const updatedTournament = await tournamentService.updateTournament(id, userId, updateData);

        if (!updatedTournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found or not authorized',
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Tournament updated successfully',
            data: updatedTournament
        });
    });

    static deleteTournament = asyncHandler(async (req:Request, res:Response) => {
        const {id} = req.params;
        const userId = req.user!.id;

        const deletedTournament = await tournamentService.deleteTournament(id, userId);

        if (!deletedTournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found or not authorized',
                data: null
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Tournament deleted successfully',
            data: deletedTournament
        });
    });
}