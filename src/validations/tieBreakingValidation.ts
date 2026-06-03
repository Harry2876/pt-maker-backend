import { z } from 'zod';

/**
 * Validation schema for tie-breaking rule.
 * Matches the TieBreakingRule interface exactly so validated data can be used directly.
 */
export const tieBreakingRuleSchema = z.object({
    method: z.enum(['KILLS', 'BEST_POSITION', 'MANUAL_ORDER']),
    priority: z.number().min(1).max(10),
    isActive: z.boolean().default(true),
    description: z.string().optional()
});

/**
 * Validation schema for setting tie-breaking rules
 */
export const setTieBreakingRulesSchema = z.object({
    rules: z.array(tieBreakingRuleSchema).min(1).max(5),
    autoResolveEnabled: z.boolean().default(true)
});

/**
 * Validation schema for resolving conflicts manually
 */
export const resolveConflictsSchema = z.object({
    conflictGroupId: z.string().uuid('Invalid conflict group ID format'),
    userDefinedOrder: z.array(z.string().uuid('Invalid result ID format')).min(2),
    reason: z.string().min(1).max(500).optional()
});

/**
 * Validation schema for conflict detection request
 */
export const detectConflictsSchema = z.object({
    forceRefresh: z.boolean().optional().default(false),
    includeResolved: z.boolean().optional().default(false)
});

/**
 * Validation schema for series tie-breaking rules
 */
export const setSeriesTieBreakingRulesSchema = z.object({
    rules: z.array(tieBreakingRuleSchema).min(1).max(5),
    autoResolveEnabled: z.boolean().default(true),
    applyToAllMatches: z.boolean().optional().default(false)
});

/**
 * Validation schema for match ID parameter
 */
export const matchIdParamSchema = z.object({
    id: z.string().uuid('Invalid match ID format')
});

/**
 * Validation schema for series ID parameter
 */
export const seriesIdParamSchema = z.object({
    id: z.string().uuid('Invalid series ID format')
});

/**
 * Validation schema for conflict group ID parameter
 */
export const conflictGroupIdParamSchema = z.object({
    conflictGroupId: z.string().uuid('Invalid conflict group ID format')
});

/**
 * Helper function to validate tie-breaking rule priority uniqueness
 */
export const validateRulePriorityUniqueness = (rules: z.infer<typeof tieBreakingRuleSchema>[]): boolean => {
    const priorities = rules.map(rule => rule.priority);
    const uniquePriorities = new Set(priorities);
    return priorities.length === uniquePriorities.size;
};

/**
 * Complex validation schema for tie-breaking rules with uniqueness check
 */
export const tieBreakingRulesWithValidationSchema = z.object({
    rules: z.array(tieBreakingRuleSchema).min(1).max(5),
    autoResolveEnabled: z.boolean().default(true)
}).refine((data) => {
    return validateRulePriorityUniqueness(data.rules);
}, {
    message: 'Each rule must have a unique priority value',
    path: ['rules']
});

/**
 * Export validation types for TypeScript inference
 */
export type TieBreakingRuleInput = z.infer<typeof tieBreakingRuleSchema>;
export type SetTieBreakingRulesInput = z.infer<typeof setTieBreakingRulesSchema>;
export type ResolveConflictsInput = z.infer<typeof resolveConflictsSchema>;
export type DetectConflictsInput = z.infer<typeof detectConflictsSchema>;
export type SetSeriesTieBreakingRulesInput = z.infer<typeof setSeriesTieBreakingRulesSchema>;
export type MatchIdParam = z.infer<typeof matchIdParamSchema>;
export type SeriesIdParam = z.infer<typeof seriesIdParamSchema>;
export type ConflictGroupIdParam = z.infer<typeof conflictGroupIdParamSchema>;