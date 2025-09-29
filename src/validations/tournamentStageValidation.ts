import { z } from 'zod';

export const createStageSchema = z.object({
    name: z.string().min(1, 'Stage name is required').max(100, 'Stage name too long'),
    stageNumber: z.number().int().min(1, 'Stage number must be positive').max(10, 'Too many stages'),
    totalGroups: z.number().int().min(1).max(50).optional().default(1),
    qualificationSpots: z.number().int().min(1).max(100).optional().default(8),
    stageFormat: z.enum(['ELIMINATION', 'ROUND_ROBIN']).optional().default('ELIMINATION')
});

export const updateStageSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    totalGroups: z.number().int().min(1).max(50).optional(),
    qualificationSpots: z.number().int().min(1).max(100).optional(),
    stageFormat: z.enum(['ELIMINATION', 'ROUND_ROBIN']).optional(),
    isActive: z.boolean().optional(),
    isCompleted: z.boolean().optional()
});

export const stageParamsSchema = z.object({
    stageId: z.string().uuid('Invalid stage ID format')
});

export const tournamentStageParamsSchema = z.object({
    tournamentId: z.string().uuid('Invalid tournament ID format')
});