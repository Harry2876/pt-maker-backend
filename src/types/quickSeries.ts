export interface QuickTournamentSeriesCache {
    id: string;
    seriesName: string;
    game: string;
    totalMatches: number;
    matchesCompleted: number;
    status: QuickSeriesStatus;
    
    positionPointsConfig?: number[];
    killPointsValue: number;
    scoringDescription?: string;
    
    currentMatchNumber: number;
    isFinished: boolean;
    winnerTeamName?: string;
    finalStandings?: SeriesTeamStanding[];
    
    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateQuickSeriesData {
    seriesName: string;
    game?: string;
    totalMatches: number;
    positionPointsConfig?: number[];
    killPointsValue?: number;
    scoringDescription?: string;
}

export interface UpdateQuickSeriesData {
    seriesName?: string;
    game?: string;
    totalMatches?: number;
    matchesCompleted?: number;
    status?: QuickSeriesStatus;
    positionPointsConfig?: number[];
    killPointsValue?: number;
    scoringDescription?: string;
    currentMatchNumber?: number;
    isFinished?: boolean;
    winnerTeamName?: string;
    finalStandings?: SeriesTeamStanding[];
}

export type QuickSeriesStatus = 
    | 'CREATED'
    | 'IN_PROGRESS' 
    | 'COMPLETED'
    | 'CANCELLED';

export interface SeriesTeamStanding {
    teamName: string;
    totalPoints: number;
    matchesPlayed: number;
    bestPosition: number;
    worstPosition: number;
    totalKills: number;
    averagePosition: number;
    matchResults: SeriesMatchResult[];
}

export interface SeriesMatchResult {
    matchOrder: number;
    quickMatchId: string;
    position: number;
    kills: number;
    points: number;
    bonusPoints: number;
}

export interface QuickSeriesMatchCache {
    id: string;
    seriesId: string;
    quickMatchId: string;
    matchOrder: number;
    /** Derived at read time — true when the match has result rows */
    isCompleted?: boolean;
    completedAt?: string;
    matchWeight: number;
    bonusPoints: number;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface QuickSeriesLeaderboardCache {
    id: string;
    seriesId: string;
    leaderboardData: SeriesTeamStanding[];
    lastUpdatedMatch: number;
    generatedAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}