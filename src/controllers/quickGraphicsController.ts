import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';
import { quickGraphicsService } from '../services/quickGraphicsService';
import { quickSlotService } from '../services/quickSlotService';
import { pythonAIService } from '../services/pythonAIService';

export class QuickGraphicsController {

    // ─────────────────────────────────────────
    // UNIFIED SLOT LIST  (match or series)
    // ─────────────────────────────────────────

    static generateSlotList = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { sourceType, sourceId, ...body } = req.body;

        const opts = {
            templateUrl: body.templateUrl,
            templateConfigUrl: body.templateConfigUrl,
            headerOverrides: body.headerOverrides ?? null,
            slotNumberFontSize: body.slotNumberFontSize ?? null,
            teamNameFontSize: body.teamNameFontSize ?? null,
            slotNumberColor: body.slotNumberColor ?? null,
            teamNameColor: body.teamNameColor ?? null,
            teamLogoGap: body.teamLogoGap ?? null,
            teamLogoSize: body.teamLogoSize ?? null,
            gridOverrides: body.gridOverrides ?? null,
            fontCustomization: body.fontCustomization ?? null,
            outputFilename: body.outputFilename,
            options: body.options ?? null,
        };

        const result = sourceType === 'series'
            ? await quickGraphicsService.generateSeriesSlotList(sourceId, userId, opts)
            : await quickGraphicsService.generateMatchSlotList(sourceId, userId, opts);

        return res.json(ResponseHelper.success('Slot list graphic generated successfully', result));
    });

    // ─────────────────────────────────────────
    // UNIFIED ROSTER  (match only)
    // ─────────────────────────────────────────

    static generateRoster = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { sourceId, ...body } = req.body;

        const result = await quickGraphicsService.generateMatchRoster(sourceId, userId, {
            templateUrl: body.templateUrl,
            templateConfigUrl: body.templateConfigUrl,
            headerOverrides: body.headerOverrides ?? null,
            headerStyle: body.headerStyle ?? null,
            footerOverrides: body.footerOverrides ?? null,
            footerStyle: body.footerStyle ?? null,
            teamLogoSize: body.teamLogoSize ?? null,
            teamNameFontSize: body.teamNameFontSize ?? null,
            teamNameColor: body.teamNameColor ?? null,
            cardOverrides: body.cardOverrides ?? null,
            fontCustomization: body.fontCustomization ?? null,
            showBranding: body.showBranding,
            outputFilename: body.outputFilename,
            options: body.options ?? null,
        });

        return res.json(ResponseHelper.success('Roster graphic generated successfully', result));
    });

    // ─────────────────────────────────────────
    // UNIFIED TOP 10  (match or series)
    // ─────────────────────────────────────────

    static generateTop10 = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { sourceType, sourceId, ...body } = req.body;

        const opts = {
            templateUrl: body.templateUrl,
            templateConfigUrl: body.templateConfigUrl,
            headerOverrides: body.headerOverrides ?? null,
            footerOverrides: body.footerOverrides ?? null,
            cardOverrides: body.cardOverrides ?? null,
            fontCustomization: body.fontCustomization ?? null,
            showBranding: body.showBranding,
            outputFilename: body.outputFilename,
            options: body.options ?? null,
        };

        const result = sourceType === 'series'
            ? await quickGraphicsService.generateSeriesTop10(sourceId, userId, opts)
            : await quickGraphicsService.generateMatchTop10(sourceId, userId, opts);

        return res.json(ResponseHelper.success('Top 10 graphic generated successfully', result));
    });

    // ─────────────────────────────────────────
    // MATCH SLOT LOGO
    // ─────────────────────────────────────────

    static attachMatchLogo = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { id: quickMatchId, slotNumber } = req.params;

        if (!req.file) {
            return res.status(400).json(ResponseHelper.error('Logo file is required', 'MISSING_FILE'));
        }

        const result = await quickSlotService.attachMatchLogo(
            userId,
            quickMatchId,
            parseInt(slotNumber, 10),
            req.file.buffer,
            req.file.mimetype
        );

        return res.json(ResponseHelper.success('Match logo attached successfully', result));
    });

    static removeMatchLogo = asyncHandler(async (req: Request, res: Response) => {
        const userId = req.user!.id;
        const { id: quickMatchId, slotNumber } = req.params;

        await quickSlotService.removeMatchLogo(userId, quickMatchId, parseInt(slotNumber, 10));
        return res.json(ResponseHelper.success('Match logo removed successfully', null));
    });

    // ─────────────────────────────────────────
    // FONTS
    // ─────────────────────────────────────────

    static getFontsList = asyncHandler(async (req: Request, res: Response) => {
        const fonts = await pythonAIService.getFontsList();
        return res.json(ResponseHelper.success('Fonts list retrieved successfully', fonts));
    });
}
