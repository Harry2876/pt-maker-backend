import { z } from 'zod';

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

// ---- Slot List ----
// Works for both match and series — sourceType determines which service method is called.
export const slotListGraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),
    templateUrl: z.string().url('templateUrl must be a valid URL'),
    templateConfigUrl: z.string().url('templateConfigUrl must be a valid URL'),
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    slotNumberFontSize: z.number().optional().nullable(),
    teamNameFontSize: z.number().optional().nullable(),
    slotNumberColor: z.string().optional().nullable(),
    teamNameColor: z.string().optional().nullable(),
    teamLogoGap: z.number().optional().nullable(),
    teamLogoSize: z.number().optional().nullable(),
    gridOverrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    outputFilename: z.string().regex(/^[\w\-_.]+\.png$/).optional(),
    options: graphicsOptionsSchema,
});

// ---- Roster ----
// Match-only graphic. sourceType must be "match".
export const rosterGraphicSchema = z.object({
    sourceType: z.literal('match'),
    sourceId: z.string().min(1, 'sourceId (match ID) is required'),
    templateUrl: z.string().url('templateUrl must be a valid URL'),
    templateConfigUrl: z.string().url('templateConfigUrl must be a valid URL'),
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    headerStyle: z.record(z.string(), z.any()).optional().nullable(),
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    footerStyle: z.record(z.string(), z.any()).optional().nullable(),
    teamLogoSize: z.number().optional().nullable(),
    teamNameFontSize: z.number().optional().nullable(),
    teamNameColor: z.string().optional().nullable(),
    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    showBranding: z.boolean().optional(),
    outputFilename: z.string().regex(/^[\w\-_.]+\.png$/).optional(),
    options: graphicsOptionsSchema,
});

// ---- Top 10 ----
// Works for both match and series.
export const top10GraphicSchema = z.object({
    sourceType: z.enum(['match', 'series'] as const),
    sourceId: z.string().min(1, 'sourceId is required'),
    templateUrl: z.string().url('templateUrl must be a valid URL'),
    templateConfigUrl: z.string().url('templateConfigUrl must be a valid URL'),
    headerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    footerOverrides: z.record(z.string(), z.any()).optional().nullable(),
    cardOverrides: z.record(z.string(), z.any()).optional().nullable(),
    fontCustomization: fontCustomizationSchema,
    showBranding: z.boolean().optional(),
    outputFilename: z.string().regex(/^[\w\-_.]+\.png$/).optional(),
    options: graphicsOptionsSchema,
});
