

export interface PlayerCache {
    id: string;
    name: string;
    gameUuid?: string;      // BGMI character UUID
    email?: string;
    phoneNumber?: string;
    totalMatches: number;
    totalKills: number;
    totalPoints: number;
    averageKills: number;
    bestPosition?: number;   // Best finishing position across all tournaments
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreatePlayerData {
    name: string;
    gameUuid?: string;
    email?: string;
    phoneNumber?: string;
}

export interface UpdatePlayerData {
    name?: string;
    gameUuid?: string;
    email?: string;
    phoneNumber?: string;
    totalMatches?: number;
    totalKills?: number;
    totalPoints?: number;
    bestPosition?: number;
}

// Player statistics per tournament
export interface PlayerStatCache {
    id: string;
    playerId: string;
    tournamentId: string;
    teamName: string;
    matches: number;
    totalKills: number;
    totalPoints: number;
    averageKills: number;
    bestPosition?: number;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreatePlayerStatData {
    playerId: string;
    tournamentId: string;
    teamName: string;
}

export interface UpdatePlayerStatData {
    matches?: number;
    totalKills?: number;
    totalPoints?: number;
    averageKills?: number;
    bestPosition?: number;
}

// Player search and filtering
export interface PlayerSearchFilters {
    name?: string;
    gameUuid?: string;
    email?: string;
    phoneNumber?: string;
    minMatches?: number;
    maxMatches?: number;
    minKills?: number;
    maxKills?: number;
    minPoints?: number;
    maxPoints?: number;
    tournamentId?: string;
}

export interface PlayerSearchItem {
    id: string;
    name: string;
    gameUuid?: string;
    totalMatches: number;
    totalKills: number;
    totalPoints: number;        // ← This was missing and causing the sort error
    averageKills: number;
    bestPosition?: number;
}

export interface PlayerSearchResult {
    players: PlayerWithStats[];
    total: number;
    page: number;
    limit: number;
}

export interface PlayerWithStats extends PlayerCache {
    recentTournaments: PlayerTournamentSummary[];
    performanceMetrics: PlayerPerformanceMetrics;
}

export interface PlayerTournamentSummary {
    tournamentId: string;
    tournamentName: string;
    teamName: string;
    matches: number;
    totalKills: number;
    totalPoints: number;
    bestPosition: number;
    finalRank?: number;
}

export interface PlayerPerformanceMetrics {
    killsPerMatch: number;
    pointsPerMatch: number;
    top5Finishes: number;
    top10Finishes: number;
    winRate: number;          // Percentage of matches won
    consistencyScore: number; // Based on standard deviation of performance
}

// Player comparison
export interface PlayerComparison {
    player1: PlayerWithStats;
    player2: PlayerWithStats;
    comparison: {
        killsAdvantage: number;      // Positive if player1 is better
        pointsAdvantage: number;
        averagePositionAdvantage: number;
        experienceAdvantage: number; // Based on matches played
        recentFormAdvantage: number; // Based on last 5 tournaments
    };
}

// Team player details (for registration)
export interface TeamPlayerDetail {
    name: string;
    gameUuid?: string;
    email?: string;
    phoneNumber?: string;
    role?: 'IGL' | 'ASSAULTER' | 'SUPPORT' | 'SNIPER'; // BGMI roles
    isSubstitute?: boolean;
}

export interface TeamPlayerValidation {
    isValid: boolean;
    errors: string[];
    duplicateUuids: string[];
    duplicateEmails: string[];
    duplicatePhones: string[];
}