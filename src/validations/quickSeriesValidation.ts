import { z } from 'zod';

export const createQuickSeriesSchema = z.object({
    seriesName: z.string()
        .min(3, 'Series name must be at least 3 characters')
        .max(100, 'Series name must be at most 100 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Series name contains invalid characters'),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters')
        .optional()
        .default('BGMI'),
    
    totalMatches: z.number()
        .int('Total matches must be an integer')
        .min(1, 'Must have at least 1 match')
        .max(20, 'Cannot exceed 20 matches'),
});

export const addMatchToSeriesSchema = z.object({
    quickMatchId: z.string()
        .uuid('Invalid quick match ID format')
});

export const quickSeriesParamsSchema = z.object({
    id: z.string().uuid('Invalid series ID format')
});

export const updateQuickSeriesSchema = z.object({
    seriesName: z.string()
        .min(3, 'Series name must be at least 3 characters')
        .max(100, 'Series name must be at most 100 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Series name contains invalid characters')
        .optional(),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters')
        .optional(),
    
    totalMatches: z.number()
        .int('Total matches must be an integer')
        .min(1, 'Must have at least 1 match')
        .max(20, 'Cannot exceed 20 matches')
        .optional(),

    status: z.enum(['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const)
        .optional(),
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const listQuickSeriesQuerySchema = z.object({
    status: z.enum(['CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const)
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
