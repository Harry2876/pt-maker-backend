export interface QuickMatchResultCache {
    id: string;
    quickMatchId: string;
    slotNumber: number;
    teamName: string;
    detectedTeamName?: string;
    position: number;
    rank: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    playerResults?: PlayerResult[];
    status: 'PENDING' | 'PROCESSED' | 'VERIFIED' | 'MANUAL_ENTRY';
    warningType?: string;
    needsReview: boolean;
    aiConfidence?: number;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateQuickMatchResultData {
    slotNumber: number;
    teamName: string;
    detectedTeamName?: string;
    position: number;
    rank: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    playerResults?: PlayerResult[];
    warningType?: string;
    needsReview?: boolean;
    aiConfidence?: number;
}

export interface UpdateQuickMatchResultData {
    teamName?: string;
    position?: number;
    rank?: number;
    totalKills?: number;
    positionPoints?: number;
    killPoints?: number;
    totalPoints?: number;
    playerResults?: PlayerResult[];
    status?: 'PENDING' | 'PROCESSED' | 'VERIFIED' | 'MANUAL_ENTRY';
    warningType?: string;
    needsReview?: boolean;
}

export interface PlayerResult {
    playerName: string;
    kills: number;
}

// Points Table
export interface QuickPointsTableCache {
    id: string;
    quickMatchId: string;
    tableImageUrl?: string;
    csvData?: any;
    pngGeneratedAt?: string;
    generationTimeMs?: number;
    template: string;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

// Warning Types
export type WarningType = 
    | 'TEAM_NAME_MISMATCH'
    | 'SLOT_NOT_FOUND'
    | 'DUPLICATE_TEAM'
    | 'MISSING_KILLS'
    | 'INVALID_POSITION'
    | 'LOW_AI_CONFIDENCE';