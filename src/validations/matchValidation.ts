import { z } from 'zod';

export const createMatchSchema = z.object({
    matchNumber: z.number()
        .int('Match number must be an integer')
        .positive('Match number must be positive')
        .min(1, 'Match number must be at least 1')
        .max(100, 'Match number cannot exceed 100'),
    
    matchDate: z.string()
        .datetime('Invalid date format')
        .optional()
        .or(z.date().optional()),
    
    groupId: z.string()
        .uuid('Invalid group ID format')
        .optional()
});

export const updateMatchSchema = z.object({
    matchNumber: z.number()
        .int('Match number must be an integer')
        .positive('Match number must be positive')
        .min(1, 'Match number must be at least 1')
        .max(100, 'Match number cannot exceed 100')
        .optional(),
    
    matchDate: z.string()
        .datetime('Invalid date format')
        .optional()
        .or(z.date().optional()),
    
    status: z.enum(['PENDING_PROCESSING', 'PROCESSED', 'ERROR'] as const).optional(),

    processedData: z.any().optional(),
    
    groupId: z.string()
        .uuid('Invalid group ID format')
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const matchParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid match ID format')
});

export const tournamentParamsSchema = z.object({
    tournamentId: z.string()
        .uuid('Invalid tournament ID format')
});

// For nested routes like /tournaments/:tournamentId/matches
export const tournamentMatchParamsSchema = z.object({
    tournamentId: z.string()
        .uuid('Invalid tournament ID format'),
    id: z.string()
        .uuid('Invalid match ID format')
        .optional()
});