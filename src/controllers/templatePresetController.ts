import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { templatePresetService } from '../services/templatePresetService';
import { ListTemplatePresetsQuery } from '../types/templatePreset';

export class TemplatePresetController {
    static createPreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const preset = await templatePresetService.createPreset(userId, req.body);
        return res.status(201).json(ResponseHelper.success('Template preset created successfully', preset));
    });

    static listPresets = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const query = (req.validatedQuery ?? req.query) as ListTemplatePresetsQuery;
        const presets = await templatePresetService.listPresets(userId, query);
        return res.json(ResponseHelper.success('Template presets retrieved successfully', { presets }));
    });

    static getPreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        const preset = await templatePresetService.getPreset(userId, presetId);
        return res.json(ResponseHelper.success('Template preset retrieved successfully', preset));
    });

    static updatePreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        const preset = await templatePresetService.updatePreset(userId, presetId, req.body);
        return res.json(ResponseHelper.success('Template preset updated successfully', preset));
    });

    static deletePreset = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { presetId } = req.params;
        await templatePresetService.deletePreset(userId, presetId);
        return res.json(ResponseHelper.success('Template preset deleted successfully', null));
    });
}