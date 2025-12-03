export interface QuickMatchCache {
    id: string;
    matchName: string;
    game: string;
    map?: string;
    status: QuickMatchStatus;
    processingStep?: string;
    aiProcessingId?: string;
    teamsDetected: number;
    warningsCount: number;

    positionPointsConfig?: number[]; // e.g., [20, 15, 12, 10, 8, 6, 4, 2, 1, 0]
    killPointsValue: number;         // Default: 1
    scoringDescription?: string;

    userId: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface CreateQuickMatchData {
    matchName: string;
    game?: string;
    map?: string;

    positionPointsConfig?: number[]; // Optional, will use default BGMI if not provided
    killPointsValue?: number;        // Optional, default: 1
    scoringDescription?: string;
}

export interface UpdateQuickMatchData {
    matchName?: string;
    game?: string;
    map?: string;
    status?: QuickMatchStatus;

    positionPointsConfig?: number[];
    killPointsValue?: number;
    scoringDescription?: string;
    
    processingStep?: string;
    aiProcessingId?: string;
    teamsDetected?: number;
    warningsCount?: number;
}

export type QuickMatchStatus = 
    | 'CREATED'
    | 'SLOTS_UPLOADED'
    | 'ATTENDANCE_UPLOADED'
    | 'RESULTS_UPLOADED'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'ERROR'
    | 'CANCELLED';

export interface QuickMatchWithDetails extends QuickMatchCache {
    slotsCount: number;
    attendanceScreenshotsCount: number;
    resultScreenshotsCount: number;
    resultsCount: number;
    hasPointsTable: boolean;
}