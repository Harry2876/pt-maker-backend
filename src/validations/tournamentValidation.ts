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
    
    status: z.enum(['UPCOMING', 'ONGOING', 'COMPLETED'] as const).optional(),

    totalStages: z.number()
        .int('Total stages must be an integer')
        .positive('Total stages must be positive')
        .min(1, 'Total stages must be at least 1')
        .max(10, 'Total stages cannot exceed 10')
        .optional(),

    tournamentFormat: z.enum(['ELIMINATION', 'ROUND_ROBIN', 'MIXED'] as const).optional(),

    maxTeamsPerGroup: z.number()
        .int('Max teams per group must be an integer')
        .positive('Max teams per group must be positive')
        .min(1, 'Max teams per group must be at least 1')
        .max(100, 'Max teams per group cannot exceed 100')
        .optional(),

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