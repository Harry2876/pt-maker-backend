import { QuickMatchResultCache } from './quickResult';
import { SeriesTeamStanding } from './quickSeries';

export interface TieBreakingRule {
    priority: number;
    method: 'KILLS' | 'BEST_POSITION' | 'MANUAL_ORDER';
    isActive: boolean;
    description?: string;
}

export interface ConflictGroup {
    points: number;
    /** Full match result rows — populated for match-level conflicts */
    conflictedTeams?: QuickMatchResultCache[];
    /** Team names in the tied group — populated for series conflicts */
    conflictedTeamNames?: string[];
    /** Aggregated series standings — populated for series conflicts */
    conflictedStandings?: SeriesTeamStanding[];
    requiresManualResolution: boolean;
    conflictType: 'TOTAL_POINTS' | 'POSITION_POINTS' | 'SERIES_POINTS';
}

export interface ManualTieBreaking {
    conflictGroupId: string;
    points: number;
    userDefinedOrder: string[]; // Team names in preferred order
    resolvedBy: string;
    resolvedAt: string;
    reason?: string;
}

export interface TieBreakingConfig {
    matchId?: string;
    seriesId?: string;
    rules: TieBreakingRule[];
    manualResolutions: ManualTieBreaking[];
    autoResolveEnabled: boolean;
}

export interface ConflictDetectionResult {
    hasConflicts: boolean;
    conflictGroups: ConflictGroup[];
    totalConflictedTeams: number;
    autoResolvableCount: number;
    manualResolutionRequired: number;
}

export interface TieBreakingResult {
    originalResults: QuickMatchResultCache[];
    resolvedResults: QuickMatchResultCache[];
    appliedRules: {
        ruleId: number;
        method: string;
        teamsAffected: string[];
    }[];
    manualResolutions: ManualTieBreaking[];
    summary: {
        totalTeams: number;
        conflictsDetected: number;
        autoResolved: number;
        manuallyResolved: number;
        remainingConflicts: number;
    };
}

export interface SeriesConflictGroup {
    points: number;
    conflictedStandings: SeriesTeamStanding[];
    requiresManualResolution: boolean;
}

export interface SeriesTieBreakingResult {
    originalStandings: SeriesTeamStanding[];
    resolvedStandings: SeriesTeamStanding[];
    appliedRules: {
        ruleId: number;
        method: string;
        teamsAffected: string[];
    }[];
    manualResolutions: ManualTieBreaking[];
    summary: {
        totalTeams: number;
        conflictsDetected: number;
        autoResolved: number;
        manuallyResolved: number;
        remainingConflicts: number;
    };
}

// For enhanced points table generation
export interface EnhancedMatchResult {
    id: string;
    quickMatchId: string;
    slotNumber: number;
    teamName: string;
    position: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    finalPosition: number; // After tie-breaking resolution
    originalPosition: number; // Before tie-breaking
    tieBreakingApplied: boolean;
    tieBreakingMethod?: string;
    tieBreakingReason?: string;
}

// API Request/Response types
export interface DetectConflictsRequest {
    quickMatchId?: string;
    seriesId?: string;
}

export interface ResolveConflictsRequest {
    conflictGroupId: string;
    userDefinedOrder: string[];
    reason?: string;
}

export interface SetTieBreakingRulesRequest {
    quickMatchId?: string;
    seriesId?: string;
    rules: TieBreakingRule[];
    autoResolveEnabled: boolean;
}