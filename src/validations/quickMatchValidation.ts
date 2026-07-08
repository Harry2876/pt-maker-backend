import { z } from 'zod';

// Create Quick Match
export const createQuickMatchSchema = z.object({
    matchName: z.string()
        .min(3, 'Match name must be at least 3 characters')
        .max(100, 'Match name must be at most 100 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Match name contains invalid characters'),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters')
        .optional()
        .default('BGMI'),
    
    map: z.string()
        .min(2, 'Map name must be at least 2 characters')
        .max(50, 'Map name must be at most 50 characters')
        .optional(),
    
    // Scoring Configuration
    positionPointsConfig: z.array(z.number().int().min(0).max(100))
        .length(10, 'Position points must have exactly 10 values (for ranks 1-10)')
        .optional(),
    
    killPointsValue: z.number()
        .int('Kill points must be an integer')
        .min(0, 'Kill points cannot be negative')
        .max(10, 'Kill points cannot exceed 10')
        .optional()
        .default(1),
    
    scoringDescription: z.string()
        .max(100, 'Scoring description must be at most 100 characters')
        .optional()
});

// Update Quick Match
export const updateQuickMatchSchema = z.object({
    matchName: z.string()
        .min(3, 'Match name must be at least 3 characters')
        .max(100, 'Match name must be at most 100 characters')
        .optional(),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters')
        .optional(),
    
    map: z.string()
        .min(2, 'Map name must be at least 2 characters')
        .max(50, 'Map name must be at most 50 characters')
        .optional(),
    
    status: z.enum([
        'ACTIVE',
        'COMPLETED',
        'ERROR'
    ] as const).optional(),
    
    // Scoring Configuration
    positionPointsConfig: z.array(z.number().int().min(0).max(100))
        .length(10, 'Position points must have exactly 10 values')
        .optional(),
    
    killPointsValue: z.number()
        .int('Kill points must be an integer')
        .min(0, 'Kill points cannot be negative')
        .max(10, 'Kill points cannot exceed 10')
        .optional(),
    
    scoringDescription: z.string()
        .max(100, 'Scoring description must be at most 100 characters')
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Quick Match Params (for routes like /api/v1/quick-pt/:id)
export const quickMatchParamsSchema = z.object({
    id: z.string()
        .cuid('Invalid quick match ID format')
});

// Query params for listing matches
export const listQuickMatchesQuerySchema = z.object({
    status: z.enum([
        'ACTIVE',
        'COMPLETED',
        'ERROR'
    ] as const).optional(),
    
    page: z.string()
        .transform(Number)
        .pipe(z.number().int().positive().min(1))
        .optional()
        .default(1),
    
    limit: z.string()
        .transform(Number)
        .pipe(z.number().int().positive().min(1).max(100))
        .optional()
        .default(10)
});