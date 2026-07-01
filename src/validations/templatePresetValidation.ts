import { z } from 'zod';
import { exportPointsTableSchema } from './quickResultValidation';
import { slotListGraphicSchema } from './slotListValidation';
import { rosterGraphicSchema } from './rosterValidation';
import { top10GraphicSchema } from './top10Validation';
import { TemplatePresetGraphicType } from '../types/templatePreset';

const templateNameSchema = z.string()
    .min(1, 'Template name is required')
    .max(100, 'Template name must be at most 100 characters')
    .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters');

export const templatePresetGraphicTypeSchema = z.enum([
    'STANDINGS',
    'SERIES_STANDINGS',
    'SLOT_LIST',
    'ROSTER',
    'TOP_10',
]);

/** Customization-only fields — same as generate/export body minus routing & screen toggles */
const standingsFormValuesSchema = exportPointsTableSchema.omit({
    format: true,
    template: true,
    formatType: true,
    showBranding: true,
}).strict();

const slotListFormValuesSchema = slotListGraphicSchema.omit({
    template: true,
    formatType: true,
    showBranding: true,
}).strict();

const rosterFormValuesSchema = rosterGraphicSchema.omit({
    template: true,
    formatType: true,
    showBranding: true,
}).strict();

const top10FormValuesSchema = top10GraphicSchema.omit({
    template: true,
    formatType: true,
    showBranding: true,
}).strict();

export function getTemplatePresetFormValuesSchema(graphicType: TemplatePresetGraphicType) {
    switch (graphicType) {
        case 'STANDINGS':
        case 'SERIES_STANDINGS':
            return standingsFormValuesSchema;
        case 'SLOT_LIST':
            return slotListFormValuesSchema;
        case 'ROSTER':
            return rosterFormValuesSchema;
        case 'TOP_10':
            return top10FormValuesSchema;
    }
}

function validateFormValuesForGraphicType(
    graphicType: TemplatePresetGraphicType,
    formValues: Record<string, unknown>,
    ctx: z.RefinementCtx,
    pathPrefix: (string | number)[] = ['formValues']
) {
    const result = getTemplatePresetFormValuesSchema(graphicType).safeParse(formValues);
    if (!result.success) {
        for (const issue of result.error.issues) {
            ctx.addIssue({
                ...issue,
                path: [...pathPrefix, ...issue.path],
            });
        }
    }
}

export const createTemplatePresetSchema = z.object({
    name: z.string().min(1, 'Preset name is required').max(100, 'Preset name must be at most 100 characters'),
    graphicType: templatePresetGraphicTypeSchema,
    template: templateNameSchema,
    formatType: z.string().min(1).max(50).optional().nullable(),
    formValues: z.record(z.string(), z.unknown()),
}).superRefine((data, ctx) => {
    validateFormValuesForGraphicType(data.graphicType, data.formValues, ctx);
});

export const updateTemplatePresetSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    formValues: z.record(z.string(), z.unknown()).optional(),
}).refine(
    (data) => data.name !== undefined || data.formValues !== undefined,
    { message: 'At least one of name or formValues is required' }
);

export const templatePresetParamsSchema = z.object({
    presetId: z.string().min(1, 'Preset ID is required'),
});

export const listTemplatePresetsQuerySchema = z.object({
    graphicType: templatePresetGraphicTypeSchema,
    template: templateNameSchema,
    formatType: z.string().min(1).max(50).optional(),
});
