import { BaseService } from './baseService';
import { pythonAIService } from './pythonAIService';
import { signedUrlUtility } from './signedUrlUtility';
import { quickMatchService } from './quickMatchService';
import { quickResultService } from './quickResultService';
import { quickSeriesService } from './quickSeriesService';
import { ServiceError } from '../utils/serviceError';
import {
    SlotListRequest,
    TeamListRequest,
    Top10Request,
    FontCustomization,
    GraphicsOptions,
} from '../types/pythonAI';

export interface GraphicGenerationResult {
    signedUrl: string;
    imageUrl: string;
    generationTimeMs: number;
}

// ---- Shared customisation shapes ----

export interface SlotListGraphicOptions {
    templateUrl: string;
    templateConfigUrl: string;
    headerOverrides?: Record<string, any> | null;
    slotNumberFontSize?: number | null;
    teamNameFontSize?: number | null;
    slotNumberColor?: string | null;
    teamNameColor?: string | null;
    teamLogoGap?: number | null;
    teamLogoSize?: number | null;
    gridOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    outputFilename?: string;
    options?: GraphicsOptions | null;
}

export interface RosterGraphicOptions {
    templateUrl: string;
    templateConfigUrl: string;
    headerOverrides?: Record<string, any> | null;
    headerStyle?: Record<string, any> | null;
    footerOverrides?: Record<string, any> | null;
    footerStyle?: Record<string, any> | null;
    teamLogoSize?: number | null;
    teamNameFontSize?: number | null;
    teamNameColor?: string | null;
    cardOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    showBranding?: boolean;
    outputFilename?: string;
    options?: GraphicsOptions | null;
}

export interface Top10GraphicOptions {
    templateUrl: string;
    templateConfigUrl: string;
    headerOverrides?: Record<string, any> | null;
    footerOverrides?: Record<string, any> | null;
    cardOverrides?: Record<string, any> | null;
    fontCustomization?: FontCustomization | null;
    showBranding?: boolean;
    outputFilename?: string;
    options?: GraphicsOptions | null;
}

export class QuickGraphicsService extends BaseService {
    constructor() {
        super();
    }

    // ─────────────────────────────────────────
    // SLOT LIST
    // ─────────────────────────────────────────

    /**
     * Generate a Slot List graphic for a match.
     * Slot data is pulled from QuickSlotAssignment with logos.
     */
    async generateMatchSlotList(
        quickMatchId: string,
        userId: string,
        opts: SlotListGraphicOptions
    ): Promise<GraphicGenerationResult> {
        const start = Date.now();

        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const slots = await this.db.quickSlotAssignment.findMany({
            where: { quickMatchId },
            include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
            orderBy: { slotNumber: 'asc' },
        });

        if (slots.length === 0) {
            throw new ServiceError(
                'No slot assignments found. Add slots before generating a slot list graphic.',
                400,
                'NO_SLOTS'
            );
        }

        const slotData = slots.map(s => ({
            slot_number: s.slotNumber,
            team_name: s.teamName,
            team_logo_url: this.resolveLogoUrl(s) ?? undefined,
        }));

        const request: SlotListRequest = {
            template_url: opts.templateUrl,
            template_config_url: opts.templateConfigUrl,
            slot_data: slotData,
            header_overrides: opts.headerOverrides ?? null,
            slot_number_font_size: opts.slotNumberFontSize ?? null,
            team_name_font_size: opts.teamNameFontSize ?? null,
            slot_number_color: opts.slotNumberColor ?? null,
            team_name_color: opts.teamNameColor ?? null,
            team_logo_gap: opts.teamLogoGap ?? null,
            team_logo_size: opts.teamLogoSize ?? null,
            grid_overrides: opts.gridOverrides ?? null,
            font_customization: opts.fontCustomization ?? null,
            output_filename: opts.outputFilename,
            options: { upload_to_r2: true, compress_image: false, render_scale: 0, ...(opts.options ?? {}) },
        };

        const pyResponse = await pythonAIService.generateSlotList(request);
        return this.extractResult(pyResponse, Date.now() - start);
    }

    /**
     * Generate a Slot List graphic for a series.
     * Uses slotSourceQuickMatchId if set, otherwise falls back to the first completed match.
     */
    async generateSeriesSlotList(
        seriesId: string,
        userId: string,
        opts: SlotListGraphicOptions
    ): Promise<GraphicGenerationResult> {
        const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
        }

        // Resolve source match for slots
        const dbSeries = await this.db.quickTournamentSeries.findFirst({
            where: { id: seriesId, userId },
            include: {
                seriesMatches: {
                    where: { isCompleted: true },
                    orderBy: { matchOrder: 'asc' },
                    take: 1,
                    select: { quickMatchId: true },
                },
            },
        });

        const sourceMatchId =
            (dbSeries as any)?.slotSourceQuickMatchId ??
            dbSeries?.seriesMatches[0]?.quickMatchId;

        if (!sourceMatchId) {
            throw new ServiceError(
                'No completed matches in series. Complete at least one match before generating a slot list graphic.',
                400,
                'NO_COMPLETED_MATCH'
            );
        }

        return this.generateMatchSlotList(sourceMatchId, userId, opts);
    }

    // ─────────────────────────────────────────
    // ROSTER
    // ─────────────────────────────────────────

    /**
     * Generate a Team Roster (team-list) graphic for a match.
     */
    async generateMatchRoster(
        quickMatchId: string,
        userId: string,
        opts: RosterGraphicOptions
    ): Promise<GraphicGenerationResult> {
        const start = Date.now();

        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const slots = await this.db.quickSlotAssignment.findMany({
            where: { quickMatchId },
            include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
            orderBy: { slotNumber: 'asc' },
        });

        if (slots.length === 0) {
            throw new ServiceError(
                'No slot assignments found. Add slots before generating a roster graphic.',
                400,
                'NO_SLOTS'
            );
        }

        const teamData = slots.map(s => ({
            slot: s.slotNumber,
            team_name: s.teamName,
            team_logo_url: this.resolveLogoUrl(s) ?? undefined,
        }));

        const request: TeamListRequest = {
            template_url: opts.templateUrl,
            template_config_url: opts.templateConfigUrl,
            team_data: teamData,
            header_overrides: opts.headerOverrides ?? null,
            header_style: opts.headerStyle ?? null,
            footer_overrides: opts.footerOverrides ?? null,
            footer_style: opts.footerStyle ?? null,
            team_logo_size: opts.teamLogoSize ?? null,
            team_name_font_size: opts.teamNameFontSize ?? null,
            team_name_color: opts.teamNameColor ?? null,
            card_overrides: opts.cardOverrides ?? null,
            font_customization: opts.fontCustomization ?? null,
            show_branding: opts.showBranding,
            output_filename: opts.outputFilename,
            options: { upload_to_r2: true, compress_image: false, render_scale: 0, ...(opts.options ?? {}) },
        };

        const pyResponse = await pythonAIService.generateTeamList(request);
        return this.extractResult(pyResponse, Date.now() - start);
    }

    // ─────────────────────────────────────────
    // TOP 10
    // ─────────────────────────────────────────

    /**
     * Generate a Top-10 Rankings graphic from a single match's results.
     * Sends all teams if fewer than 10 (they're all in the top 10).
     */
    async generateMatchTop10(
        quickMatchId: string,
        userId: string,
        opts: Top10GraphicOptions
    ): Promise<GraphicGenerationResult> {
        const start = Date.now();

        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const results = await quickResultService.getMatchResults(quickMatchId, userId);
        if (results.length === 0) {
            throw new ServiceError(
                'No match results found. Process result screenshots or enter results manually first.',
                400,
                'NO_RESULTS'
            );
        }

        // Get slot assignments to pick up logos
        const slots = await this.db.quickSlotAssignment.findMany({
            where: { quickMatchId },
            include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
        });
        const slotLogoMap = new Map(
            slots.map(s => [s.slotNumber, this.resolveLogoUrl(s)])
        );

        // Sort by total points desc, take all (if ≤ 10) or top 10
        const sorted = [...results].sort((a, b) => {
            if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
            if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
            return (a.rank ?? a.position) - (b.rank ?? b.position);
        });

        const rankData = sorted.map((r, i) => ({
            rank: i + 1,
            team_name: r.teamName,
            total_points: r.totalPoints,
            team_logo_url: slotLogoMap.get(r.slotNumber) ?? undefined,
        }));

        const request: Top10Request = {
            template_url: opts.templateUrl,
            template_config_url: opts.templateConfigUrl,
            rank_data: rankData,
            header_overrides: opts.headerOverrides ?? null,
            footer_overrides: opts.footerOverrides ?? null,
            card_overrides: opts.cardOverrides ?? null,
            font_customization: opts.fontCustomization ?? null,
            show_branding: opts.showBranding,
            output_filename: opts.outputFilename,
            options: { upload_to_r2: true, compress_image: false, render_scale: 0, ...(opts.options ?? {}) },
        };

        const pyResponse = await pythonAIService.generateTop10Rankings(request);
        return this.extractResult(pyResponse, Date.now() - start);
    }

    /**
     * Generate a Top-10 Rankings graphic from aggregated series standings.
     */
    async generateSeriesTop10(
        seriesId: string,
        userId: string,
        opts: Top10GraphicOptions
    ): Promise<GraphicGenerationResult> {
        const start = Date.now();

        const series = await quickSeriesService.getTournamentSeriesById(seriesId, userId);
        if (!series) {
            throw new ServiceError('Tournament series not found or access denied', 404, 'NOT_FOUND');
        }

        const leaderboard = await quickSeriesService.getSeriesLeaderboard(seriesId, userId);
        if (!leaderboard?.leaderboardData?.length) {
            throw new ServiceError(
                'No series leaderboard data. Add matches with results before generating a Top-10 graphic.',
                400,
                'NO_LEADERBOARD'
            );
        }

        const standings = leaderboard.leaderboardData;

        // Get slot logos from the source match
        const dbSeries = await this.db.quickTournamentSeries.findFirst({
            where: { id: seriesId, userId },
            include: {
                seriesMatches: {
                    where: { isCompleted: true },
                    orderBy: { matchOrder: 'asc' },
                    take: 1,
                    select: { quickMatchId: true },
                },
            },
        });

        const sourceMatchId =
            (dbSeries as any)?.slotSourceQuickMatchId ??
            dbSeries?.seriesMatches[0]?.quickMatchId;

        let slotLogoMap = new Map<string, string | null>();
        if (sourceMatchId) {
            const slots = await this.db.quickSlotAssignment.findMany({
                where: { quickMatchId: sourceMatchId },
                include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
            });
            slotLogoMap = new Map(
                slots.map(s => [s.teamName.toLowerCase(), this.resolveLogoUrl(s)])
            );
        }

        const rankData = standings.map((s: any, i: number) => ({
            rank: i + 1,
            team_name: s.teamName,
            total_points: s.totalPoints,
            team_logo_url: slotLogoMap.get(s.teamName.toLowerCase()) ?? undefined,
        }));

        const request: Top10Request = {
            template_url: opts.templateUrl,
            template_config_url: opts.templateConfigUrl,
            rank_data: rankData,
            header_overrides: opts.headerOverrides ?? null,
            footer_overrides: opts.footerOverrides ?? null,
            card_overrides: opts.cardOverrides ?? null,
            font_customization: opts.fontCustomization ?? null,
            show_branding: opts.showBranding,
            output_filename: opts.outputFilename,
            options: { upload_to_r2: true, compress_image: false, render_scale: 0, ...(opts.options ?? {}) },
        };

        const pyResponse = await pythonAIService.generateTop10Rankings(request);
        return this.extractResult(pyResponse, Date.now() - start);
    }

    // ─────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────

    private resolveLogoUrl(slot: {
        matchLogoStorageUrl?: string | null;
        logoPresetEntry?: { logoStorageUrl: string } | null;
    }): string | null {
        return slot.matchLogoStorageUrl ?? slot.logoPresetEntry?.logoStorageUrl ?? null;
    }

    private async extractResult(
        pyResponse: Awaited<ReturnType<typeof pythonAIService.generateSlotList>>,
        generationTimeMs: number
    ): Promise<GraphicGenerationResult> {
        if (pyResponse.status !== 'success') {
            throw new ServiceError(
                `Python AI graphic generation failed: ${pyResponse.error?.message ?? 'Unknown error'}`,
                502,
                'PYTHON_AI_ERROR'
            );
        }

        const rawImageUrl: string =
            pyResponse.data?.image_url ||
            pyResponse.data?.download_url ||
            pyResponse.data?.output_url ||
            pyResponse.metadata?.r2_upload_url;

        if (!rawImageUrl) {
            throw new ServiceError('Python AI did not return an image URL', 502, 'PYTHON_AI_ERROR');
        }

        // Extract R2 key from URL and sign it
        const r2Key = this.extractR2Key(rawImageUrl);
        const signed = await signedUrlUtility.generateSignedUrl(r2Key, { expiryMinutes: 30 });

        return {
            signedUrl: signed.signedUrl,
            imageUrl: rawImageUrl,
            generationTimeMs,
        };
    }

    private extractR2Key(imageUrl: string): string {
        try {
            const url = new URL(imageUrl);
            let key = url.pathname.replace(/^\/+/, '');
            const bucketName = process.env.R2_BUCKET_NAME;
            if (bucketName && key.startsWith(`${bucketName}/`)) {
                key = key.substring(bucketName.length + 1);
            }
            if (!key) throw new Error('Empty R2 object key');
            return key;
        } catch {
            this.logger.error('Failed to extract R2 key from URL:', imageUrl);
            throw new ServiceError('Invalid image URL format from Python AI', 502, 'PYTHON_AI_ERROR');
        }
    }
}

export const quickGraphicsService = new QuickGraphicsService();
