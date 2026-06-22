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

        // Accept both camelCase (Android) and snake_case (Python-style) field names
        const opts = {
            templateUrl: body.templateUrl ?? body.template_url,
            templateConfigUrl: body.templateConfigUrl ?? body.template_config_url,
            headerOverrides: (body.headerOverrides ?? body.header_overrides) ?? null,
            slotNumberFontSize: (body.slotNumberFontSize ?? body.slot_number_font_size) ?? null,
            teamNameFontSize: (body.teamNameFontSize ?? body.team_name_font_size) ?? null,
            slotNumberColor: (body.slotNumberColor ?? body.slot_number_color) ?? null,
            teamNameColor: (body.teamNameColor ?? body.team_name_color) ?? null,
            teamLogoGap: (body.teamLogoGap ?? body.team_logo_gap) ?? null,
            teamLogoSize: (body.teamLogoSize ?? body.team_logo_size) ?? null,
            gridOverrides: (body.gridOverrides ?? body.grid_overrides) ?? null,
            fontCustomization: (body.fontCustomization ?? body.font_customization) ?? null,
            outputFilename: body.outputFilename ?? body.output_filename,
            options: (body.options) ?? null,
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
            templateUrl: body.templateUrl ?? body.template_url,
            templateConfigUrl: body.templateConfigUrl ?? body.template_config_url,
            headerOverrides: (body.headerOverrides ?? body.header_overrides) ?? null,
            headerStyle: (body.headerStyle ?? body.header_style) ?? null,
            footerOverrides: (body.footerOverrides ?? body.footer_overrides) ?? null,
            footerStyle: (body.footerStyle ?? body.footer_style) ?? null,
            teamLogoSize: (body.teamLogoSize ?? body.team_logo_size) ?? null,
            teamNameFontSize: (body.teamNameFontSize ?? body.team_name_font_size) ?? null,
            teamNameColor: (body.teamNameColor ?? body.team_name_color) ?? null,
            cardOverrides: (body.cardOverrides ?? body.card_overrides) ?? null,
            fontCustomization: (body.fontCustomization ?? body.font_customization) ?? null,
            showBranding: body.showBranding ?? body.show_branding,
            outputFilename: body.outputFilename ?? body.output_filename,
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
            templateUrl: body.templateUrl ?? body.template_url,
            templateConfigUrl: body.templateConfigUrl ?? body.template_config_url,
            headerOverrides: (body.headerOverrides ?? body.header_overrides) ?? null,
            footerOverrides: (body.footerOverrides ?? body.footer_overrides) ?? null,
            cardOverrides: (body.cardOverrides ?? body.card_overrides) ?? null,
            fontCustomization: (body.fontCustomization ?? body.font_customization) ?? null,
            showBranding: body.showBranding ?? body.show_branding,
            outputFilename: body.outputFilename ?? body.output_filename,
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
