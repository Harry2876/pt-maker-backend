import { z } from 'zod';

// Python-style snake_case font role (used inside fontCustomization)
const fontRoleSchema = z.object({
    font_file: z.string().optional(),
    family: z.string().optional(),
    weight: z.string().optional(),
    size: z.number().optional(),
    color: z.string().optional(),
    alignment: z.string().optional(),
}).optional();

const fontCustomizationSchema = z.object({
    header_font: fontRoleSchema,
    sponsor_font: fontRoleSchema,
    organiser_font: fontRoleSchema,
    table_header_font: fontRoleSchema,
    table_data_font: fontRoleSchema,
    team_name_font: fontRoleSchema,
    slot_number_font: fontRoleSchema,
    rank_font: fontRoleSchema,
    footer_font: fontRoleSchema,
    branding_font: fontRoleSchema,
    global_size_multiplier: z.number().min(0.1).max(10).optional(),
}).optional().nullable();

const graphicsOptionsSchema = z.object({
    upload_to_r2: z.boolean().optional(),
    compress_image: z.boolean().optional(),
    image_quality: z.number().min(50).max(95).optional(),
    render_scale: z.number().nullable().optional(),
    local_debug_path: z.string().nullable().optional(),
}).optional().nullable();

const outputFilenameSchema = z.string().regex(/^[\w\-_.]+\.png$/).optional().nullable().transform(v => v ?? undefined);

/** Same pattern as standings export: template name + category key from GET /quick-pt/templates */
const templateSelectionFields = {
    template: z.string()
        .min(1, 'Template name is required')
        .max(100, 'Template name must be at most 100 characters')
        .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters'),
    formatType: z.string()
        .min(1, 'Format type is required')
        .max(50, 'Format type must be at most 50 characters'),
};

// ---- Slot List ----
export const slotListGraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),
    ...templateSelectionFields,
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    header_overrides: z.record(z.string(), z.any()).optional().nullable(),
    slotNumberFontSize: z.number().optional().nullable(),
    slot_number_font_size: z.number().optional().nullable(),
    teamNameFontSize: z.number().optional().nullable(),
    team_name_font_size: z.number().optional().nullable(),
    slotNumberColor: z.string().optional().nullable(),
    slot_number_color: z.string().optional().nullable(),
    teamNameColor: z.string().optional().nullable(),
    team_name_color: z.string().optional().nullable(),
    teamLogoGap: z.number().optional().nullable(),
    team_logo_gap: z.number().optional().nullable(),
    teamLogoSize: z.number().optional().nullable(),
    team_logo_size: z.number().optional().nullable(),
    gridOverrides: z.record(z.string(), z.any()).optional().nullable(),
    grid_overrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    font_customization: fontCustomizationSchema,
    outputFilename: outputFilenameSchema,
    output_filename: outputFilenameSchema,
    options: graphicsOptionsSchema,
});

// ---- Roster ----
export const rosterGraphicSchema = z.object({
    sourceType: z.literal('match'),
    sourceId: z.string().min(1, 'sourceId (match ID) is required'),
    ...templateSelectionFields,
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    header_overrides: z.record(z.string(), z.any()).optional().nullable(),
    headerStyle: z.record(z.string(), z.any()).optional().nullable(),
    header_style: z.record(z.string(), z.any()).optional().nullable(),
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    footer_overrides: z.record(z.string(), z.any()).optional().nullable(),
    footerStyle: z.record(z.string(), z.any()).optional().nullable(),
    footer_style: z.record(z.string(), z.any()).optional().nullable(),
    teamLogoSize: z.number().optional().nullable(),
    team_logo_size: z.number().optional().nullable(),
    teamNameFontSize: z.number().optional().nullable(),
    team_name_font_size: z.number().optional().nullable(),
    teamNameColor: z.string().optional().nullable(),
    team_name_color: z.string().optional().nullable(),
    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),
    card_overrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    font_customization: fontCustomizationSchema,
    showBranding: z.boolean().optional(),
    show_branding: z.boolean().optional(),
    outputFilename: outputFilenameSchema,
    output_filename: outputFilenameSchema,
    options: graphicsOptionsSchema,
});

// ---- Top 10 ----
export const top10GraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),
    ...templateSelectionFields,
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    header_overrides: z.record(z.string(), z.any()).optional().nullable(),
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    footer_overrides: z.record(z.string(), z.any()).optional().nullable(),
    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),
    card_overrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    font_customization: fontCustomizationSchema,
    showBranding: z.boolean().optional(),
    show_branding: z.boolean().optional(),
    outputFilename: outputFilenameSchema,
    output_filename: outputFilenameSchema,
    options: graphicsOptionsSchema,
});
