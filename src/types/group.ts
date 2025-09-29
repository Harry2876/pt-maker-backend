// Replace the entire content with this:

export interface GroupCache {
    id: string;
    name: string;
    maxTeams: number;
    qualificationSpots: number;
    tournamentId: string;
    stageId?: string; // Link groups to stages
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateGroupData {
    name: string;
    maxTeams?: number;
    qualificationSpots?: number;
    stageId?: string; // Allow linking group to stage during creation
}

export interface UpdateGroupData {
    name?: string;
    maxTeams?: number;
    qualificationSpots?: number;
    stageId?: string; // Allow updating stage assignment
}

// New: Stage-specific group creation
export interface CreateStageGroupData {
    stageId: string;
    groupsData: Array<{
        name: string;
        maxTeams?: number;
        qualificationSpots?: number;
    }>;
}

export interface StageGroupsResult {
    stageId: string;
    stageName: string;
    totalGroups: number;
    createdGroups: GroupCache[];
}