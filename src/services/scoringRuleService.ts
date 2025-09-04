import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import {
    ScoringRuleCache,
    CreateScoringRuleData,
    UpdateScoringRuleData,
    ScoringRuleTemplate,
    POPULAR_SCORING_TEMPLATES,
    ScoringRuleValidation,
    ScoreCalculationInput,
    ScoreCalculationResult,
    BulkScoringRuleData,
    BulkScoringRuleResult,
    ScoreBreakdown
} from '../types/scoringRule';

export class ScoringRuleService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes for scoring rules

    // Create scoring rule with hybrid sync
    async createScoringRule(data: CreateScoringRuleData, createdBy: string) {
        try {
            // 1. Validate tournament exists
            const tournament = await redis.hgetObject(`tournament:${data.tournamentId}`);
            if (!tournament) {
                throw new Error('Tournament not found');
            }

            // 2. Validate rule data
            const validation = await this.validateScoringRule(data);
            if (!validation.isValid) {
                throw new Error(`Invalid scoring rule: ${validation.errors.map(e => e.message).join(', ')}`);
            }

            // 3. Check for duplicate priority within tournament
            const existingRules = await this.getTournamentScoringRules(data.tournamentId);
            const duplicatePriority = existingRules.find(rule => 
                rule.priority === (data.priority || 1) && rule.isActive
            );
            if (duplicatePriority) {
                throw new Error(`Priority ${data.priority || 1} already exists for this tournament`);
            }

            // 4. Generate scoring rule ID
            const ruleId = randomUUID();

            // 5. Create scoring rule object
            const scoringRule: ScoringRuleCache = {
                id: ruleId,
                tournamentId: data.tournamentId,
                ruleName: data.ruleName,
                ruleType: data.ruleType,
                isActive: true,
                priority: data.priority || 1,
                killPoints: data.killPoints,
                positionMultiplier: data.positionMultiplier,
                customFormula: data.customFormula,
                description: data.description,
                createdBy,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 6. Store in Redis immediately
            await redis.hsetObject(`scoringRule:${ruleId}`, scoringRule);
            await redis.sadd(`tournament:${data.tournamentId}:scoringRules`, ruleId);

            // 7. Queue database sync
            await QueueService.syncImmediately('SCORING_RULE', ruleId, scoringRule, createdBy);

            this.logger.info(`Scoring rule ${ruleId} created for tournament ${data.tournamentId}`);
            return scoringRule;

        } catch (error) {
            this.handleError(error, 'Create scoring rule');
            return null;
        }
    }

    // Get scoring rule by ID
    async getScoringRule(ruleId: string): Promise<ScoringRuleCache | null> {
        try {
            // Check cache first
            const cached = await redis.hgetObject<ScoringRuleCache>(`scoringRule:${ruleId}`);
            if (cached) {
                return cached;
            }

            // Fallback to database
            const dbRule = await this.db.scoringRule.findUnique({
                where: { id: ruleId }
            });

            if (!dbRule) return null;

            const scoringRule: ScoringRuleCache = {
                id: dbRule.id,
                tournamentId: dbRule.tournamentId,
                ruleName: dbRule.ruleName,
                ruleType:dbRule.ruleType as 'KILL_POINTS' | 'POSITION_POINTS' | 'SURVIVAL_TIME' | 'CUSTOM_FORMULA',
                isActive: true,
                priority: 1,
                killPoints: dbRule.killPoints,
                positionMultiplier: Array.isArray(dbRule.positionMultiplier) ? 1 : 1,
                customFormula: undefined,
                description: undefined,
                createdBy: 'system', // Default value
                createdAt: dbRule.createdAt.toISOString(),
                updatedAt: dbRule.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache for future requests
            await redis.hsetObject(`scoringRule:${ruleId}`, scoringRule);

            return scoringRule;

        } catch (error) {
            this.handleError(error, 'Get scoring rule');
            return null;
        }
    }

    // Update scoring rule
    async updateScoringRule(ruleId: string, data: UpdateScoringRuleData, updatedBy: string) {
        try {
            const existing = await this.getScoringRule(ruleId);
            if (!existing) {
                throw new Error('Scoring rule not found');
            }

            // Validate update data
            if (data.killPoints !== undefined || data.positionMultiplier !== undefined || data.customFormula !== undefined) {
                const validation = await this.validateScoringRule({
                    ...existing,
                    ...data
                } as CreateScoringRuleData);
                
                if (!validation.isValid) {
                    throw new Error(`Invalid scoring rule update: ${validation.errors.map(e => e.message).join(', ')}`);
                }
            }

            // Check priority conflicts if priority is being updated
            if (data.priority && data.priority !== existing.priority) {
                const existingRules = await this.getTournamentScoringRules(existing.tournamentId);
                const duplicatePriority = existingRules.find(rule => 
                    rule.priority === data.priority && rule.isActive && rule.id !== ruleId
                );
                if (duplicatePriority) {
                    throw new Error(`Priority ${data.priority} already exists for this tournament`);
                }
            }

            const updated: ScoringRuleCache = {
                ...existing,
                ruleName: data.ruleName || existing.ruleName,
                ruleType: data.ruleType || existing.ruleType,
                killPoints: data.killPoints !== undefined ? data.killPoints : existing.killPoints,
                positionMultiplier: data.positionMultiplier !== undefined ? data.positionMultiplier : existing.positionMultiplier,
                customFormula: data.customFormula !== undefined ? data.customFormula : existing.customFormula,
                description: data.description !== undefined ? data.description : existing.description,
                priority: data.priority !== undefined ? data.priority : existing.priority,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`scoringRule:${ruleId}`, updated);

            // Queue database sync
            await QueueService.syncImmediately('SCORING_RULE', ruleId, updated, updatedBy);

            this.logger.info(`Scoring rule ${ruleId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update scoring rule');
            return null;
        }
    }

    // Delete scoring rule
    async deleteScoringRule(ruleId: string, deletedBy: string) {
        try {
            const scoringRule = await this.getScoringRule(ruleId);
            if (!scoringRule) {
                throw new Error('Scoring rule not found');
            }

            // Remove from Redis
            await redis.delete(`scoringRule:${ruleId}`);
            await redis.srem(`tournament:${scoringRule.tournamentId}:scoringRules`, ruleId);

            // Queue database deletion
            await QueueService.syncImmediately('DELETE_SCORING_RULE', ruleId, { id: ruleId }, deletedBy);

            this.logger.info(`Scoring rule ${ruleId} deleted`);
            return true;

        } catch (error) {
            this.handleError(error, 'Delete scoring rule');
            return false;
        }
    }

    // Get all scoring rules for a tournament
    async getTournamentScoringRules(tournamentId: string): Promise<ScoringRuleCache[]> {
        try {
            const cacheKey = `tournament:${tournamentId}:scoringRules:list`;
            
            // Check cache first
            const cached = await redis.getObject<ScoringRuleCache[]>(cacheKey);
            if (cached) {
                return cached;
            }

            // Get rule IDs from set
            const ruleIds = await redis.smembers(`tournament:${tournamentId}:scoringRules`);
            
            if (ruleIds.length === 0) {
                // Fallback to database
                const dbRules = await this.db.scoringRule.findMany({
                    where: { tournamentId },
                    orderBy: { createdAt: 'asc' }
                });

                const rules: ScoringRuleCache[] = dbRules.map(dbRule => ({
                    id: dbRule.id,
                    tournamentId: dbRule.tournamentId,
                    ruleName: `${dbRule.killPoints > 0 ? 'Kill' : 'Position'} Points Rule`,
                    ruleType: dbRule.killPoints > 0 ? 'KILL_POINTS' : 'POSITION_POINTS',
                    isActive: true,
                    priority: 1,
                    killPoints: dbRule.killPoints,
                    positionMultiplier: 1,
                    customFormula: undefined,
                    description: undefined,
                    createdBy: 'system',
                    createdAt: dbRule.createdAt.toISOString(),
                    updatedAt: dbRule.updatedAt.toISOString(),
                    dbStatus: 'SYNCED'
                }));

                // Cache the result
                await redis.setObject(cacheKey, rules, this.CACHE_TTL);
                return rules;
            }

            // Get rule details from Redis
            const rules: ScoringRuleCache[] = [];
            for (const ruleId of ruleIds) {
                const rule = await redis.hgetObject<ScoringRuleCache>(`scoringRule:${ruleId}`);
                if (rule) {
                    rules.push(rule);
                }
            }

            // Sort by priority
            rules.sort((a, b) => b.priority - a.priority);

            // Cache the result
            await redis.setObject(cacheKey, rules, this.CACHE_TTL);

            return rules;

        } catch (error) {
            this.handleError(error, 'Get tournament scoring rules');
            return [];
        }
    }

    // Calculate score using tournament's scoring rules
    async calculateScore(tournamentId: string, input: ScoreCalculationInput): Promise<ScoreCalculationResult> {
        try {
            const rules = await this.getTournamentScoringRules(tournamentId);
            
            if (rules.length === 0) {
                // Default BGMI scoring if no rules defined
                const killPoints = input.kills * 1; // 1 point per kill
                const positionPoints = Math.max(0, 26 - input.position) * 2; // 2x position multiplier
                
                return {
                    totalScore: killPoints + positionPoints,
                    killPoints,
                    positionPoints,
                    breakdown: [
                        {
                            ruleName: 'Default Kill Points',
                            ruleType: 'KILL_POINTS',
                            points: killPoints,
                            calculation: `${input.kills} kills × 1 = ${killPoints}`
                        },
                        {
                            ruleName: 'Default Position Points',
                            ruleType: 'POSITION_POINTS',
                            points: positionPoints,
                            calculation: `(26 - ${input.position}) × 2 = ${positionPoints}`
                        }
                    ]
                };
            }

            let totalScore = 0;
            let killPoints = 0;
            let positionPoints = 0;
            let survivalPoints = 0;
            let customPoints = 0;
            const breakdown: ScoreBreakdown[] = [];

            // Apply rules in priority order (highest first)
            const activeRules = rules.filter(rule => rule.isActive);
            
            for (const rule of activeRules) {
                let rulePoints = 0;
                let calculation = '';

                switch (rule.ruleType) {
                    case 'KILL_POINTS':
                        rulePoints = input.kills * rule.killPoints;
                        killPoints += rulePoints;
                        calculation = `${input.kills} kills × ${rule.killPoints} = ${rulePoints}`;
                        break;

                    case 'POSITION_POINTS':
                        const basePositionPoints = Math.max(0, 26 - input.position);
                        rulePoints = basePositionPoints * rule.positionMultiplier;
                        positionPoints += rulePoints;
                        calculation = `(26 - ${input.position}) × ${rule.positionMultiplier} = ${rulePoints}`;
                        break;

                    case 'SURVIVAL_TIME':
                        if (input.survivalTime) {
                            // Award points based on survival time (1 point per minute survived)
                            const survivalMinutes = Math.floor(input.survivalTime / 60);
                            rulePoints = survivalMinutes * rule.positionMultiplier;
                            survivalPoints += rulePoints;
                            calculation = `${survivalMinutes} minutes × ${rule.positionMultiplier} = ${rulePoints}`;
                        }
                        break;

                    case 'CUSTOM_FORMULA':
                        if (rule.customFormula) {
                            try {
                                // Safely evaluate custom formula
                                rulePoints = this.evaluateCustomFormula(rule.customFormula, input);
                                customPoints += rulePoints;
                                calculation = `Custom formula result = ${rulePoints}`;
                            } catch (error) {
                                this.logger.warn(`Failed to evaluate custom formula for rule ${rule.id}:`, error);
                                rulePoints = 0;
                                calculation = 'Custom formula error = 0';
                            }
                        }
                        break;
                }

                totalScore += rulePoints;

                breakdown.push({
                    ruleName: rule.ruleName,
                    ruleType: rule.ruleType,
                    points: rulePoints,
                    calculation
                });
            }

            return {
                totalScore,
                killPoints,
                positionPoints,
                survivalPoints,
                customPoints,
                breakdown
            };

        } catch (error) {
            this.handleError(error, 'Calculate score');
            
            // Return default calculation on error
            const defaultKillPoints = input.kills * 1;
            const defaultPositionPoints = Math.max(0, 26 - input.position) * 2;
            
            return {
                totalScore: defaultKillPoints + defaultPositionPoints,
                killPoints: defaultKillPoints,
                positionPoints: defaultPositionPoints,
                breakdown: [
                    {
                        ruleName: 'Fallback Kill Points',
                        ruleType: 'KILL_POINTS',
                        points: defaultKillPoints,
                        calculation: `${input.kills} kills × 1 = ${defaultKillPoints}`
                    },
                    {
                        ruleName: 'Fallback Position Points',
                        ruleType: 'POSITION_POINTS',
                        points: defaultPositionPoints,
                        calculation: `(26 - ${input.position}) × 2 = ${defaultPositionPoints}`
                    }
                ]
            };
        }
    }

    // Apply popular scoring template
    async applyTemplate(tournamentId: string, templateId: string, createdBy: string): Promise<ScoringRuleCache | null> {
        try {
            const template = POPULAR_SCORING_TEMPLATES.find(t => t.id === templateId);
            if (!template) {
                throw new Error('Template not found');
            }

            const ruleData: CreateScoringRuleData = {
                tournamentId,
                ruleName: template.name,
                ruleType: template.ruleType,
                killPoints: template.defaultKillPoints,
                positionMultiplier: template.defaultPositionMultiplier,
                customFormula: template.customFormula,
                description: template.description,
                priority: 1
            };

            return await this.createScoringRule(ruleData, createdBy);

        } catch (error) {
            this.handleError(error, 'Apply template');
            return null;
        }
    }

    // Bulk create scoring rules
    async bulkCreateRules(data: BulkScoringRuleData, createdBy: string): Promise<BulkScoringRuleResult> {
        try {
            const result: BulkScoringRuleResult = {
                success: true,
                createdCount: 0,
                updatedCount: 0,
                deletedCount: 0,
                errors: []
            };

            // Delete existing rules if replace is requested
            if (data.replaceExisting) {
                const existingRules = await this.getTournamentScoringRules(data.tournamentId);
                for (const rule of existingRules) {
                    const deleted = await this.deleteScoringRule(rule.id, createdBy);
                    if (deleted) {
                        result.deletedCount++;
                    }
                }
            }

            // Create new rules
            for (const ruleData of data.rules) {
                try {
                    const rule = await this.createScoringRule({
                        ...ruleData,
                        tournamentId: data.tournamentId
                    }, createdBy);
                    
                    if (rule) {
                        result.createdCount++;
                    } else {
                        result.errors.push(`Failed to create rule: ${ruleData.ruleName}`);
                    }
                } catch (error) {
                    result.errors.push(`Error creating rule ${ruleData.ruleName}: ${(error as Error).message}`);
                }
            }

            // Invalidate cache
            await redis.delete(`tournament:${data.tournamentId}:scoringRules:list`);

            if (result.errors.length > 0) {
                result.success = false;
            }

            return result;

        } catch (error) {
            this.handleError(error, 'Bulk create rules');
            return {
                success: false,
                createdCount: 0,
                updatedCount: 0,
                deletedCount: 0,
                errors: [(error as Error).message]
            };
        }
    }

    // Validate scoring rule
    async validateScoringRule(data: CreateScoringRuleData | UpdateScoringRuleData): Promise<ScoringRuleValidation> {
        const validation: ScoringRuleValidation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Check required fields
        if ('ruleName' in data && !data.ruleName?.trim()) {
            validation.errors.push({
                field: 'ruleName',
                error: 'MISSING_REQUIRED',
                message: 'Rule name is required'
            });
        }

        if ('killPoints' in data && data.killPoints !== undefined && data.killPoints < 0) {
            validation.errors.push({
                field: 'killPoints',
                error: 'NEGATIVE_POINTS',
                message: 'Kill points cannot be negative'
            });
        }

        if ('positionMultiplier' in data && data.positionMultiplier !== undefined && data.positionMultiplier < 0) {
            validation.errors.push({
                field: 'positionMultiplier',
                error: 'NEGATIVE_POINTS',
                message: 'Position multiplier cannot be negative'
            });
        }

        // Validate custom formula if present
        if ('customFormula' in data && data.customFormula) {
            try {
                // Test the formula with sample data
                this.evaluateCustomFormula(data.customFormula, {
                    kills: 5,
                    position: 10,
                    survivalTime: 1200
                });
            } catch (error) {
                validation.errors.push({
                    field: 'customFormula',
                    error: 'INVALID_FORMULA',
                    message: 'Invalid custom formula syntax'
                });
            }
        }

        // Add warnings for potentially problematic values
        if ('killPoints' in data && data.killPoints !== undefined && data.killPoints > 10) {
            validation.warnings.push({
                field: 'killPoints',
                warning: 'HIGH_KILL_POINTS',
                message: 'High kill points may unbalance the scoring'
            });
        }

        if ('positionMultiplier' in data && data.positionMultiplier !== undefined && data.positionMultiplier < 1) {
            validation.warnings.push({
                field: 'positionMultiplier',
                warning: 'LOW_POSITION_MULTIPLIER',
                message: 'Low position multiplier may not reward placement enough'
            });
        }

        validation.isValid = validation.errors.length === 0;
        return validation;
    }

    // Safely evaluate custom formula
    private evaluateCustomFormula(formula: string, input: ScoreCalculationInput): number {
        try {
            // Create a safe context for formula evaluation
            const context = {
                kills: input.kills,
                position: input.position,
                survivalTime: input.survivalTime || 0,
                ...input.customData
            };

            // Replace variables in formula
            let safeFormula = formula;
            Object.keys(context).forEach(key => {
                const regex = new RegExp(`\\b${key}\\b`, 'g');
                safeFormula = safeFormula.replace(regex, context[key as keyof typeof context]?.toString() || '0');
            });

            // Only allow basic mathematical operations
            const allowedPattern = /^[\d+\-*/().\s]+$/;
            if (!allowedPattern.test(safeFormula)) {
                throw new Error('Formula contains invalid characters');
            }

            // Evaluate the formula
            const result = Function(`"use strict"; return (${safeFormula})`)();
            
            return Math.round(Number(result) || 0);

        } catch (error) {
            this.logger.warn('Custom formula evaluation failed:', error);
            return 0;
        }
    }

    // Get popular scoring templates
    getPopularTemplates(): ScoringRuleTemplate[] {
        return POPULAR_SCORING_TEMPLATES;
    }
}

export const scoringRuleService = new ScoringRuleService();