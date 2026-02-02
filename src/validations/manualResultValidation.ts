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

// Create manual result schema
export const createManualResultSchema = z.object({
    slotNumber: z.number()
        .int('Slot number must be an integer')
        .min(1, 'Slot number must be at least 1')
        .max(25, 'Slot number cannot exceed 25'),
    
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters'),
    
    position: z.number()
        .int('Position must be an integer')
        .min(1, 'Position must be at least 1')
        .max(25, 'Position cannot exceed 25'),
    
    totalKills: z.number()
        .int('Total kills must be an integer')
        .min(0, 'Total kills cannot be negative')
        .max(99, 'Total kills cannot exceed 99'),
    
    playerResults: z.array(playerResultSchema)
        .min(1, 'At least one player result required')
        .max(4, 'Maximum 4 players per team')
        .optional(),
    
    entryNotes: z.string()
        .max(500, 'Notes must be at most 500 characters')
        .optional()
});

// Update manual result schema  
export const updateManualResultSchema = z.object({
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters')
        .optional(),
    
    position: z.number()
        .int('Position must be an integer')
        .min(1, 'Position must be at least 1')
        .max(25, 'Position cannot exceed 25')
        .optional(),
    
    totalKills: z.number()
        .int('Total kills must be an integer')
        .min(0, 'Total kills cannot be negative')
        .max(99, 'Total kills cannot exceed 99')
        .optional(),
    
    playerResults: z.array(playerResultSchema)
        .min(1, 'At least one player result required')
        .max(4, 'Maximum 4 players per team')
        .optional(),
    
    entryNotes: z.string()
        .max(500, 'Notes must be at most 500 characters')
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Route params validation
export const manualResultParamsSchema = z.object({
    id: z.string().uuid('Invalid match ID'),
    quickMatchId: z.string().uuid('Invalid match ID').optional(),
    resultId: z.string().uuid('Invalid result ID').optional()
});

// Bulk operations validation schemas
export const bulkCreateManualResultsSchema = z.object({
    results: z.array(createManualResultSchema)
        .min(1, 'At least one result is required')
        .max(25, 'Maximum 25 results allowed per bulk operation'),
    
    replaceExisting: z.boolean()
        .default(false)
        .describe('Replace all existing results for this match'),
    
    validateConstraints: z.boolean()
        .default(true)
        .describe('Validate position/slot conflicts before creation')
});

export const bulkUpdateManualResultsSchema = z.object({
    updates: z.array(z.object({
        resultId: z.string().uuid('Invalid result ID'),
        data: updateManualResultSchema
    }))
    .min(1, 'At least one update is required')
    .max(25, 'Maximum 25 updates allowed per bulk operation')
});

export const bulkDeleteManualResultsSchema = z.object({
    resultIds: z.array(z.string().uuid('Invalid result ID'))
        .min(1, 'At least one result ID is required')
        .max(25, 'Maximum 25 deletions allowed per bulk operation')
});