import { Request, Response } from "express";
import { asyncHandler } from "../middleware/commonMiddleware";
import { ResponseHelper } from "../utils/responseHelper";
import { tournamentStageService } from "../services/tournamentStageService";
import logger from "../utils/logger";

export class TournamentStageController {
    //create tournament stage
    static createStage = asyncHandler(async (req: Request, res:Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;
        const stageData = req.body;

        const stage = await tournamentStageService.createStage(
            {...stageData, tournamentId},
            userId
        );

        if (!stage){
            return res.status(400).json(ResponseHelper.validationError('Failed to create tournament stage'));
        }

        return res.status(201).json(ResponseHelper.success('Tournament stage created successfully', stage));
    });


        // Get tournament stages
    static getTournamentStages = asyncHandler(async (req: Request, res: Response) => {
        const {tournamentId} = req.params;
        const userId = req.user!.id;

        const stages = await tournamentStageService.getTournamentStages(tournamentId, userId);

        if (!stages || stages.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No stages found for this tournament'));
        }

        return res.status(200).json(ResponseHelper.success('Stages retrieved successfully', {
            stages,
            count: stages.length
        }));
    });

    // Get stage by ID
    static getStageById = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;

        const stage = await tournamentStageService.getStageById(stageId, userId);

        if (!stage) {
            return res.status(404).json(ResponseHelper.notFound('Stage not found'));
        }
        return res.status(200).json(ResponseHelper.success('Stage retrieved successfully', stage));
    });

    // Update stage
    static updateStage = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;
        const updateData = req.body;

        const updatedStage = await tournamentStageService.updateStage(stageId, updateData, userId);
        
        if (!updatedStage) {
            return res.status(404).json(ResponseHelper.notFound('Stage not found or update failed'));
        }

        return res.status(200).json(ResponseHelper.success('Stage updated successfully', updatedStage));
    });

    // Delete stage
    static deleteStage = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;

        const deleted = await tournamentStageService.deleteStage(stageId, userId);
        
        if (!deleted) {
            return res.status(404).json(ResponseHelper.notFound('Stage not found or deletion failed'));
        }

        return res.status(200).json(ResponseHelper.success('Stage deleted successfully'));
    });

    // Advance to next stage
    static advanceStage = asyncHandler(async (req: Request, res: Response) => {
        const { stageId } = req.params;
        const userId = req.user!.id;


        const result = await tournamentStageService.advanceStage(stageId, userId);
        
        if (!result) {
            return res.status(400).json(ResponseHelper.validationError('Cannot advance stage at this time'));
        }

        return res.status(200).json(ResponseHelper.success('Stage advanced successfully', result));
    });
}