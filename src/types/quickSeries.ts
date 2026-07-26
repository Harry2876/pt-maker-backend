export interface QuickTournamentSeriesCache {
    id: string;
    seriesName: string;
    game: string;
    totalMatches: number;
    matchesCompleted: number;
    status: QuickSeriesStatus;

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
}

export interface UpdateQuickSeriesData {
    seriesName?: string;
    game?: string;
    totalMatches?: number;
    matchesCompleted?: number;
    status?: QuickSeriesStatus;
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
    /** Sum of position points across completed matches (used for tie-breaking). */
    positionPoints?: number;
    /** Sum of finish/kill points across completed matches (used for tie-breaking). */
    finishPoints?: number;
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

export interface NextMatchPreview {
    canCreateNextMatch: boolean;
    nextMatchNumber: number;
    suggestedMatchName: string;
    previousMatchId: string | null;
    previousMatchSlotCount: number;
    willCopySlotsFrom: string | null;
    copySlotsAvailable: boolean;
    reason: string | null;
}

export interface CreateNextMatchInSeriesData {
    matchName?: string;
    map?: string;
    copySlots?: boolean;
    copyScoring?: boolean;
    sourceMatchId?: string;
}

export interface CreateNextMatchInSeriesResult {
    matchId: string;
    matchNumber: number;
    slotsCopied: boolean;
    slotsCopiedFrom: string | null;
    slotCount: number;
}

export interface MatchSeriesContext {
    seriesId: string;
    seriesName: string;
    matchNumber: number;
    totalMatches: number;
    previousMatchId: string | null;
    nextMatchNumber: number | null;
    canCreateNextMatch: boolean;
}