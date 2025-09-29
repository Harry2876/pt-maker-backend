export interface TeamQualificationCriteria {
    qualificationSpots: number;
    qualificationMethod: 'TOP_POINTS' | 'TOP_POSITION' | 'CUSTOM';
    tieBreakingRules: TieBreakingRule[];
}

export interface TieBreakingRule {
    priority: number;
    method: 'TOTAL_KILLS' | 'BEST_POSITION' | 'WINS' | 'HEAD_TO_HEAD';
}

export interface QualifiedTeam {
    teamRegistrationId: string;
    teamName: string;
    finalGroupPosition: number;
    totalPoints: number;
    totalKills: number;
    fromGroupId: string;
    fromGroupName: string;
    qualificationReason: string;
}

export interface GroupQualificationResult {
    groupId: string;
    groupName: string;
    totalTeams: number;
    qualificationSpots: number;
    qualifiedTeams: QualifiedTeam[];
    eliminatedTeams: EliminatedTeam[];
}

export interface EliminatedTeam {
    teamRegistrationId: string;
    teamName: string;
    finalGroupPosition: number;
    totalPoints: number;
    eliminationReason: string;
}

export interface StageQualificationResult {
    stageId: string;
    stageName: string;
    totalGroups: number;
    totalTeamsStarted: number;
    totalTeamsQualified: number;
    groupResults: GroupQualificationResult[];
    qualificationSummary: {
        teamsAdvanced: number;
        teamsEliminated: number;
        averagePointsToQualify: number;
    };
}

// Stage progression types (following organizer's structure)
export interface StageProgressionConfig {
    currentStageId: string;
    nextStageId: string;
    redistributionStrategy: 'RANDOM' | 'BALANCED' | 'SNAKE_DRAFT' | 'SEEDED';
    preserveTopPerformers: boolean;
    managementSlotsPerGroup: number;
}

export interface StageProgressionResult {
    fromStage: {
        stageId: string;
        stageName: string;
        totalTeamsQualified: number;
    };
    toStage: {
        stageId: string;
        stageName: string;
        totalGroups: number;
        maxTeamsPerGroup: number;
    };
    teamDistribution: GroupTeamAssignment[];
    progressionSummary: {
        teamsAdvanced: number;
        newGroupsPopulated: number;
        averageTeamsPerGroup: number;
        managementSlotsReserved: number;
    };
}

export interface GroupTeamAssignment {
    groupId: string;
    groupName: string;
    assignedTeams: QualifiedTeam[];
    managementSlots: number;
    totalSlots: number;
    filledSlots: number;
}

export interface TeamDistributionStrategy {
    strategy: 'RANDOM' | 'BALANCED' | 'SNAKE_DRAFT' | 'SEEDED';
    preserveTopPerformers?: boolean;
    balanceByPoints?: boolean;
}