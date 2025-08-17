export interface GroupCache {
    id: string;
    name: string;
    maxTeams: number;
    qualificationSpots: number;
    tournamentId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateGroupData {
    name: string;
    maxTeams?: number;
    qualificationSpots?: number;
}

export interface UpdateGroupData {
    name?: string;
    maxTeams?: number;
    qualificationSpots?: number;
}