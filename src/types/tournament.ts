export interface TournamentCache {
    id: string;
    name: string;
    game: string;
    tournamentType: 'PAID_SCRIM' | 'TOURNAMENT'; // Add this
    maxTeams?: number; // Add this
    entryFee?: number; // Add this
    prizePool?: number; // Add this
    status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateTournamentData {
    name: string;
    game: string;
    tournamentType?: 'PAID_SCRIM' | 'TOURNAMENT'; // Add this
    maxTeams?: number; // Add this
    entryFee?: number; // Add this
    prizePool?: number; // Add this
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
}

export interface UpdateTournamentData {
    name?: string;
    game?: string;
    tournamentType?: 'PAID_SCRIM' | 'TOURNAMENT'; // Add this
    maxTeams?: number; // Add this
    entryFee?: number; // Add this
    prizePool?: number; // Add this
    status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
}