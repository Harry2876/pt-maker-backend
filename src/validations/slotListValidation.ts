import { z } from 'zod';
import {
    elementOverridesSchema,
    fontCustomizationSchema,
    footerOverridesSchema,
    logoOverridesSchema,
    socialOverridesSchema,
} from './graphicsSharedSchemas';

/**
 * Body for POST /quick-pt/matches/:id/graphics/slot-list
 * Match ID comes from route params — not in this schema.
 */
export const slotListGraphicSchema = z.object({
    template: z.string()
        .min(1, 'Template name is required')
        .max(100, 'Template name must be at most 100 characters')
        .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters')
        .optional()
        .default('sl1'),

    formatType: z.string()
        .min(1, 'Format type is required')
        .max(50, 'Format type must be at most 50 characters')
        .optional()
        .default('slot_list'),

    outputFilename: z.string()
        .regex(/^[\w\-_.]+\.png$/, 'Output filename must be a valid PNG filename')
        .optional(),

    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    elementOverrides: elementOverridesSchema,

    slotNumberFontSize: z.number().nullable().optional(),
    teamNameFontSize: z.number().nullable().optional(),
    slotNumberColor: z.string().nullable().optional(),
    teamNameColor: z.string().nullable().optional(),
    teamLogoGap: z.number().nullable().optional(),
    teamLogoSize: z.number().nullable().optional(),

    gridOverrides: z.record(z.string(), z.any()).optional().nullable(),
    orgLogoOverrides: logoOverridesSchema,
    sponsorLogoOverrides: logoOverridesSchema,
    socialOverrides: socialOverridesSchema,
    footerOverrides: footerOverridesSchema,

    fontCustomization: fontCustomizationSchema,
    showBranding: z.boolean().optional(),
});
