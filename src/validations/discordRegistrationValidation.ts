import { z } from 'zod';

// Reuse your existing Discord ID schema pattern
const discordIdSchema = z.string()
    .regex(/^\d{17,19}$/, 'Invalid Discord ID format');

// Server ID parameter (for routes like /servers/:serverId)
export const serverIdParamSchema = z.object({
    serverId: discordIdSchema
});

// Session management schemas
export const createRegistrationSessionSchema = z.object({
    name: z.string()
        .min(1, 'Session name is required')
        .max(100, 'Session name must be at most 100 characters'),
    groupId: z.number()
        .int('Group ID must be an integer')
        .min(1, 'Group ID must be at least 1')
        .max(999, 'Group ID must be at most 999'),
    channelId: discordIdSchema,
    duration: z.number()
        .int('Duration must be an integer')
        .min(1, 'Duration must be at least 1 minute')
        .max(120, 'Duration must be at most 120 minutes')
        .default(30),
    maxSlots: z.number()
        .int('Max slots must be an integer')
        .min(1, 'Max slots must be at least 1')
        .max(25, 'Max slots must be at most 25')
        .default(21)
});

// Queue management schemas
export const joinQueueSchema = z.object({
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters'),
    userDiscord: discordIdSchema
});

// Merit system schemas
export const updateMeritSchema = z.object({
    meritChange: z.number()
        .int('Merit change must be an integer')
        .min(-1000, 'Merit change cannot be less than -1000')
        .max(1000, 'Merit change cannot be more than 1000'),
    action: z.enum(['GOOD_REGISTRATION', 'ATTENDED_MATCH', 'SLOT_WASTE', 'BAN_VIOLATION', 'ADMIN_ADJUSTMENT']),
    reason: z.string()
        .min(1, 'Reason is required')
        .max(500, 'Reason must be at most 500 characters'),
    updatedBy: discordIdSchema
});

// Registration control schemas
export const toggleRegistrationSchema = z.object({
    enabled: z.boolean(),
    reason: z.string()
        .max(200, 'Reason must be at most 200 characters')
        .optional()
});

export const setDelaySchema = z.object({
    delayMinutes: z.number()
        .int('Delay must be an integer')
        .min(0, 'Delay cannot be negative')
        .max(1440, 'Delay cannot be more than 24 hours'),
    reason: z.string()
        .min(1, 'Reason is required')
        .max(500, 'Reason must be at most 500 characters'),
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters')
        .optional() // Optional for server-wide delays
});

// Ban system schemas
export const banTeamSchema = z.object({
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters'),
    punishmentType: z.enum(['TEMPORARY_BAN', 'PERMANENT_BAN', 'SLOT_WASTE_BAN', 'MERIT_REDUCTION', 'WARNING']),
    reason: z.string()
        .min(1, 'Reason is required')
        .max(1000, 'Reason must be at most 1000 characters'),
    duration: z.number()
        .int('Duration must be an integer')
        .min(1, 'Duration must be at least 1 hour')
        .max(8760, 'Duration cannot be more than 1 year')
        .optional(), // Not required for permanent bans
    bannedByName: z.string()
        .min(1, 'Banner name is required')
        .max(100, 'Banner name must be at most 100 characters')
});

// Parameter schemas for routes
export const sessionIdParamSchema = z.object({
    serverId: discordIdSchema,
    sessionId: z.string().cuid('Invalid session ID format')
});

export const teamNameParamSchema = z.object({
    serverId: discordIdSchema,
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters')
});

export const userIdParamSchema = z.object({
    serverId: discordIdSchema,
    userId: discordIdSchema
});

// Query parameter schemas
export const queueStatusQuerySchema = z.object({
    status: z.enum(['QUEUED', 'ASSIGNED', 'WAITING_LIST', 'EXPIRED']).optional(),
    limit: z.string()
        .regex(/^\d+$/, 'Limit must be a positive number')
        .transform(Number)
        .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
        .optional()
});

export const meritRankingsQuerySchema = z.object({
    limit: z.string()
        .regex(/^\d+$/, 'Limit must be a positive number')
        .transform(Number)
        .refine(val => val > 0 && val <= 50, 'Limit must be between 1 and 50')
        .optional(),
    sortBy: z.enum(['currentMerit', 'totalEarned', 'lastUpdated']).optional().default('currentMerit')
});