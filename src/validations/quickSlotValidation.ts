import { z } from 'zod';

// Single slot assignment
export const createQuickSlotSchema = z.object({
    slotNumber: z.number()
        .int('Slot number must be an integer')
        .positive('Slot number must be positive')
        .min(1, 'Slot number must be at least 1')
        .max(25, 'Slot number cannot exceed 25'),
    
    teamName: z.string()
        .min(1, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters')
        .trim(),
    
    playerNames: z.array(z.string().min(1).max(50))
        .min(1, 'At least one player name is required')
        .max(4, 'Maximum 4 players per team')
        .optional()
});

// Bulk slot upload
export const bulkSlotUploadSchema = z.object({
    slots: z.array(createQuickSlotSchema)
        .min(1, 'At least one slot is required')
        .max(25, 'Maximum 25 slots allowed')
        .refine(
            (slots) => {
                const slotNumbers = slots.map(s => s.slotNumber);
                return new Set(slotNumbers).size === slotNumbers.length;
            },
            { message: 'Duplicate slot numbers are not allowed' }
        )
});

// Text-based slot upload (user pastes "Slot 1 - Team Name" format)
export const textSlotUploadSchema = z.object({
    slotsText: z.string()
        .min(3, 'Slots text is too short')
        .max(5000, 'Slots text is too long')
});

// Update slot
export const updateQuickSlotSchema = z.object({
    teamName: z.string()
        .min(1, 'Team name must be at least 1 character')
        .max(50, 'Team name must be at most 50 characters')
        .optional(),
    
    playerNames: z.array(z.string().min(1).max(50))
        .min(1, 'At least one player name is required')
        .max(4, 'Maximum 4 players per team')
        .optional(),
    
    status: z.enum(['PENDING', 'DETECTED', 'MATCHED', 'NOT_FOUND'] as const)
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Slot params
export const quickSlotParamsSchema = z.object({
    quickMatchId: z.string().uuid('Invalid quick match ID'),
    slotId: z.string().uuid('Invalid slot ID').optional()
});