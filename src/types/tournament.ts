

export interface TournamentCache {
    id: string;
    name: string;
    game: string;
    tournamentType:'TOURNAMENT';
    maxTeams?: number;
    entryFee?: number;
    prizePool?: number;
    status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    
    // New enhanced fields
    totalStages: number;
    currentStage: number;
    tournamentFormat: 'ELIMINATION' | 'ROUND_ROBIN' | 'MIXED';
    maxTeamsPerGroup: number;
    registrationFields?: RegistrationField[];
    allowCollaborators: boolean;
    
    // Existing fields
    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateTournamentData {
    name: string;
    game: string;
    tournamentType?: 'TOURNAMENT';
    maxTeams?: number;
    entryFee?: number;
    prizePool?: number;
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    
    // New enhanced fields
    totalStages?: number;
    tournamentFormat?: 'ELIMINATION' | 'ROUND_ROBIN' | 'MIXED';
    maxTeamsPerGroup?: number;
    registrationFields?: RegistrationField[];
    allowCollaborators?: boolean;
}

export interface UpdateTournamentData {
    name?: string;
    game?: string;
    tournamentType?: 'TOURNAMENT';
    maxTeams?: number;
    entryFee?: number;
    prizePool?: number;
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    
    // New enhanced fields
    totalStages?: number;
    currentStage?: number;
    tournamentFormat?: 'ELIMINATION' | 'ROUND_ROBIN' | 'MIXED';
    maxTeamsPerGroup?: number;
    registrationFields?: RegistrationField[];
    allowCollaborators?: boolean;
}

// Registration field configuration
export interface RegistrationField {
    id: string;
    name: string;
    type: 'text' | 'email' | 'phone' | 'number' | 'select';
    label: string;
    placeholder?: string;
    required: boolean;
    options?: string[]; // For select type
    validation?: {
        minLength?: number;
        maxLength?: number;
        pattern?: string;
    };
}

// Tournament stage management
export interface TournamentStageCache {
    id: string;
    name: string;
    stageNumber: number;
    totalGroups: number;
    qualificationSpots: number;
    stageFormat: 'ELIMINATION' | 'ROUND_ROBIN';
    isActive: boolean;
    isCompleted: boolean;
    tournamentId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateStageData {
    name: string;
    stageNumber: number;
    totalGroups?: number;
    qualificationSpots?: number;
    stageFormat?: 'ELIMINATION' | 'ROUND_ROBIN';
}

export interface UpdateStageData {
    name?: string;
    totalGroups?: number;
    qualificationSpots?: number;
    stageFormat?: 'ELIMINATION' | 'ROUND_ROBIN';
    isActive?: boolean;
    isCompleted?: boolean;
}

export interface TournamentPermissions {
    // Basic tournament management
    canEditTournament: boolean;
    canDeleteTournament: boolean;
    canManageStages: boolean;
    canManageGroups: boolean;
    canManageSlots: boolean;
    
    // Match and result management
    canManageMatches: boolean;
    canProcessResults: boolean;
    canVerifyResults: boolean;
    canEditResults: boolean;
    canPublishResults: boolean;
    canViewResults: boolean;
    
    // Collaboration management
    canManageCollaborators: boolean;
    canInviteUsers: boolean;
    canRemoveUsers: boolean;
    canChangeUserRoles: boolean;
    
    // Analytics and data
    canViewAnalytics: boolean;
    canExportData: boolean;
    canManageSettings: boolean;
    canViewTournament: boolean;
}

// Tournament analytics types
export interface TournamentAnalytics {
    totalTeams: number;
    totalMatches: number;
    totalPlayers: number;
    averageKillsPerMatch: number;
    topPerformingTeams: TopTeam[];
    stageProgression: StageProgressionData[];
    registrationTrends: RegistrationTrendData[];
}

export interface TopTeam {
    teamName: string;
    totalPoints: number;
    matches: number;
    averageKills: number;
    bestPosition: number;
    currentStage: number;
}

export interface StageProgressionData {
    stageName: string;
    teamsStarted: number;
    teamsQualified: number;
    matchesCompleted: number;
    averagePointsPerMatch: number;
}

export interface RegistrationTrendData {
    date: string;
    registrations: number;
    cumulativeTotal: number;
}

// Tournament status with detailed progress
export interface TournamentProgress {
    currentStage: number;
    totalStages: number;
    stageProgress: {
        name: string;
        groupsCompleted: number;
        totalGroups: number;
        teamsQualified: number;
        expectedQualifications: number;
    };
    overallProgress: {
        registeredTeams: number;
        maxTeams: number;
        completedMatches: number;
        totalExpectedMatches: number;
    };
}