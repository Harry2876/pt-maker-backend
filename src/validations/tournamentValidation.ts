import { z } from 'zod';


export const createTournamentSchema = z.object({
    name: z.string()
        .min(3, 'Tournament name must be at least 3 characters')
        .max(100, 'Tournament name must be at most 100 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Tournament name contains invalid characters'),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters'),
    
    tournamentType: z.enum([ 'TOURNAMENT'] as const).optional(),
    
    maxTeams: z.number()
        .int('Max teams must be an integer')
        .positive('Max teams must be positive')
        .min(1, 'Max teams must be at least 1')
        .max(1000, 'Max teams cannot exceed 1000')
        .optional(),
    
    entryFee: z.number()
        .positive('Entry fee must be positive')
        .optional(),
    
    prizePool: z.number()
        .positive('Prize pool must be positive')
        .optional(),
    
    status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED'] as const).optional()
});

export const updateTournamentSchema = z.object({
    name: z.string()
        .min(3, 'Tournament name must be at least 3 characters')
        .max(100, 'Tournament name must be at most 100 characters')
        .optional(),
    
    game: z.string()
        .min(2, 'Game name must be at least 2 characters')
        .max(50, 'Game name must be at most 50 characters')
        .optional(),
    
    status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED'] as const).optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const tournamentParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid tournament ID format')
});