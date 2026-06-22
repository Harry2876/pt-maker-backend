import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { teamLogoPresetService } from '../services/teamLogoPresetService';

export class TeamLogoPresetController {

    static createPreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { name } = req.body;
        const preset = await teamLogoPresetService.createPreset(userId, name);
        return res.status(201).json(ResponseHelper.success('Preset created successfully', preset));
    });

    static listPresets = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const presets = await teamLogoPresetService.listPresets(userId);
        return res.json(ResponseHelper.success('Presets retrieved successfully', presets));
    });

    static getPreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        const preset = await teamLogoPresetService.getPreset(userId, presetId);
        return res.json(ResponseHelper.success('Preset retrieved successfully', preset));
    });

    static updatePreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        const { name } = req.body;
        const preset = await teamLogoPresetService.updatePreset(userId, presetId, name);
        return res.json(ResponseHelper.success('Preset updated successfully', preset));
    });

    static deletePreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        await teamLogoPresetService.deletePreset(userId, presetId);
        return res.json(ResponseHelper.success('Preset deleted successfully', null));
    });

    static addEntry = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        const { teamName } = req.body;

        if (!req.file) {
            return res.status(400).json(ResponseHelper.error('Logo file is required', 'MISSING_FILE'));
        }

        const entry = await teamLogoPresetService.addEntry(
            userId,
            presetId,
            teamName,
            req.file.buffer,
            req.file.mimetype,
            req.file.originalname
        );

        return res.status(201).json(ResponseHelper.success('Preset entry added successfully', entry));
    });

    static deleteEntry = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { entryId } = req.params;
        await teamLogoPresetService.deleteEntry(userId, entryId);
        return res.json(ResponseHelper.success('Preset entry deleted successfully', null));
    });

    static suggestLogos = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { teamNames } = req.body;
        const suggestions = await teamLogoPresetService.suggestForTeamNames(userId, teamNames);
        return res.json(ResponseHelper.success('Logo suggestions retrieved', suggestions));
    });

    static assignPresetEntry = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { slotId } = req.params;
        const { presetEntryId } = req.body;
        await teamLogoPresetService.assignPresetEntryToSlot(userId, slotId, presetEntryId);
        return res.json(ResponseHelper.success('Preset entry assigned to slot successfully', null));
    });

    static removePresetEntry = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { slotId } = req.params;
        await teamLogoPresetService.removePresetEntryFromSlot(userId, slotId);
        return res.json(ResponseHelper.success('Preset entry removed from slot successfully', null));
    });
}
