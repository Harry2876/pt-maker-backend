import { AdvancedEngineRequest } from "./advancedEngine";

export interface ScreenshotProcessingJob {
    matchId: string;
    screenshotUrls: string[];
    templateId?: string;
    userId: string;
}

export interface OTPSendingJob {
    phoneNumber: string;
    otp: string;
    type: 'registration' | 'forgot_password' | 'login';
    userId?: string;
}

export interface EmailNotificationJob {
    userId: string;
    email: string;
    template: 'tournament_created' | 'match_completed' | 'payment_success';
    data: Record<string, any>;
}

export interface ImageProcessingJob {
    imageUrl: string;
    userId: string;
    operations: {
        resize?: { width: number; height: number };
        compress?: { quality: number };
        format?: 'jpeg' | 'png' | 'webp';
        watermark?: { text: string; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' };
    };
}

export interface ReportGenerationJob {
    tournamentId: string;
    userId: string;
    type: 'leaderboard' | 'match_results' | 'analytics';
    format: 'pdf' | 'excel' | 'json';
}

export interface CleanupJob {
    type: 'expired_otps' | 'old_sessions' | 'temp_files' | 'failed_jobs';
    olderThan?: Date;
}

export interface PaymentProcessingJob {
    userId: string;
    amount: number;
    type: 'subscription' | 'credit_pack';
    paymentGatewayId: string;
}

export type EntityType =
    | 'TOURNAMENT' | 'MATCH' | 'SCREENSHOT' | 'GROUP' | 'TEAM_REGISTRATION'
    | 'COLLABORATOR' | 'DELETE_COLLABORATOR' | 'SLOT_ASSIGNMENT'
    | 'PLAYER' | 'DELETE_PLAYER' | 'SCORING_RULE' | 'DELETE_SCORING_RULE'
    | 'MATCH_RESULT' | 'DELETE_MATCH_RESULT' | 'TOURNAMENT_STAGE' | 'DELETE_TOURNAMENT_STAGE'
    | 'QUICK_MATCH' | 'QUICK_SLOT' | 'QUICK_SCREENSHOT' | 'QUICK_RESULT'| 'QUICK_POINTS_TABLE';

export interface DatabaseSyncJob {
    type: 'TOURNAMENT_CREATE' | 'TOURNAMENT_UPDATE' | 'TOURNAMENT_DELETE' |
    'MATCH_CREATE' | 'MATCH_UPDATE' | 'MATCH_DELETE' | 'MATCH_PROCESSED_DATA_UPDATE' | 'SCREENSHOT_CREATE' | 'SCREENSHOT_DELETE' | 'BATCH_SYNC' | 'GROUP_CREATE'
    | 'GROUP_UPDATE'
    | 'GROUP_DELETE'
    | 'TEAM_REGISTRATION_CREATE'
    | 'TEAM_REGISTRATION_UPDATE'
    | 'SLOT_ASSIGNMENT_CREATE'
    | 'SLOT_ASSIGNMENT_UPDATE'
    | 'SLOT_ASSIGNMENT_DELETE'
    | 'SCORING_RULE_CREATE'
    | 'SCORING_RULE_UPDATE'
    | 'DELETE_SCORING_RULE'
    | 'MATCH_RESULT_CREATE'
    | 'MATCH_RESULT_UPDATE'
    | 'DELETE_MATCH_RESULT'
    | 'TOURNAMENT_STAGE_CREATE'
    | 'TOURNAMENT_STAGE_UPDATE'
    | 'DELETE_TOURNAMENT_STAGE_CREATE'
    | 'QUICK_MATCH_CREATE'
    | 'QUICK_MATCH_UPDATE'
    | 'QUICK_MATCH_DELETE'
    | 'QUICK_SLOT_CREATE'
    | 'QUICK_SLOT_UPDATE'
    | 'QUICK_SLOT_DELETE'
    | 'QUICK_SCREENSHOT_CREATE'
    | 'QUICK_SCREENSHOT_DELETE'
    | 'QUICK_RESULT_CREATE'
    | 'QUICK_RESULT_UPDATE'
    | 'QUICK_RESULT_DELETE'
    | 'QUICK_POINTS_TABLE_CREATE'
    | 'QUICK_POINTS_TABLE_UPDATE'
    | 'QUICK_POINTS_TABLE_DELETE'
| 'QUICK_SERIES_CREATE'
| 'QUICK_SERIES_UPDATE'
| 'QUICK_SERIES_MATCH_CREATE'
| 'QUICK_SERIES_LEADERBOARD_UPDATE';
    entityId: string;
    data: any;
    userId: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    retryCount?: number;
    timestamp: string;
}

export interface BatchSyncJob {
    type: 'TOURNAMENT' | 'MATCHES' | 'SCREENSHOTS' | 'ALL';
    batchSize?: number;
    olderThan?: string;
}

export interface AdvancedEngineJob {
    type: 'PROCESS_SCREENSHOTS';
    matchId: string;
    userId: string;
    request: AdvancedEngineRequest;
    priority: 'HIGH' | 'NORMAL' | 'LOW';
    createdAt: Date;
}