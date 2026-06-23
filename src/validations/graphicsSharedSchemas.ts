import { z } from 'zod';

export const fontRoleConfigSchema = z.object({
    font_file: z.string().optional(),
    family: z.string().optional(),
    weight: z.string().optional(),
    size: z.number().optional(),
    color: z.string().optional(),
    alignment: z.string().optional(),
}).optional();

/** Matches Python font_customization — incl. override_all_fonts from latest API */
export const fontCustomizationSchema = z.object({
    override_all_fonts: z.boolean().optional(),
    header_font: fontRoleConfigSchema,
    sponsor_font: fontRoleConfigSchema,
    organiser_font: fontRoleConfigSchema,
    table_header_font: fontRoleConfigSchema,
    table_data_font: fontRoleConfigSchema,
    team_name_font: fontRoleConfigSchema,
    slot_number_font: fontRoleConfigSchema,
    rank_font: fontRoleConfigSchema,
    footer_font: fontRoleConfigSchema,
    branding_font: fontRoleConfigSchema,
    global_size_multiplier: z.number().min(0.1).max(10).optional(),
}).optional().nullable();

export const advancedConfigSchema = z.record(z.string(), z.any()).optional().nullable();
