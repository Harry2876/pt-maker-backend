
import { TournamentPermissions } from './tournament';

export interface MatchResultCache {
    id: string;
    matchId: string;
    groupId: string;
    tournamentId: string;
    screenshotUrl?: string;
    processedImageUrl?: string;
    aiProcessingStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'MANUAL_OVERRIDE';
    manualVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';
    finalStatus: 'DRAFT' | 'VERIFIED' | 'PUBLISHED';
    teamResults: TeamMatchResult[];
    aiConfidenceScore?: number;
    processedAt?: string;
    verifiedBy?: string;
    verifiedAt?: string;
    publishedAt?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
    dbStatus: 'PENDING_SYNC' | 'SYNCED' | 'ERROR';
}

export interface TeamMatchResult {
    teamRegistrationId: string;
    teamName: string;
    slotNumber: number;
    position: number;           // Final position in match (1-25)
    kills: number;
    damage?: number;
    survivalTime?: number;      // in seconds
    totalScore: number;         // Calculated using scoring rules
    scoreBreakdown: ScoreBreakdown[];
    aiDetected: boolean;        // Was this detected by AI?
    manuallyEdited: boolean;    // Was this manually corrected?
    confidence?: number;        // AI confidence for this team's data
}

export interface ScoreBreakdown {
    ruleName: string;
    ruleType: string;
    points: number;
    calculation: string;
}

export interface CreateMatchResultData {
    matchId: string;
    screenshotUrl?: string;
    teamResults?: TeamMatchResult[];
    notes?: string;
}

export interface UpdateMatchResultData {
    screenshotUrl?: string;
    processedImageUrl?: string;
    teamResults?: TeamMatchResult[];
    aiProcessingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'MANUAL_OVERRIDE';
    manualVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';
    finalStatus?: 'DRAFT' | 'VERIFIED' | 'PUBLISHED';
    aiConfidenceScore?: number;
    notes?: string;
}

// AI Processing
export interface AIProcessingRequest {
    matchResultId: string;
    screenshotUrl: string;
    expectedTeams: ExpectedTeamData[];
    processingOptions: AIProcessingOptions;
}

export interface ExpectedTeamData {
    teamRegistrationId: string;
    teamName: string;
    slotNumber: number;
}

export interface AIProcessingOptions {
    enableOCR: boolean;
    enableObjectDetection: boolean;
    confidenceThreshold: number;
    manualReviewThreshold: number;  // If confidence below this, require manual review
}

export interface AIProcessingResult {
    success: boolean;
    confidence: number;
    detectedTeams: AIDetectedTeam[];
    processingTime: number;
    errors: string[];
    warnings: string[];
}

export interface AIDetectedTeam {
    teamName: string;
    position: number;
    kills: number;
    damage?: number;
    confidence: number;
    boundingBox?: BoundingBox;      // Where detected in image
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Manual Verification
export interface ManualVerificationData {
    matchResultId: string;
    verificationStatus: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';
    teamCorrections: TeamCorrection[];
    verifierNotes?: string;
}

export interface TeamCorrection {
    teamRegistrationId: string;
    originalData: TeamMatchResult;
    correctedData: Partial<TeamMatchResult>;
    correctionReason: string;
}

export interface VerificationResult {
    success: boolean;
    finalResults: TeamMatchResult[];
    changesApplied: number;
    message: string;
}

// Bulk operations
export interface BulkMatchResultData {
    matchIds: string[];
    screenshotUrls: string[];
    processingOptions: AIProcessingOptions;
}

export interface BulkMatchResultResult {
    success: boolean;
    processedCount: number;
    successfulCount: number;
    failedCount: number;
    results: MatchResultCache[];
    errors: string[];
}

// Match result validation
export interface MatchResultValidation {
    isValid: boolean;
    errors: MatchResultError[];
    warnings: MatchResultWarning[];
}

export interface MatchResultError {
    teamId?: string;
    field: string;
    error: 'INVALID_POSITION' | 'NEGATIVE_KILLS' | 'MISSING_TEAM' | 'DUPLICATE_POSITION' | 'SCORE_MISMATCH';
    message: string;
}

export interface MatchResultWarning {
    teamId?: string;
    field: string;
    warning: 'HIGH_KILLS' | 'LOW_CONFIDENCE' | 'MANUAL_OVERRIDE' | 'UNUSUAL_SCORE';
    message: string;
}

// Result publishing
export interface PublishMatchResultData {
    matchResultId: string;
    publishToLeaderboard: boolean;
    notifyTeams: boolean;
    publishNotes?: string;
}

export interface PublishResult {
    success: boolean;
    publishedAt: string;
    leaderboardUpdated: boolean;
    notificationsSent: number;
    message: string;
}

// Match result permissions
export interface MatchResultPermissions extends TournamentPermissions {
    canViewResults: boolean;
    canUploadScreenshots: boolean;
    canTriggerAIProcessing: boolean;
    canVerifyResults: boolean;
    canEditResults: boolean;
    canPublishResults: boolean;
    canDeleteResults: boolean;
}

// Statistics and analytics
export interface MatchResultStats {
    totalMatches: number;
    aiProcessedMatches: number;
    manuallyProcessedMatches: number;
    averageProcessingTime: number;
    averageAIConfidence: number;
    pendingVerification: number;
    publishedResults: number;
}

export interface ProcessingPerformance {
    date: string;
    totalProcessed: number;
    aiSuccessRate: number;
    averageConfidence: number;
    manualReviewRate: number;
    processingTimeMs: number;
}