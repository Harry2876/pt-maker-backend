import { BaseService } from './baseService';
import redis from '../config/redis';
import { ServiceError } from '../utils/serviceError';
import {
    CreateTemplatePresetData,
    ListTemplatePresetsQuery,
    TemplatePresetDetail,
    TemplatePresetGraphicType,
    TemplatePresetSummary,
    UpdateTemplatePresetData,
} from '../types/templatePreset';
import { getTemplatePresetFormValuesSchema } from '../validations/templatePresetValidation';

const MAX_PRESETS_PER_USER = 50;

interface TemplatePresetCache {
    id: string;
    userId: string;
    name: string;
    graphicType: TemplatePresetGraphicType;
    template: string;
    formatType: string | null;
    formValues: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

interface TemplatePresetSummaryCache {
    id: string;
    name: string;
    graphicType: TemplatePresetGraphicType;
    template: string;
    formatType: string | null;
    createdAt: string;
    updatedAt: string;
}

export class TemplatePresetService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    async createPreset(userId: string, data: CreateTemplatePresetData): Promise<TemplatePresetDetail> {
        const count = await this.db.templatePreset.count({ where: { userId } });
        if (count >= MAX_PRESETS_PER_USER) {
            throw new ServiceError(
                `Maximum of ${MAX_PRESETS_PER_USER} template presets allowed per user.`,
                400,
                'PRESET_LIMIT_REACHED'
            );
        }

        const preset = await this.db.templatePreset.create({
            data: {
                userId,
                name: data.name.trim(),
                graphicType: data.graphicType,
                template: data.template,
                formatType: data.formatType?.trim() || null,
                formValues: JSON.parse(JSON.stringify(data.formValues)),
            },
        });

        const detail = this.toDetail(preset);
        await this.cachePreset(detail);
        await this.invalidateListCaches(userId, preset.graphicType, preset.template, preset.formatType);

        this.logger.info(`Template preset created: ${preset.id} for user ${userId}`);
        return detail;
    }

    async listPresets(userId: string, query: ListTemplatePresetsQuery): Promise<TemplatePresetSummary[]> {
        const cacheKey = this.listCacheKey(userId, query);
        const cached = await redis.getObject<TemplatePresetSummaryCache[]>(cacheKey);

        if (cached) {
            return cached.map((preset) => this.summaryFromCache(preset));
        }

        const where: {
            userId: string;
            graphicType: ListTemplatePresetsQuery['graphicType'];
            template: string;
            formatType?: string;
        } = {
            userId,
            graphicType: query.graphicType,
            template: query.template,
        };

        if (query.formatType) {
            where.formatType = query.formatType;
        }

        const presets = await this.db.templatePreset.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            select: {
                id: true,
                name: true,
                graphicType: true,
                template: true,
                formatType: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await redis.setObject(
            cacheKey,
            presets.map((preset) => this.toSummaryCache(preset)),
            this.CACHE_TTL
        );

        return presets;
    }

    async getPreset(userId: string, presetId: string): Promise<TemplatePresetDetail> {
        const cacheKey = this.presetCacheKey(presetId);
        const cached = await redis.hgetObject<TemplatePresetCache>(cacheKey);

        if (cached) {
            if (cached.userId !== userId) {
                throw new ServiceError('Template preset not found or access denied', 404, 'NOT_FOUND');
            }
            return this.detailFromCache(cached);
        }

        const preset = await this.db.templatePreset.findFirst({
            where: { id: presetId, userId },
        });

        if (!preset) {
            throw new ServiceError('Template preset not found or access denied', 404, 'NOT_FOUND');
        }

        const detail = this.toDetail(preset);
        await this.cachePreset(detail);
        return detail;
    }

    async updatePreset(
        userId: string,
        presetId: string,
        data: UpdateTemplatePresetData
    ): Promise<TemplatePresetDetail> {
        const existing = await this.db.templatePreset.findFirst({
            where: { id: presetId, userId },
        });

        if (!existing) {
            throw new ServiceError('Template preset not found or access denied', 404, 'NOT_FOUND');
        }

        if (data.formValues !== undefined) {
            const parsed = getTemplatePresetFormValuesSchema(existing.graphicType).safeParse(data.formValues);
            if (!parsed.success) {
                const message = parsed.error.issues.map((i) => i.message).join('; ');
                throw new ServiceError(message, 400, 'VALIDATION_ERROR');
            }
        }

        const preset = await this.db.templatePreset.update({
            where: { id: presetId },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.formValues !== undefined && {
                    formValues: JSON.parse(JSON.stringify(data.formValues)),
                }),
            },
        });

        const detail = this.toDetail(preset);
        await this.cachePreset(detail);
        await this.invalidateListCaches(userId, preset.graphicType, preset.template, preset.formatType);

        this.logger.info(`Template preset updated: ${presetId}`);
        return detail;
    }

    async deletePreset(userId: string, presetId: string): Promise<void> {
        const existing = await this.db.templatePreset.findFirst({
            where: { id: presetId, userId },
        });

        if (!existing) {
            throw new ServiceError('Template preset not found or access denied', 404, 'NOT_FOUND');
        }

        await this.db.templatePreset.delete({ where: { id: presetId } });
        await redis.delete(this.presetCacheKey(presetId));
        await this.invalidateListCaches(userId, existing.graphicType, existing.template, existing.formatType);

        this.logger.info(`Template preset deleted: ${presetId}`);
    }

    private presetCacheKey(presetId: string): string {
        return `templatePreset:${presetId}`;
    }

    private listCacheKey(userId: string, query: ListTemplatePresetsQuery): string {
        const formatKey = query.formatType ?? 'all';
        return `user:${userId}:templatePresets:list:${query.graphicType}:${query.template}:${formatKey}`;
    }

    private async cachePreset(detail: TemplatePresetDetail): Promise<void> {
        await redis.hsetObject(this.presetCacheKey(detail.id), this.toPresetCache(detail), this.CACHE_TTL);
    }

    private async invalidateListCaches(
        userId: string,
        graphicType: TemplatePresetGraphicType,
        template: string,
        formatType: string | null
    ): Promise<void> {
        const keys = [`user:${userId}:templatePresets:list:${graphicType}:${template}:all`];
        if (formatType) {
            keys.push(`user:${userId}:templatePresets:list:${graphicType}:${template}:${formatType}`);
        }
        await Promise.all(keys.map((key) => redis.delete(key)));
    }

    private toPresetCache(preset: TemplatePresetDetail): TemplatePresetCache {
        return {
            id: preset.id,
            userId: preset.userId,
            name: preset.name,
            graphicType: preset.graphicType,
            template: preset.template,
            formatType: preset.formatType,
            formValues: preset.formValues,
            createdAt: preset.createdAt.toISOString(),
            updatedAt: preset.updatedAt.toISOString(),
        };
    }

    private toSummaryCache(preset: TemplatePresetSummary): TemplatePresetSummaryCache {
        return {
            id: preset.id,
            name: preset.name,
            graphicType: preset.graphicType,
            template: preset.template,
            formatType: preset.formatType,
            createdAt: preset.createdAt.toISOString(),
            updatedAt: preset.updatedAt.toISOString(),
        };
    }

    private detailFromCache(cached: TemplatePresetCache): TemplatePresetDetail {
        return {
            id: cached.id,
            userId: cached.userId,
            name: cached.name,
            graphicType: cached.graphicType,
            template: cached.template,
            formatType: cached.formatType,
            formValues: cached.formValues ?? {},
            createdAt: new Date(cached.createdAt),
            updatedAt: new Date(cached.updatedAt),
        };
    }

    private summaryFromCache(cached: TemplatePresetSummaryCache): TemplatePresetSummary {
        return {
            id: cached.id,
            name: cached.name,
            graphicType: cached.graphicType,
            template: cached.template,
            formatType: cached.formatType,
            createdAt: new Date(cached.createdAt),
            updatedAt: new Date(cached.updatedAt),
        };
    }

    private toDetail(preset: {
        id: string;
        userId: string;
        name: string;
        graphicType: TemplatePresetDetail['graphicType'];
        template: string;
        formatType: string | null;
        formValues: unknown;
        createdAt: Date;
        updatedAt: Date;
    }): TemplatePresetDetail {
        return {
            id: preset.id,
            userId: preset.userId,
            name: preset.name,
            graphicType: preset.graphicType,
            template: preset.template,
            formatType: preset.formatType,
            formValues: (preset.formValues ?? {}) as Record<string, unknown>,
            createdAt: preset.createdAt,
            updatedAt: preset.updatedAt,
        };
    }
}

export const templatePresetService = new TemplatePresetService();
