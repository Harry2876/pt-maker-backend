import { z } from 'zod';

const ruleTypeSchema = z.enum(['KILL_POINTS', 'POSITION_POINTS', 'SURVIVAL_TIME', 'CUSTOM_FORMULA']);

export const createScoringRuleSchema = z.object({
    ruleName: z.string()
        .min(1, 'Rule name is required')
        .max(100, 'Rule name must be at most 100 characters'),
    ruleType: ruleTypeSchema,
    killPoints: z.number()
        .int('Kill points must be an integer')
        .min(0, 'Kill points cannot be negative'),
    positionMultiplier: z.number()
        .min(0, 'Position multiplier cannot be negative'),
    customFormula: z.string()
        .max(1000, 'Custom formula must be at most 1000 characters')
        .optional(),
    description: z.string()
        .max(500, 'Description must be at most 500 characters')
        .optional(),
    priority: z.number()
        .int('Priority must be an integer')
        .min(1, 'Priority must be at least 1')
        .max(100, 'Priority cannot exceed 100')
        .optional()
});

export const updateScoringRuleSchema = z.object({
    ruleName: z.string().min(1).max(100).optional(),
    ruleType: ruleTypeSchema.optional(),
    killPoints: z.number().int().min(0).optional(),
    positionMultiplier: z.number().min(0).optional(),
    customFormula: z.string().max(1000).optional(),
    description: z.string().max(500).optional(),
    priority: z.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const tournamentScoringRuleParamsSchema = z.object({
    tournamentId: z.string().uuid('Invalid tournament ID format')
});

export const scoringRuleParamsSchema = z.object({
    ruleId: z.string().uuid('Invalid scoring rule ID format')
});

export const calculateScoreSchema = z.object({
    kills: z.number()
        .int('Kills must be an integer')
        .min(0, 'Kills cannot be negative')
        .max(100, 'Kills cannot exceed 100'),
    position: z.number()
        .int('Position must be an integer')
        .min(1, 'Position must be at least 1')
        .max(100, 'Position cannot exceed 100'),
    survivalTime: z.number()
        .min(0, 'Survival time cannot be negative')
        .optional(),
    damage: z.number()
        .min(0, 'Damage cannot be negative')
        .optional()
});

export const applyTemplateSchema = z.object({
    templateId: z.string()
        .min(1, 'Template ID is required')
        .max(100, 'Template ID must be at most 100 characters')
});

export const bulkCreateScoringRulesSchema = z.object({
    rules: z.array(createScoringRuleSchema)
        .min(1, 'At least one rule is required')
        .max(20, 'Cannot create more than 20 rules at once'),
    replaceExisting: z.boolean().optional()
});

export const validateScoringRuleSchema = z.object({
    ruleName: z.string().min(1).max(100).optional(),
    ruleType: ruleTypeSchema.optional(),
    killPoints: z.number().int().min(0).optional(),
    positionMultiplier: z.number().min(0).optional(),
    customFormula: z.string().max(1000).optional(),
    description: z.string().max(500).optional(),
    priority: z.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for validation'
});
