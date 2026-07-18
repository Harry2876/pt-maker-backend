import { z } from 'zod';

export const createPlayerSchema = z.object({
    name: z.string()
        .min(2, 'Player name must be at least 2 characters')
        .max(100, 'Player name must be at most 100 characters'),
    gameUuid: z.string().max(100).optional(),
    email: z.string().email('Invalid email format').optional(),
    phoneNumber: z.string().min(5).max(20).optional()
});

export const updatePlayerSchema = z.object({
    name: z.string().min(2).max(100).optional(),
    gameUuid: z.string().max(100).optional(),
    email: z.string().email().optional(),
    phoneNumber: z.string().min(5).max(20).optional(),
    totalMatches: z.number().int().min(0).optional(),
    totalKills: z.number().int().min(0).optional(),
    totalPoints: z.number().int().min(0).optional(),
    bestPosition: z.number().int().positive().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const playerParamsSchema = z.object({
    id: z.string().uuid('Invalid player ID format')
});

export const playerStatsQuerySchema = z.object({
    tournamentId: z.string().uuid('Invalid tournament ID format')
});
