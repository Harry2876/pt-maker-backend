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
    entryNotes?: string;
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
    entryNotes?: string;
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
    | 'LOW_AI_CONFIDENCE'
    | 'AMBIGUOUS_SLOT_MATCH'
    | 'SLOT_ALREADY_ASSIGNED'
    | 'SLOT_ROSTER_CONFLICT';

export interface ProcessingAuditWarning {
    type: WarningType;
    message: string;
    details?: Record<string, unknown>;
}

export interface AttendanceProcessingAudit {
    ocrMode: 'batch';
    imagesProcessed: number;
    rawTeams: number;
    mergedSlots: number;
    reconciliationWarnings: number;
    saved: Array<{
        slotNumber: number;
        teamName: string;
        playerNames: string[];
    }>;
}

export interface ResultProcessingAudit {
    ocrMode: 'per_image' | 'batch' | 'per_image_fallback';
    imagesProcessed: number;
    rawTeams: number;
    afterDedupe: number;
    skippedDuplicates: number;
    skippedInvalidRanks: number;
    matched: number;
    unmatched: number;
    ambiguous: number;
    slotConflicts: number;
    deletedProcessedResults: number;
    saved: Array<{
        slotNumber: number;
        rank: number;
        teamName: string;
        totalKills: number;
        matchScore: string;
        playerResults?: PlayerResult[];
    }>;
}
