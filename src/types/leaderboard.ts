// Leaderboard entries and rankings
export interface LeaderboardEntry {
    teamRegistrationId: string;
    teamName: string;
    totalMatches: number;
    totalKills: number;
    totalPoints: number;
    averageKills: number;
    averagePosition: number;
    bestPosition: number;
    wins: number;                // First place finishes
    top5Finishes: number;
    top10Finishes: number;
    winRate: number;             // Percentage
    rank: number;
    previousRank?: number;
    rankChange?: 'UP' | 'DOWN' | 'SAME';
    lastUpdated: string;
}

// Tournament leaderboard
export interface TournamentLeaderboard {
    tournamentId: string;
    tournamentName: string;
    totalTeams: number;
    totalMatches: number;
    lastUpdated: string;
    entries: LeaderboardEntry[];
    generatedAt: string;
}

// Group leaderboard  
export interface GroupLeaderboard {
    groupId: string;
    groupName: string;
    tournamentId: string;
    totalTeams: number;
    totalMatches: number;
    lastUpdated: string;
    entries: LeaderboardEntry[];
    generatedAt: string;
}

// Live standings during tournament
export interface LiveStandings extends TournamentLeaderboard {
    isLive: boolean;
    currentMatch?: string;
    nextUpdateIn?: number;      // Seconds until next update
}

// Player ranking across all tournaments
export interface PlayerRanking {
    playerId: string;
    playerName: string;
    globalRank: number;
    totalTournaments: number;
    totalMatches: number;
    totalKills: number;
    totalPoints: number;
    averageKills: number;
    averagePosition: number;
    bestPosition: number;
    winRate: number;
    top5Rate: number;
    recentForm: {
        last5Tournaments: PlayerTournamentPerformance[];
        trendDirection: 'UP' | 'DOWN' | 'STABLE';
    };
    lastUpdated: string;
}

export interface PlayerTournamentPerformance {
    tournamentId: string;
    tournamentName: string;
    finalRank: number;
    totalKills: number;
    totalPoints: number;
    matches: number;
    completedAt: string;
}

// Leaderboard update configurations
export interface LeaderboardUpdateConfig {
    tournamentId: string;
    includeGroups?: string[];    // Specific groups to update
    updateLive?: boolean;        // Whether to update live standings
    notifyTeams?: boolean;       // Send notifications to teams
    publishWebhook?: boolean;    // Send webhook updates
}

// Cache structures
export interface LeaderboardCache {
    tournamentId: string;
    type: 'TOURNAMENT' | 'GROUP' | 'LIVE';
    groupId?: string;
    data: TournamentLeaderboard | GroupLeaderboard | LiveStandings;
    generatedAt: string;
    expiresAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateLeaderboardData {
    tournamentId: string;
    type: 'TOURNAMENT' | 'GROUP' | 'LIVE';
    groupId?: string;
}

export interface UpdateLeaderboardData {
    forceRefresh?: boolean;
    includeGroups?: string[];
    notifyTeams?: boolean;
}

// Leaderboard generation results
export interface LeaderboardGenerationResult {
    success: boolean;
    tournamentId: string;
    type: 'TOURNAMENT' | 'GROUP' | 'LIVE';
    entriesGenerated: number;
    processingTime: number;      // milliseconds
    errors: string[];
    lastUpdated: string;
}

// Search and filtering
export interface LeaderboardSearchFilters {
    tournamentId?: string;
    groupId?: string;
    teamName?: string;
    minKills?: number;
    maxKills?: number;
    minPosition?: number;
    maxPosition?: number;
    rankRange?: {
        from: number;
        to: number;
    };
}

export interface LeaderboardSearchResult {
    entries: LeaderboardEntry[];
    total: number;
    filters: LeaderboardSearchFilters;
    generatedAt: string;
}