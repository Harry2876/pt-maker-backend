export interface TeamRegistrationCache {
    id: string;
    teamName: string;
    contactInfo: string;
    registrationStatus: 'PENDING' | 'CONFIRMED' | 'QUALIFIED' | 'ELIMINATED';
    finalPosition?: number;
    totalPoints: number;
    tournamentId: string;
    groupId?: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateTeamRegistrationData {
    teamName: string;
    contactInfo: string;
    groupId?: string;
}

export interface UpdateTeamRegistrationData {
    teamName?: string;
    contactInfo?: string;
    registrationStatus?: 'PENDING' | 'CONFIRMED' | 'QUALIFIED' | 'ELIMINATED';
    finalPosition?: number;
    totalPoints?: number;
    groupId?: string;
}