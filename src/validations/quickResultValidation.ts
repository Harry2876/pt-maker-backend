import { z } from 'zod';

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
export const processResultsSchema = z.object({
    useGeminiFallback: z.boolean()
        .optional()
        .default(true)
});

// Export points table
export const exportPointsTableSchema = z.object({
    format: z.enum(['PNG', 'CSV', 'BOTH'] as const)
        .optional()
        .default('BOTH'),
    
    template: z.string()
        .min(1, 'Template name is required')
        .max(50, 'Template name must be at most 50 characters')
        .optional()
        .default('default')
});