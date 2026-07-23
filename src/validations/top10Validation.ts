import { z } from 'zod';
import {
    advancedConfigSchema,
    elementOverridesSchema,
    fontCustomizationSchema,
    logoOverridesSchema,
    socialOverridesSchema,
} from './graphicsSharedSchemas';

/**
 * Body for POST /quick-pt/matches/:id/graphics/top-10
 * Match ID comes from route params — not in this schema.
 */
export const top10GraphicSchema = z.object({
    template: z.string()
        .min(1, 'Template name is required')
        .max(100, 'Template name must be at most 100 characters')
        .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters')
        .optional()
        .default('t10template_1'),

    formatType: z.string()
        .min(1, 'Format type is required')
        .max(50, 'Format type must be at most 50 characters')
        .optional()
        .default('top_10'),

    outputFilename: z.string()
        .regex(/^[\w\-_.]+\.png$/, 'Output filename must be a valid PNG filename')
        .optional(),

    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    elementOverrides: elementOverridesSchema,
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    orgLogoOverrides: logoOverridesSchema,
    socialOverrides: socialOverridesSchema,

    /** Global + per-rank card overrides — snake_case keys (rotation_deg, ranks["1"], etc.) */
    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),

    fontCustomization: fontCustomizationSchema,
    advancedConfig: advancedConfigSchema,
    showBranding: z.boolean().optional(),
});
