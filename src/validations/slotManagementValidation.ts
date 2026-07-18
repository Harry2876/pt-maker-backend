import { z } from 'zod';

const slotNumberSchema = z.number()
    .int('Slot number must be an integer')
    .min(1, 'Slot number must be at least 1')
    .max(25, 'Slot number must be at most 25');

const slotTypeSchema = z.enum(['TEAM_SLOT', 'MANAGEMENT_SLOT', 'RESERVED_SLOT'] as const);

export const assignSlotSchema = z.object({
    slotNumber: slotNumberSchema,
    teamRegistrationId: z.string().uuid('Invalid team registration ID format'),
    slotType: slotTypeSchema.optional()
});

export const updateSlotAssignmentSchema = z.object({
    teamRegistrationId: z.string().uuid('Invalid team registration ID format').nullable().optional(),
    isActive: z.boolean().optional(),
    slotType: slotTypeSchema.optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const slotNumberParamsSchema = z.object({
    groupId: z.string().uuid('Invalid group ID format'),
    slotNumber: z.coerce.number().pipe(slotNumberSchema)
});

export const autoAssignSlotsSchema = z.object({
    strategy: z.enum(['RANDOM', 'BALANCED', 'SKILL_BASED', 'MANUAL_ORDER'] as const),
    excludeSlots: z.array(slotNumberSchema).optional(),
    teamPriorities: z.array(z.object({
        teamRegistrationId: z.string().uuid('Invalid team registration ID format'),
        priority: z.number().int(),
        preferredSlots: z.array(slotNumberSchema).optional()
    })).optional()
});

export const swapSlotsSchema = z.object({
    slot1: slotNumberSchema,
    slot2: slotNumberSchema,
    reason: z.string().max(200).optional()
}).refine(data => data.slot1 !== data.slot2, {
    message: 'slot1 and slot2 must be different',
    path: ['slot2']
});
