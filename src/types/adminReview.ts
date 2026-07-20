export interface AdminReviewPlayerResult {
    playerName: string;
    kills: number;
}

export interface AdminReviewFlaggedResult {
    resultId: string;
    slotNumber: number;
    teamName: string;
    detectedTeamName: string | null;
    position: number;
    rank: number;
    totalKills: number;
    positionPoints: number;
    killPoints: number;
    totalPoints: number;
    aiConfidence: number | null;
    needsReview: boolean;
    warningType: string | null;
    entryNotes: string | null;
    reviewReason: string;
    playerResults: AdminReviewPlayerResult[];
    updatedAt: string;
}

export interface AdminReviewScreenshot {
    id: string;
    type: string;
    originalName: string;
    previewUrl: string | null;
    signedUrl: string | null;
    expiresAt: string | null;
    uploadedAt: string;
}

export interface AdminReviewMatchGroup {
    quickMatchId: string;
    matchName: string;
    game: string;
    matchStatus: string;
    owner: {
        id: string;
        username: string;
        fullName: string;
        phoneNumber: string;
    };
    lastScanAt: string | null;
    lastScanType: string | null;
    screenshots: AdminReviewScreenshot[];
    flaggedResults: AdminReviewFlaggedResult[];
    flaggedCount: number;
}

export interface AdminReviewQueueData {
    period: {
        from: string;
        to: string;
        timezone: string;
        preset: string;
        label: string;
    };
    summary: {
        totalFlaggedResults: number;
        totalMatches: number;
        needsReviewCount: number;
        lowConfidenceCount: number;
        warningCount: number;
    };
    items: AdminReviewMatchGroup[];
    pagination: {
        page: number;
        limit: number;
        totalMatches: number;
        totalPages: number;
    };
    generatedAt: string;
}
