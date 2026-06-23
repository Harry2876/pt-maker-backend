import { z } from 'zod';
import { fontCustomizationSchema } from './graphicsSharedSchemas';

// Player result schema (nested)
const playerResultSchema = z.object({
    playerName: z.string()
        .min(1, 'Player name is required')
        .max(50, 'Player name must be at most 50 characters'),
    
    kills: z.number()
        .int('Kills must be an integer')
        .min(0, 'Kills cannot be negative')
        .max(99, 'Kills cannot exceed 99')
});

// Create match result (manual entry)
export const createQuickMatchResultSchema = z.object({
    slotNumber: z.number()
        .int('Slot number must be an integer')
        .positive('Slot number must be positive')
        .min(1, 'Slot number must be at least 1')
        .max(25, 'Slot number cannot exceed 25'),
    
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters'),
    
    position: z.number()
        .int('Position must be an integer')
        .positive('Position must be positive')
        .min(1, 'Position must be at least 1')
        .max(25, 'Position cannot exceed 25'),
    
    rank: z.number()
        .int('Rank must be an integer')
        .positive('Rank must be positive')
        .min(1, 'Rank must be at least 1')
        .max(25, 'Rank cannot exceed 25'),
    
    totalKills: z.number()
        .int('Total kills must be an integer')
        .min(0, 'Total kills cannot be negative')
        .max(99, 'Total kills cannot exceed 99'),
    
    playerResults: z.array(playerResultSchema)
        .min(1, 'At least one player result is required')
        .max(4, 'Maximum 4 players per team')
        .optional()
});

// Update match result
export const updateQuickMatchResultSchema = z.object({
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters')
        .optional(),
    
    position: z.number()
        .int('Position must be an integer')
        .positive('Position must be positive')
        .min(1, 'Position must be at least 1')
        .max(25, 'Position cannot exceed 25')
        .optional(),
    
    totalKills: z.number()
        .int('Total kills must be an integer')
        .min(0, 'Total kills cannot be negative')
        .max(99, 'Total kills cannot exceed 99')
        .optional(),
    
    playerResults: z.array(playerResultSchema)
        .min(1, 'At least one player result is required')
        .max(4, 'Maximum 4 players per team')
        .optional(),
    
    status: z.enum(['PENDING', 'PROCESSED', 'VERIFIED', 'MANUAL_ENTRY'] as const)
        .optional(),
    
    needsReview: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Result params
export const quickResultParamsSchema = z.object({
    quickMatchId: z.string().uuid('Invalid quick match ID'),
    resultId: z.string().uuid('Invalid result ID').optional()
});

// Process results (trigger AI processing)
export const processResultsSchema = z.object({});

// Font customization schema
const fontSchema = z.object({
    size: z.number().optional(),
    color: z.string().optional(),
    weight: z.string().optional(),
    family: z.string().optional()
});

// Advanced config schemas
const headerConfigSchema = z.object({
    event_name: z.object({
        enabled: z.boolean().optional(),
        text: z.string().optional(),
        font: fontSchema.optional()
    }).optional(),
    sponsor_name: z.object({
        enabled: z.boolean().optional(),
        text: z.string().optional(),
        font: fontSchema.optional()
    }).optional()
}).optional();

const organiserConfigSchema = z.object({
    name: z.object({
        enabled: z.boolean().optional(),
        text: z.string().optional(),
        font: fontSchema.optional()
    }).optional()
}).optional();

const eventDetailsSchema = z.object({
    week_info: z.object({
        enabled: z.boolean().optional(),
        text: z.string().optional()
    }).optional(),
    day_info: z.object({
        enabled: z.boolean().optional(),
        text: z.string().optional()
    }).optional()
}).optional();

const footerSchema = z.object({
    live_indicator: z.object({
        enabled: z.boolean().optional()
    }).optional()
}).optional();

// Export points table with full customization
export const exportPointsTableSchema = z.object({
    format: z.enum(['PNG', 'CSV', 'BOTH'] as const)
        .optional()
        .default('PNG'),

    template: z.string()
        .min(1, 'Template name is required')
        .max(100, 'Template name must be at most 100 characters')
        .regex(/^[\w\-_.]+$/, 'Template name contains invalid characters')
        .optional()
        .default('tmplate_1'),

    formatType: z.string()
        .min(1, 'Format type is required')
        .max(50, 'Format type must be at most 50 characters')
        .optional()
        .default('24_teams'),

    outputFilename: z.string()
        .min(1, 'Output filename is required')
        .max(100, 'Output filename must be at most 100 characters')
        .regex(/^[\w\-_.]+\.png$/, 'Output filename must be a valid PNG filename')
        .optional(),

    // Table styling
    tableFontSize: z.number().nullable().optional(),
    tableHeaderFontSize: z.number().nullable().optional(),
    tableHeaderLabelMode: z.enum(['full', 'abbr', 'initial', 'compact']).nullable().optional(),
    tableHeaderColumnPadding: z.number().nullable().optional(),
    rowHeightAdjust: z.number().nullable().optional(),

    // Logo + layout
    teamLogoSize: z.number().min(8).max(200).nullable().optional(),
    teamLogoSizeAdjust: z.number().min(-80).max(80).nullable().optional(),
    teamLogoGap: z.number().min(0).max(80).nullable().optional(),
    teamShiftRight: z.number().min(0).max(500).nullable().optional(),
    chickenDinnerIconSize: z.number().min(8).max(200).nullable().optional(),
    chickenIconGap: z.number().min(0).max(40).nullable().optional(),

    // Header text overrides
    eventName: z.string()
        .min(1, 'Event name cannot be empty')
        .max(200, 'Event name must be at most 200 characters')
        .optional(),
    organiserName: z.string()
        .min(1, 'Organiser name cannot be empty')
        .max(200, 'Organiser name must be at most 200 characters')
        .optional(),
    sponsorName: z.string()
        .min(1, 'Sponsor name cannot be empty')
        .max(200, 'Sponsor name must be at most 200 characters')
        .optional(),

    // Override objects
    elementOverrides: z.record(z.string(), z.record(z.string(), z.any())).nullable().optional(),
    columnOverrides: z.record(z.string(), z.record(z.string(), z.any())).nullable().optional(),
    fontCustomization: fontCustomizationSchema,
    advancedConfig: z.record(z.string(), z.any()).nullable().optional(),
    showBranding: z.boolean().optional(),
});