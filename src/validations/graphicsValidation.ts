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

// fontCustomization accepts both camelCase (Android legacy) and snake_case (Python-style)
const fontCustomizationSchema = z.object({
    // snake_case (Python-style, preferred)
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

// Helper: valid output filename
const outputFilenameSchema = z.string().regex(/^[\w\-_.]+\.png$/).optional().nullable().transform(v => v ?? undefined);

// ---- Slot List ----
// Works for both match and series — sourceType determines which service method is called.
// Accepts both camelCase (legacy) and snake_case field names.
export const slotListGraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),

    // template URLs — accept both camelCase and snake_case
    templateUrl: z.string().url().optional(),
    template_url: z.string().url().optional(),
    templateConfigUrl: z.string().url().optional(),
    template_config_url: z.string().url().optional(),

    // customisation fields — accept both naming styles
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
}).refine(
    d => !!(d.templateUrl || d.template_url),
    { message: 'templateUrl (or template_url) is required', path: ['templateUrl'] }
).refine(
    d => !!(d.templateConfigUrl || d.template_config_url),
    { message: 'templateConfigUrl (or template_config_url) is required', path: ['templateConfigUrl'] }
);

// ---- Roster ----
// Match-only graphic. sourceType must be "match".
export const rosterGraphicSchema = z.object({
    sourceType: z.literal('match'),
    sourceId: z.string().min(1, 'sourceId (match ID) is required'),

    templateUrl: z.string().url().optional(),
    template_url: z.string().url().optional(),
    templateConfigUrl: z.string().url().optional(),
    template_config_url: z.string().url().optional(),

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
}).refine(
    d => !!(d.templateUrl || d.template_url),
    { message: 'templateUrl (or template_url) is required', path: ['templateUrl'] }
).refine(
    d => !!(d.templateConfigUrl || d.template_config_url),
    { message: 'templateConfigUrl (or template_config_url) is required', path: ['templateConfigUrl'] }
);

// ---- Top 10 ----
// Works for both match and series.
export const top10GraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),

    templateUrl: z.string().url().optional(),
    template_url: z.string().url().optional(),
    templateConfigUrl: z.string().url().optional(),
    template_config_url: z.string().url().optional(),

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
}).refine(
    d => !!(d.templateUrl || d.template_url),
    { message: 'templateUrl (or template_url) is required', path: ['templateUrl'] }
).refine(
    d => !!(d.templateConfigUrl || d.template_config_url),
    { message: 'templateConfigUrl (or template_config_url) is required', path: ['templateConfigUrl'] }
);
