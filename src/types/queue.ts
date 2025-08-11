export interface ScreenshotProcessingJob {
    matchId : string;
    screenshotUrls : string[];
    templateId? : string;
    userId : string;
}

export interface OTPSendingJob {
    phoneNumber: string;
    otp: string;
    type: 'registration' | 'forgot_password';
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
    operations : {
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