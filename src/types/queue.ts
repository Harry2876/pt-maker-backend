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
    | 'DISCORD_GUILD' | 'DISCORD_USER' | 'DISCORD_GUILD_MEMBER' | 'DISCORD_GUILD_UPDATE' | 'BOT_STATE' | 'TEAM_ENROLLMENT' | 'USER_RATE_LIMIT' | 'TEAM_NAME_CHANGE' | 'TEAM_ACTIVITY_LOG';

export type DiscordEntityType =
    | 'DISCORD_GUILD' | 'DISCORD_USER' | 'DISCORD_GUILD_MEMBER' | 'BOT_STATE'
    | 'TEAM_ENROLLMENT' | 'USER_RATE_LIMIT' | 'TEAM_NAME_CHANGE' | 'TEAM_ACTIVITY_LOG'
    | 'DISCORD_GUILD_UPDATE';

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
    | 'DELETE_TOURNAMENT_STAGE_CREATE';
    entityId: string;
    data: any;
    userId: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
    retryCount?: number;
    timestamp: string;
}

export interface DiscordSyncJob {
    type: 'DISCORD_GUILD_CREATE' | 'DISCORD_GUILD_UPDATE' | 'DISCORD_GUILD_DELETE' |
    'DISCORD_USER_CREATE' | 'DISCORD_USER_UPDATE' |
    'DISCORD_GUILD_MEMBER_CREATE' | 'DISCORD_GUILD_MEMBER_UPDATE' |
    'BOT_STATE_CREATE' | 'BOT_STATE_UPDATE' |
    'TEAM_ENROLLMENT_CREATE' | 'TEAM_ENROLLMENT_UPDATE' | 'TEAM_ENROLLMENT_DELETE' |
    'USER_RATE_LIMIT_CREATE' | 'USER_RATE_LIMIT_UPDATE' |
    'TEAM_NAME_CHANGE_CREATE' | 'TEAM_ACTIVITY_LOG_CREATE';
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