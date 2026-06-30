import { BaseService } from './baseService';
import { quickMatchService } from './quickMatchService';
import { templateService } from './templateService';
import { pythonAIService } from './pythonAIService';
import { mediaAssetService } from './mediaAssetService';
import { ServiceError } from '../utils/serviceError';
import { MediaAssetPreview, QuickMediaAssetType } from '../types/mediaAsset';
import { buildSlotListRequest } from '../utils/slotListPayloadBuilder';
import { buildTeamListRequest } from '../utils/teamListPayloadBuilder';
import { buildTop10Request } from '../utils/top10PayloadBuilder';
import { entitlementService } from './entitlementService';
import {
    SlotListExportOptions,
    SlotListSlotData,
    TeamListExportOptions,
    TeamListTeamData,
    Top10ExportOptions,
    Top10RankData,
} from '../types/pythonAI';
import { quickResultService } from './quickResultService';
import { QuickMatchResultCache } from '../types/quickResult';
import { sortMatchResultsForStandings } from '../utils/standingsSort';
import { getTemplateCapacity } from '../utils/templateConfigUtils';
import { splitTeamDataIntoChunks, buildSplitOutputFilename } from '../utils/pythonErrorUtils';

/** Input from controller — template selection + styling opts */
export interface MatchSlotListInput extends SlotListExportOptions {
    template: string;
    formatType: string;
}

/** Response returned to Android — load previewUrl directly (signed /files/ URL) */
export interface SlotListGenerationResult {
    assetId: string;
    previewUrl: string;
    /** Same as previewUrl (Android fallback) */
    signedUrl: string;
    generationTimeMs: number;
    slotCount: number;
}

/** Input from controller — template selection + styling opts */
export interface MatchRosterInput extends TeamListExportOptions {
    template: string;
    formatType: string;
}

export interface RosterGraphicImage {
    part: number;
    label: 'main' | 'overflow';
    assetId: string;
    previewUrl: string;
    /** Same as previewUrl (Android fallback) */
    signedUrl: string;
    filename?: string;
    teamCount: number;
}

export interface RosterGenerationResult {
    assetId: string;
    previewUrl: string;
    /** Same as previewUrl (Android fallback) */
    signedUrl: string;
    generationTimeMs: number;
    totalTeams: number;
    imageCount: number;
    images: RosterGraphicImage[];
}

/** Input from controller — template selection + styling opts */
export interface MatchTop10Input extends Top10ExportOptions {
    template: string;
    formatType: string;
}

export interface Top10GenerationResult {
    assetId: string;
    previewUrl: string;
    /** Same as previewUrl (Android fallback) */
    signedUrl: string;
    generationTimeMs: number;
    rankCount: number;
}

export class QuickGraphicsService extends BaseService {
    /** Python slot-list / team-list APIs accept slot numbers 1–24 only */
    private static readonly MAX_SLOT = 24;
    /** Python top-10 API accepts at most 10 rank rows */
    private static readonly MAX_TOP10_RANK = 10;

    async generateMatchSlotList(
        quickMatchId: string,
        userId: string,
        input: MatchSlotListInput,
    ): Promise<SlotListGenerationResult> {
        const start = Date.now();

        // 1. Verify match
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        // 2. Load slots from DB
        const slots = await this.db.quickSlotAssignment.findMany({
            where: { quickMatchId },
            include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
            orderBy: { slotNumber: 'asc' },
        });

        if (slots.length === 0) {
            throw new ServiceError(
                'No slot assignments found. Add slots before generating a slot list graphic.',
                400,
                'NO_SLOTS',
            );
        }

        // 3. Filter to slots 1–24
        const eligible = slots.filter(
            s => s.slotNumber >= 1 && s.slotNumber <= QuickGraphicsService.MAX_SLOT,
        );

        if (eligible.length === 0) {
            throw new ServiceError(
                `No slot assignments within slots 1–${QuickGraphicsService.MAX_SLOT}.`,
                400,
                'SLOTS_EXCEED_CAPACITY',
            );
        }

        // 4. Build slot_data (raw logo URLs — Python resolves R2 access itself)
        const slotData: SlotListSlotData[] = eligible.map(s => ({
            slot_number: s.slotNumber,
            team_name: s.teamName,
            team_logo_url: s.matchLogoStorageUrl ?? s.logoPresetEntry?.logoStorageUrl ?? undefined,
        }));

        // 5. Resolve template (raw R2 URLs — same as direct Python curl)
        const resolved = await templateService.getTemplateWithConfig(input.template, input.formatType);
        if (!resolved) {
            throw new ServiceError(
                `Template "${input.template}" not found for format "${input.formatType}". Check GET /quick-pt/templates.`,
                400,
                'TEMPLATE_NOT_FOUND',
            );
        }

        // 6. Build request + call Python (server overrides client showBranding)
        const styledInput = await this.withServerBranding(userId, input);
        const { template, formatType, ...stylingOpts } = styledInput;
        const request = buildSlotListRequest(
            resolved.templateUrl,
            resolved.configUrl,
            slotData,
            stylingOpts,
        );

        const pyResponse = await pythonAIService.generateSlotList(request);

        if (pyResponse.status !== 'success') {
            throw new ServiceError(
                `Python AI slot list generation failed: ${pyResponse.error?.message ?? pyResponse.status}`,
                502,
                'PYTHON_AI_ERROR',
            );
        }

        const preview = await this.registerPythonImageAsAsset(
            userId,
            quickMatchId,
            'SLOT_LIST',
            pyResponse,
            { slotCount: slotData.length, template: input.template, formatType: input.formatType },
            input.outputFilename,
        );

        return {
            assetId: preview.assetId,
            previewUrl: preview.previewUrl,
            signedUrl: preview.previewUrl,
            generationTimeMs: Date.now() - start,
            slotCount: slotData.length,
        };
    }

    async generateMatchRoster(
        quickMatchId: string,
        userId: string,
        input: MatchRosterInput,
    ): Promise<RosterGenerationResult> {
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
                'NO_SLOTS',
            );
        }

        const eligible = slots.filter(
            s => s.slotNumber >= 1 && s.slotNumber <= QuickGraphicsService.MAX_SLOT,
        );

        if (eligible.length === 0) {
            throw new ServiceError(
                `No slot assignments within slots 1–${QuickGraphicsService.MAX_SLOT}.`,
                400,
                'SLOTS_EXCEED_CAPACITY',
            );
        }

        const teamData: TeamListTeamData[] = eligible.map(s => ({
            slot: s.slotNumber,
            team_name: s.teamName,
            team_logo_url: s.matchLogoStorageUrl ?? s.logoPresetEntry?.logoStorageUrl ?? undefined,
        }));

        const resolved = await templateService.getTemplateWithConfig(input.template, input.formatType);
        if (!resolved) {
            throw new ServiceError(
                `Template "${input.template}" not found for format "${input.formatType}". Check GET /quick-pt/templates.`,
                400,
                'TEMPLATE_NOT_FOUND',
            );
        }

        const templateCapacity = await getTemplateCapacity(resolved.configUrl);
        const teamChunks = splitTeamDataIntoChunks(teamData, templateCapacity);

        if (teamChunks.length > 1) {
            this.logger.info(
                `Splitting ${teamData.length} roster teams into ${teamChunks.length} images (capacity ${templateCapacity})`,
                { quickMatchId, chunkSizes: teamChunks.map(c => c.length) }
            );
        }

        const styledInput = await this.withServerBranding(userId, input);
        const { template, formatType, ...stylingOpts } = styledInput;
        const images: RosterGraphicImage[] = [];

        for (let i = 0; i < teamChunks.length; i++) {
            const chunk = teamChunks[i];
            const partIndex = i + 1;
            const isOverflow = partIndex === teamChunks.length && chunk.length < templateCapacity;

            const chunkTeamData = chunk.map((team, idx) => ({
                ...team,
                slot: idx + 1,
            }));

            const chunkOutputFilename = buildSplitOutputFilename(
                stylingOpts.outputFilename,
                partIndex,
                teamChunks.length
            );

            const request = buildTeamListRequest(
                resolved.templateUrl,
                resolved.configUrl,
                chunkTeamData,
                stylingOpts,
                chunkOutputFilename
            );

            const pyResponse = await pythonAIService.generateTeamList(request);

            if (pyResponse.status !== 'success') {
                throw new ServiceError(
                    `Python AI roster generation failed: ${pyResponse.error?.message ?? pyResponse.status}`,
                    502,
                    'PYTHON_AI_ERROR',
                );
            }

            const preview = await this.registerPythonImageAsAsset(
                userId,
                quickMatchId,
                'ROSTER',
                pyResponse,
                {
                    part: partIndex,
                    label: isOverflow ? 'overflow' : 'main',
                    teamCount: chunk.length,
                    template: input.template,
                    formatType: input.formatType,
                },
                chunkOutputFilename,
            );

            images.push({
                part: partIndex,
                label: isOverflow ? 'overflow' : 'main',
                assetId: preview.assetId,
                previewUrl: preview.previewUrl,
                signedUrl: preview.previewUrl,
                filename: chunkOutputFilename,
                teamCount: chunk.length,
            });
        }

        const first = images[0];
        return {
            assetId: first.assetId,
            previewUrl: first.previewUrl,
            signedUrl: first.previewUrl,
            generationTimeMs: Date.now() - start,
            totalTeams: teamData.length,
            imageCount: images.length,
            images,
        };
    }

    async generateMatchTop10(
        quickMatchId: string,
        userId: string,
        input: MatchTop10Input,
    ): Promise<Top10GenerationResult> {
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
                'NO_RESULTS',
            );
        }

        const slots = await this.db.quickSlotAssignment.findMany({
            where: { quickMatchId },
            include: { logoPresetEntry: { select: { logoStorageUrl: true } } },
        });
        const slotLogoMap = new Map(
            slots.map(s => [s.slotNumber, s.matchLogoStorageUrl ?? s.logoPresetEntry?.logoStorageUrl ?? null])
        );

        const sorted = sortMatchResultsForStandings(results);
        const rankData: Top10RankData[] = sorted
            .slice(0, QuickGraphicsService.MAX_TOP10_RANK)
            .map((r, i) => ({
                rank: i + 1,
                team_name: r.teamName,
                total_points: r.totalPoints,
                team_logo_url: slotLogoMap.get(r.slotNumber) ?? undefined,
            }));

        const resolved = await templateService.getTemplateWithConfig(input.template, input.formatType);
        if (!resolved) {
            throw new ServiceError(
                `Template "${input.template}" not found for format "${input.formatType}". Check GET /quick-pt/templates.`,
                400,
                'TEMPLATE_NOT_FOUND',
            );
        }

        const styledInput = await this.withServerBranding(userId, input);
        const { template, formatType, ...stylingOpts } = styledInput;
        const request = buildTop10Request(
            resolved.templateUrl,
            resolved.configUrl,
            rankData,
            stylingOpts,
        );

        const pyResponse = await pythonAIService.generateTop10Rankings(request);

        if (pyResponse.status !== 'success') {
            throw new ServiceError(
                `Python AI top-10 generation failed: ${pyResponse.error?.message ?? pyResponse.status}`,
                502,
                'PYTHON_AI_ERROR',
            );
        }

        const preview = await this.registerPythonImageAsAsset(
            userId,
            quickMatchId,
            'TOP_10',
            pyResponse,
            { rankCount: rankData.length, template: input.template, formatType: input.formatType },
            input.outputFilename,
        );

        return {
            assetId: preview.assetId,
            previewUrl: preview.previewUrl,
            signedUrl: preview.previewUrl,
            generationTimeMs: Date.now() - start,
            rankCount: rankData.length,
        };
    }

    /** Pro/free tier decides branding — client body value is ignored. */
    private async withServerBranding<T extends { showBranding?: boolean }>(
        userId: string,
        input: T,
    ): Promise<T> {
        return {
            ...input,
            showBranding: await entitlementService.resolveShowBranding(userId),
        };
    }

    /** Rank by total points desc — same logic as standings export */
    private sortResultsForTop10(results: QuickMatchResultCache[]): QuickMatchResultCache[] {
        return sortMatchResultsForStandings(results);
    }

    private extractRawImageUrl(pyResponse: { data?: Record<string, any>; metadata?: Record<string, any> }): string {
        const rawImageUrl: string =
            pyResponse.data?.image_url ||
            pyResponse.data?.download_url ||
            pyResponse.data?.output_url ||
            pyResponse.metadata?.r2_upload_url;

        if (!rawImageUrl) {
            throw new ServiceError(
                'Python AI did not return an image URL in the response',
                502,
                'PYTHON_AI_ERROR',
            );
        }

        return rawImageUrl;
    }

    private async registerPythonImageAsAsset(
        userId: string,
        quickMatchId: string,
        assetType: QuickMediaAssetType,
        pyResponse: { data?: Record<string, any>; metadata?: Record<string, any> },
        metadata?: Record<string, unknown>,
        filename?: string,
    ): Promise<MediaAssetPreview> {
        const rawImageUrl = this.extractRawImageUrl(pyResponse);

        return mediaAssetService.registerFromImageUrl({
            userId,
            quickMatchId,
            assetType,
            rawImageUrl,
            filename,
            metadata,
        });
    }
}

export const quickGraphicsService = new QuickGraphicsService();