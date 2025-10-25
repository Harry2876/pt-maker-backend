import { z } from 'zod';

// Discord guild ID validation (Discord IDs are 17-19 digit snowflakes)
const discordIdSchema = z.string()
    .regex(/^\d{17,19}$/, 'Invalid Discord ID format');

// Discord OAuth code validation
export const discordOAuthSchema = z.object({
    code: z.string()
        .min(1, 'Discord authorization code is required')
        .max(1000, 'Invalid authorization code length'),
    state: z.string().optional()
});

// Guild ID parameter validation
export const guildIdParamSchema = z.object({
    guildId: discordIdSchema
});

// Guild authorization request
export const guildAuthSchema = z.object({
    guildId: discordIdSchema,
    userId: discordIdSchema.optional(),
    permissions: z.array(z.string()).optional()
});

// Discord user linking schema
export const linkDiscordUserSchema = z.object({
    discordUserId: discordIdSchema,
    phoneNumber: z.string()
        .min(10, 'Phone number must be at least 10 digits')
        .max(15, 'Phone number must be at most 15 digits')
});

// Guild premium update schema
export const updateGuildPremiumSchema = z.object({
    guildId: discordIdSchema,
    isPremium: z.boolean(),
    premiumUntil: z.string().datetime().optional()
});

// Guild settings update schema
export const updateGuildSettingsSchema = z.object({
    guildId: discordIdSchema,
    commandPrefix: z.string()
        .min(1, 'Command prefix cannot be empty')
        .max(5, 'Command prefix must be at most 5 characters')
        .optional(),
    botEnabled: z.boolean().optional()
});

// Discord OAuth callback via GET (query parameters)
export const discordOAuthGetCallbackSchema = z.object({
    code: z.string().min(1, 'Discord authorization code is required'),
    state: z.string().optional(),
    guild_id: z.string().regex(/^\d{17,19}$/, 'Invalid Discord guild ID format').optional(),
    permissions: z.string().optional()
});

// Guild member ID parameter schema
export const memberIdParamSchema = z.object({
    memberId: z.string().min(1, 'Member ID is required')
});

// Guild and member ID parameters schema
export const guildMemberParamsSchema = z.object({
    guildId: discordIdSchema,
    memberId: z.string().min(1, 'Member ID is required')
});

// Create guild member schema
export const createGuildMemberSchema = z.object({
    userId: discordIdSchema,
    nickname: z.string().max(32, 'Nickname must be at most 32 characters').optional(),
    roles: z.array(discordIdSchema).optional(),
    joinedAt: z.string().datetime().optional()
});

// Update guild member schema  
export const updateGuildMemberSchema = z.object({
    nickname: z.string().max(32, 'Nickname must be at most 32 characters').optional(),
    roles: z.array(discordIdSchema).optional(),
    isAdmin: z.boolean().optional(),
    canManageTournaments: z.boolean().optional()
});

// Bot state validation schemas
export const botStateParamsSchema = z.object({
    guildId: discordIdSchema
});

export const botStateHistoryQuerySchema = z.object({
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional()
});

export const bulkBotStateSchema = z.object({
    guildIds: z.array(discordIdSchema).min(1, 'At least one guild ID is required').max(50, 'Maximum 50 guild IDs allowed')
});

export const botStateFilterSchema = z.object({
    state: z.enum(['ACTIVE', 'REMOVED', 'REINSTALLED', 'PERMISSION_CHANGED', 'SUSPENDED', 'MAINTENANCE']).optional()
});

// Bulk create guild members schema
export const bulkCreateMembersSchema = z.object({
    members: z.array(
        z.object({
            userId: discordIdSchema,
            nickname: z.string().max(32, 'Nickname must be at most 32 characters').optional(),
            roles: z.array(discordIdSchema).optional(),
            joinedAt: z.string().datetime().optional()
        })
    ).min(1, 'At least one member is required').max(500, 'Maximum 500 members allowed per bulk sync')
});