export interface TournamentCache {
    id: string;
    name: string;
    game: string;
    status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateTournamentData {
    name: string;
    game: string;
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
}

export interface UpdateTournamentData {
    name?: string;
    game?: string;
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
}