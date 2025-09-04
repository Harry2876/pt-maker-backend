import { z } from 'zod';

// Schema for creating match results
export const createMatchResultSchema = z.object({
    screenshotUrl: z.string()
        .url('Screenshot URL must be a valid URL')
        .optional(),

    teamResults: z.array(z.object({
        teamId: z.string()
            .uuid('Invalid team ID format'),
        kills: z.number()
            .int('Kills must be an integer')
            .min(0, 'Kills cannot be negative')
            .max(100, 'Kills cannot exceed 100'),
        placement: z.number()
            .int('Placement must be an integer')
            .min(1, 'Placement cannot be less than 1')
            .max(100, 'Placement cannot exceed 100'),
        damage: z.number()
            .min(0, 'Damage cannot be negative')
            .optional(),
        survivalTime: z.number()
            .min(0, 'Survival time cannot be negative')
            .optional()
    })).min(1, 'At least one team result is required')
        .max(100, 'Cannot exceed 100 team results'),

    notes: z.string()
        .max(1000, 'Notes cannot exceed 1000 characters')
        .optional()
});

// Schema for updating match results
export const updateMatchResultSchema = z.object({
    screenshotUrl: z.string()
        .url('Screenshot URL must be a valid URL')
        .optional(),

    teamResults: z.array(z.object({
        teamId: z.string()
            .uuid('Invalid team ID format'),
        kills: z.number()
            .int('Kills must be an integer')
            .min(0, 'Kills cannot be negative')
            .max(100, 'Kills cannot exceed 100'),
        placement: z.number()
            .int('Placement must be an integer')
            .min(1, 'Placement cannot be less than 1')
            .max(100, 'Placement cannot exceed 100'),
        damage: z.number()
            .min(0, 'Damage cannot be negative')
            .optional(),
        survivalTime: z.number()
            .min(0, 'Survival time cannot be negative')
            .optional()
    })).min(1, 'At least one team result is required')
        .max(100, 'Cannot exceed 100 team results')
        .optional(),

    notes: z.string()
        .max(1000, 'Notes cannot exceed 1000 characters')
        .optional(),

    status: z.enum(['PENDING', 'PROCESSED', 'VERIFIED', 'MANUAL_ENTRY'] as const)
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Schema for verifying results
export const verifyResultsSchema = z.object({
    verificationStatus: z.enum(['PENDING', 'PROCESSED', 'VERIFIED', 'MANUAL_ENTRY'] as const),
    verificationNotes: z.string()
        .max(500, 'Verification notes cannot exceed 500 characters')
        .optional()
});

// Schema for publishing results
export const publishResultsSchema = z.object({
    confirm: z.boolean()
        .refine(val => val === true, {
            message: 'Confirmation is required to publish results'
        })
});

// Schema for calculating scores
export const calculateScoresSchema = z.object({
    scoringRuleId: z.string()
        .uuid('Invalid scoring rule ID format')
        .optional()
});

// Parameter schemas
export const matchResultParamsSchema = z.object({
    matchId: z.string()
        .uuid('Invalid match ID format')
});

export const matchResultIdParamsSchema = z.object({
    matchId: z.string()
        .uuid('Invalid match ID format'),
    resultId: z.string()
        .uuid('Invalid result ID format')
});

// Query schemas
export const getMatchResultsQuerySchema = z.object({
    status: z.enum(['PENDING', 'PROCESSED', 'VERIFIED', 'MANUAL_ENTRY'] as const)
        .optional(),
    page: z.string()
        .regex(/^\d+$/, 'Page must be a positive integer')
        .transform(val => parseInt(val))
        .refine(val => val > 0, 'Page must be greater than 0')
        .optional(),
    limit: z.string()
        .regex(/^\d+$/, 'Limit must be a positive integer')
        .transform(val => parseInt(val))
        .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
        .optional()
});

export const tournamentIdParamsSchema = z.object({
    tournamentId: z.string()
        .uuid('Invalid tournament ID format')
});