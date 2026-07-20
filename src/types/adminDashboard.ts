export interface DashboardDateBucket {
    date: string;
    count: number;
}

export interface DashboardHourBucket {
    hour: number;
    count: number;
}

export interface AdminDashboardPeriod {
    from: string;
    to: string;
    timezone: string;
    preset: 'today' | 'yesterday' | 'week' | 'month' | 'custom';
    label: string;
}

export interface AdminDashboardData {
    period: AdminDashboardPeriod;
    users: {
        total: number;
        newInPeriod: number;
        newToday: number;
        dauToday: number;
        dauYesterday: number;
        activeUsersInPeriod: number;
        proActive: number;
        proInactive: number;
        proPastDue: number;
        proCanceled: number;
        trend: Array<{ date: string; newUsers: number; activeUsers: number }>;
    };
    ocrScans: {
        totalInPeriod: number;
        today: number;
        attendance: number;
        result: number;
        failed: number;
        successRate: number;
        reScans: number;
        totalImagesProcessed: number;
        avgImagesPerScan: number;
        avgProcessingTimeMs: number | null;
        trend: Array<{ date: string; scans: number; attendance: number; result: number; failed: number }>;
        peakHours: DashboardHourBucket[];
    };
    ocrQuality: {
        avgConfidence: number | null;
        minConfidence: number | null;
        maxConfidence: number | null;
        highConfidenceCount: number;
        mediumConfidenceCount: number;
        lowConfidenceCount: number;
        needsReviewCount: number;
        needsReviewRate: number;
        manualEntryCount: number;
        aiProcessedCount: number;
        lowConfidenceRate: number;
        trend: Array<{ date: string; avgConfidence: number | null; resultCount: number }>;
    };
    uploads: {
        screenshotsInPeriod: number;
        screenshotsToday: number;
        attendanceScreenshots: number;
        resultScreenshots: number;
    };
    exports: {
        standingsGenerated: number;
        cropsProcessed: number;
        graphicsGenerated: number;
    };
    revenue: {
        totalRevenueInPeriod: number;
        paymentsInPeriod: number;
        paymentsToday: number;
        activeSubscriptions: number;
    };
    product: {
        quickMatchesCreated: number;
        quickMatchesCompleted: number;
        quickMatchesErrored: number;
        seriesCreated: number;
        seriesCompleted: number;
    };
    generatedAt: string;
}
