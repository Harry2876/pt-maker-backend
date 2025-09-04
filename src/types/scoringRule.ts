
import { TournamentPermissions } from './tournament';

export interface ScoringRuleCache {
    id: string;
    tournamentId: string;
    ruleName: string;
    ruleType: 'KILL_POINTS' | 'POSITION_POINTS' | 'SURVIVAL_TIME' | 'CUSTOM_FORMULA';
    isActive: boolean;
    priority: number;           // Higher priority rules applied first
    killPoints: number;
    positionMultiplier: number;
    customFormula?: string;     // JavaScript formula for custom scoring
    description?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateScoringRuleData {
    tournamentId: string;
    ruleName: string;
    ruleType: 'KILL_POINTS' | 'POSITION_POINTS' | 'SURVIVAL_TIME' | 'CUSTOM_FORMULA';
    killPoints: number;
    positionMultiplier: number;
    customFormula?: string;
    description?: string;
    priority?: number;
}

export interface UpdateScoringRuleData {
    ruleName?: string;
    ruleType?: 'KILL_POINTS' | 'POSITION_POINTS' | 'SURVIVAL_TIME' | 'CUSTOM_FORMULA';
    killPoints?: number;
    positionMultiplier?: number;
    customFormula?: string;
    description?: string;
    priority?: number;
    isActive?: boolean;
}

// Scoring rule templates
export interface ScoringRuleTemplate {
    id: string;
    name: string;
    description: string;
    ruleType: 'KILL_POINTS' | 'POSITION_POINTS' | 'SURVIVAL_TIME' | 'CUSTOM_FORMULA';
    defaultKillPoints: number;
    defaultPositionMultiplier: number;
    customFormula?: string;
    isPopular: boolean;
    usageCount: number;
}

// Pre-defined popular scoring templates
export const POPULAR_SCORING_TEMPLATES: ScoringRuleTemplate[] = [
    {
        id: 'standard-bgmi',
        name: 'Standard BGMI',
        description: 'Standard BGMI tournament scoring',
        ruleType: 'KILL_POINTS',
        defaultKillPoints: 1,
        defaultPositionMultiplier: 2,
        isPopular: true,
        usageCount: 0
    },
    {
        id: 'pmco-style',
        name: 'PMCO Style',
        description: 'PUBG Mobile Club Open scoring',
        ruleType: 'KILL_POINTS',
        defaultKillPoints: 2,
        defaultPositionMultiplier: 1.5,
        isPopular: true,
        usageCount: 0
    }
];

// Scoring rule validation
export interface ScoringRuleValidation {
    isValid: boolean;
    errors: ScoringRuleError[];
    warnings: ScoringRuleWarning[];
}

export interface ScoringRuleError {
    field: string;
    error: 'INVALID_FORMULA' | 'NEGATIVE_POINTS' | 'DUPLICATE_PRIORITY' | 'MISSING_REQUIRED';
    message: string;
}

export interface ScoringRuleWarning {
    field: string;
    warning: 'HIGH_KILL_POINTS' | 'LOW_POSITION_MULTIPLIER' | 'COMPLEX_FORMULA';
    message: string;
}

// Scoring calculation
export interface ScoreCalculationInput {
    kills: number;
    position: number;
    survivalTime?: number;      // in seconds
    customData?: Record<string, any>;
}

export interface ScoreCalculationResult {
    totalScore: number;
    killPoints: number;
    positionPoints: number;
    survivalPoints?: number;
    customPoints?: number;
    breakdown: ScoreBreakdown[];
}

export interface ScoreBreakdown {
    ruleName: string;
    ruleType: string;
    points: number;
    calculation: string;       // Human readable calculation
}

// Bulk scoring operations
export interface BulkScoringRuleData {
    tournamentId: string;
    rules: CreateScoringRuleData[];
    replaceExisting?: boolean;  // Replace all existing rules
}

export interface BulkScoringRuleResult {
    success: boolean;
    createdCount: number;
    updatedCount: number;
    deletedCount: number;
    errors: string[];
}

// Scoring rule permissions
export interface ScoringRulePermissions extends TournamentPermissions {
    canCreateRules: boolean;
    canEditRules: boolean;
    canDeleteRules: boolean;
    canViewRules: boolean;
    canApplyTemplates: boolean;
}