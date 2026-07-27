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
    | 'ACTIVE'
    | 'COMPLETED'
    | 'ERROR';

export interface QuickMatchWithDetails extends QuickMatchCache {
    slotsCount: number;
    attendanceScreenshotsCount: number;
    resultScreenshotsCount: number;
    resultsCount: number;
    hasPointsTable: boolean;
}

/** Signed preview fields for a match-level organiser or sponsor branding logo (GET match, upload response). */
export interface MatchBrandingLogoView {
    logoStorageUrl: string;
    fileId: string;
    previewUrl: string;
    signedUrl: string;
    signedLogoUrl: string;
    expiresAt: string;
    previewUrlExpiresInSeconds: number;
}

/** Organiser/sponsor branding logos on a match — null when not uploaded. */
export interface MatchBrandingLogosView {
    organiserLogo: MatchBrandingLogoView | null;
    sponsorLogo: MatchBrandingLogoView | null;
}