import { z } from 'zod';

// Discord guild ID validation (reuse the pattern)
const discordIdSchema = z.string()
    .regex(/^\d{17,19}$/, 'Invalid Discord ID format');

// Team player validation
const teamPlayerSchema = z.object({
    discordId: discordIdSchema,
    ign: z.string()
        .min(3, 'IGN must be at least 3 characters')
        .max(16, 'IGN must be at most 16 characters'),
    role: z.enum(['player', 'substitute']).optional().default('player')
});

// Guild and team name parameters
export const guildTeamParamsSchema = z.object({
    guildId: discordIdSchema,
    teamName: z.string()
        .min(1, 'Team name is required')
        .max(50, 'Team name must be at most 50 characters')
});

// Guild parameter only
export const guildIdParamSchema = z.object({
    guildId: discordIdSchema
});

// Leader Discord parameter
export const leaderParamsSchema = z.object({
    guildId: discordIdSchema,
    leaderDiscord: discordIdSchema
});

// Rate limit parameters
export const rateLimitParamsSchema = z.object({
    guildId: discordIdSchema,
    userId: discordIdSchema,
    action: z.enum(['enrollment', 'leadership_management'])
});

// Create team enrollment schema
export const createTeamEnrollmentSchema = z.object({
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters'),
    
    leaderId: discordIdSchema,
    
    leaderIgn: z.string()
        .min(3, 'Leader IGN must be at least 3 characters')
        .max(16, 'Leader IGN must be at most 16 characters'),
    
    leaderDiscord: discordIdSchema,
    
    players: z.array(teamPlayerSchema)
        .min(1, 'At least one player is required')
        .max(10, 'Maximum 10 players allowed'),
    
    threadId: discordIdSchema.optional(),
    
    enrolledBy: discordIdSchema.optional()
});

// Update team enrollment schema
export const updateTeamEnrollmentSchema = z.object({
    teamName: z.string()
        .min(3, 'Team name must be at least 3 characters')
        .max(50, 'Team name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters')
        .optional(),
    
    leaderIgn: z.string()
        .min(3, 'Leader IGN must be at least 3 characters')
        .max(16, 'Leader IGN must be at most 16 characters')
        .optional(),
    
    players: z.array(teamPlayerSchema)
        .min(1, 'At least one player is required')
        .max(10, 'Maximum 10 players allowed')
        .optional(),
    
    isVerified: z.boolean().optional(),
    
    isComplete: z.boolean().optional(),
    
    enrollmentStep: z.number()
        .int('Enrollment step must be an integer')
        .min(1, 'Enrollment step must be at least 1')
        .max(5, 'Enrollment step must be at most 5')
        .optional(),
    
    threadId: discordIdSchema.optional(),
    
    verifiedAt: z.string().datetime().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

// Rate limit management schema
export const setRateLimitSchema = z.object({
    cooldownMinutes: z.number()
        .int('Cooldown must be an integer')
        .min(1, 'Cooldown must be at least 1 minute')
        .max(1440, 'Cooldown cannot exceed 24 hours (1440 minutes)'),
    
    isAdmin: z.boolean().optional().default(false)
});

// Team activity log schema
export const teamActivityLogSchema = z.object({
    teamId: z.string().min(1, 'Team ID is required'),
    
    guildId: discordIdSchema,
    
    action: z.enum([
        'ENROLLMENT_CREATED',
        'ENROLLMENT_UPDATED', 
        'ENROLLMENT_VERIFIED',
        'ENROLLMENT_COMPLETED',
        'TEAM_NAME_CHANGED',
        'PLAYER_ADDED',
        'PLAYER_REMOVED',
        'LEADER_CHANGED'
    ]),
    
    performedBy: discordIdSchema,
    
    previousData: z.record(z.string(), z.any()).optional(),
    
    newData: z.record(z.string(), z.any()).optional()
});

// Query schemas for filtering
export const teamQuerySchema = z.object({
    verified: z.string()
        .transform(val => val === 'true')
        .optional(),
    
    completed: z.string()
        .transform(val => val === 'true')
        .optional(),
    
    step: z.string()
        .regex(/^[1-5]$/, 'Step must be between 1 and 5')
        .transform(val => parseInt(val))
        .optional()
});

// Get team name change history schema
export const getTeamNameHistoryParamsSchema = z.object({
    guildId: z.string().min(1, 'Guild ID is required'),
    teamName: z.string().min(1, 'Team name is required')
});

// Get user teams schema
export const getUserTeamsParamsSchema = z.object({
    guildId: z.string().min(1, 'Guild ID is required'),
    discordTag: z.string().min(1, 'Discord tag is required')
});

// Transfer leadership schema
export const transferLeadershipSchema = z.object({
    newLeaderDiscordTag: z.string().min(3, 'New leader Discord tag required'),
    newLeaderIgn: z.string().min(3, 'New leader IGN required').max(16, 'IGN must be less than 16 characters'),
    currentLeaderDiscordTag: z.string().optional(),
    transferredBy: z.string().optional()
});

// Update team players schema
export const updatePlayersSchema = z.object({
    players: z.array(z.object({
        ign: z.string().min(1),
        discordTag: z.string().min(1),
        discordId: z.string().optional(),
        role: z.string().optional()
    })).min(1, 'At least one player required')
});

// Change team name schema
export const changeTeamNameSchema = z.object({
    newTeamName: z.string().min(3, 'Team name must be at least 3 characters').max(50, 'Team name must be less than 50 characters'),
    changedBy: z.string().min(1, 'Changed by field required')
});