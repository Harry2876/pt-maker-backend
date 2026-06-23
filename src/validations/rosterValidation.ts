import { z } from 'zod';
import { advancedConfigSchema, fontCustomizationSchema } from './graphicsSharedSchemas';

/**
 * Body for POST /quick-pt/matches/:id/graphics/roster
 * Match ID comes from route params — not in this schema.
 */
export const rosterGraphicSchema = z.object({
    template: z.string()
        .min(1, 'Template name is required')
        .max(100, 'Template name must be at most 100 characters')
        .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters')
        .optional()
        .default('team_roster1'),

    formatType: z.string()
        .min(1, 'Format type is required')
        .max(50, 'Format type must be at most 50 characters')
        .optional()
        .default('team_roster'),

    outputFilename: z.string()
        .regex(/^[\w\-_.]+\.png$/, 'Output filename must be a valid PNG filename')
        .optional(),

    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    headerStyle: z.record(z.string(), z.any()).optional().nullable(),
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    footerStyle: z.record(z.string(), z.any()).optional().nullable(),

    teamLogoSize: z.number().nullable().optional(),
    teamNameFontSize: z.number().nullable().optional(),
    teamNameColor: z.string().nullable().optional(),

    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    advancedConfig: advancedConfigSchema,
    showBranding: z.boolean().optional(),
});
