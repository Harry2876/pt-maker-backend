import { Prisma, SubscriptionStatus } from '@prisma/client';
import { BaseService } from './baseService';
import { AdminDashboardData } from '../types/adminDashboard';
import { buildDashboardWindow, formatDateKey } from '../utils/dateRangeUtils';

interface DashboardQueryOptions {
    from?: string;
    to?: string;
    timezone?: string;
    preset?: string;
}

type DailyScanRow = {
    day: Date;
    scans: bigint | number;
    attendance: bigint | number;
    result: bigint | number;
    failed: bigint | number;
};

type DailyUserRow = {
    day: Date;
    new_users: bigint | number;
};

type DailyActiveRow = {
    day: Date;
    active_users: bigint | number;
};

type HourlyScanRow = {
    hour: number;
    count: bigint | number;
};

export class AdminDashboardService extends BaseService {
    async getDashboard(options: DashboardQueryOptions = {}): Promise<AdminDashboardData> {
        const window = buildDashboardWindow(options);
        const {
            from,
            to,
            timezone,
            preset,
            label,
            todayStart,
            todayEnd,
            yesterdayStart,
            yesterdayEnd,
        } = window;
        const periodFilter = { gte: from, lte: to };

        const [
            totalUsers,
            newInPeriod,
            newToday,
            dauToday,
            dauYesterday,
            activeUsersInPeriod,
            subscriptionCounts,
            scanSummary,
            scanTrend,
            scanPeakHours,
            reScans,
            ocrQuality,
            uploadsSummary,
            exportsSummary,
            revenueSummary,
            productSummary,
            userSignupTrend,
            userActiveTrend,
        ] = await Promise.all([
            this.db.user.count(),
            this.db.user.count({ where: { createdAt: periodFilter } }),
            this.db.user.count({
                where: { createdAt: { gte: todayStart, lt: todayEnd } },
            }),
            this.countDistinctActiveUsers(todayStart, todayEnd),
            this.countDistinctActiveUsers(yesterdayStart, yesterdayEnd),
            this.countDistinctActiveUsers(from, to),
            this.getSubscriptionCounts(),
            this.getScanSummary(periodFilter, todayStart, todayEnd),
            this.getScanTrend(from, to, timezone),
            this.getScanPeakHours(from, to, timezone),
            this.getReScanCount(from, to),
            this.getOcrQualitySummary(periodFilter, from, to, timezone),
            this.getUploadsSummary(periodFilter, todayStart, todayEnd),
            this.getExportsSummary(periodFilter),
            this.getRevenueSummary(periodFilter, todayStart, todayEnd),
            this.getProductSummary(periodFilter),
            this.getUserSignupTrend(from, to, timezone),
            this.getUserActiveTrend(from, to, timezone),
        ]);

        const userTrendMap = new Map<string, { newUsers: number; activeUsers: number }>();

        for (const row of userSignupTrend) {
            const key = formatDateKey(row.day);
            userTrendMap.set(key, {
                newUsers: Number(row.new_users),
                activeUsers: userTrendMap.get(key)?.activeUsers ?? 0,
            });
        }

        for (const row of userActiveTrend) {
            const key = formatDateKey(row.day);
            const existing = userTrendMap.get(key) ?? { newUsers: 0, activeUsers: 0 };
            userTrendMap.set(key, {
                ...existing,
                activeUsers: Number(row.active_users),
            });
        }

        const userTrend = Array.from(userTrendMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, values]) => ({ date, ...values }));

        const totalScans = Number(scanSummary.total_scans);
        const failedScans = Number(scanSummary.failed_scans);
        const successRate = totalScans > 0 ? (totalScans - failedScans) / totalScans : 1;

        return {
            period: {
                from: from.toISOString(),
                to: to.toISOString(),
                timezone,
                preset,
                label,
            },
            users: {
                total: totalUsers,
                newInPeriod,
                newToday,
                dauToday,
                dauYesterday,
                activeUsersInPeriod,
                proActive: subscriptionCounts.ACTIVE ?? 0,
                proInactive: subscriptionCounts.INACTIVE ?? 0,
                proPastDue: subscriptionCounts.PAST_DUE ?? 0,
                proCanceled: subscriptionCounts.CANCELED ?? 0,
                trend: userTrend,
            },
            ocrScans: {
                totalInPeriod: totalScans,
                today: Number(scanSummary.scans_today),
                attendance: Number(scanSummary.attendance_scans),
                result: Number(scanSummary.result_scans),
                failed: failedScans,
                successRate: Math.round(successRate * 1000) / 1000,
                reScans,
                totalImagesProcessed: Number(scanSummary.total_images_processed),
                avgImagesPerScan:
                    totalScans > 0
                        ? Math.round(
                              (Number(scanSummary.total_images_processed) / totalScans) * 100
                          ) / 100
                        : 0,
                avgProcessingTimeMs: scanSummary.avg_processing_time_ms
                    ? Math.round(Number(scanSummary.avg_processing_time_ms))
                    : null,
                trend: scanTrend.map((row) => ({
                    date: formatDateKey(row.day),
                    scans: Number(row.scans),
                    attendance: Number(row.attendance),
                    result: Number(row.result),
                    failed: Number(row.failed),
                })),
                peakHours: scanPeakHours.map((row) => ({
                    hour: Number(row.hour),
                    count: Number(row.count),
                })),
            },
            ocrQuality,
            uploads: uploadsSummary,
            exports: exportsSummary,
            revenue: revenueSummary,
            product: productSummary,
            generatedAt: new Date().toISOString(),
        };
    }

    private async countDistinctActiveUsers(from: Date, to: Date): Promise<number> {
        const rows = await this.db.$queryRaw<Array<{ count: bigint | number }>>(Prisma.sql`
            SELECT COUNT(DISTINCT uid)::bigint AS count
            FROM (
                SELECT "userId" AS uid
                FROM sessions
                WHERE "lastUsedAt" >= ${from} AND "lastUsedAt" < ${to}
                UNION
                SELECT "userId" AS uid
                FROM ai_scan_events
                WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
                UNION
                SELECT "userId" AS uid
                FROM quick_matches
                WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
            ) active_users
        `);

        return Number(rows[0]?.count ?? 0);
    }

    private async getSubscriptionCounts(): Promise<Record<SubscriptionStatus, number>> {
        const grouped = await this.db.user.groupBy({
            by: ['subscriptionStatus'],
            _count: { _all: true },
        });

        return grouped.reduce(
            (acc, row) => {
                acc[row.subscriptionStatus] = row._count._all;
                return acc;
            },
            {
                ACTIVE: 0,
                INACTIVE: 0,
                PAST_DUE: 0,
                CANCELED: 0,
            } as Record<SubscriptionStatus, number>
        );
    }

    private async getScanSummary(
        periodFilter: { gte: Date; lte: Date },
        todayStart: Date,
        todayEnd: Date
    ) {
        const rows = await this.db.$queryRaw<
            Array<{
                total_scans: bigint | number;
                scans_today: bigint | number;
                attendance_scans: bigint | number;
                result_scans: bigint | number;
                failed_scans: bigint | number;
                total_images_processed: bigint | number;
                avg_processing_time_ms: number | null;
            }>
        >(Prisma.sql`
            SELECT
                COUNT(*)::bigint AS total_scans,
                COUNT(*) FILTER (WHERE "createdAt" >= ${todayStart} AND "createdAt" < ${todayEnd})::bigint AS scans_today,
                COUNT(*) FILTER (WHERE "scanType" = 'ATTENDANCE')::bigint AS attendance_scans,
                COUNT(*) FILTER (WHERE "scanType" = 'RESULT')::bigint AS result_scans,
                COUNT(*) FILTER (WHERE success = false)::bigint AS failed_scans,
                COALESCE(SUM("imagesProcessed"), 0)::bigint AS total_images_processed,
                AVG("processingTimeMs") FILTER (WHERE "processingTimeMs" IS NOT NULL) AS avg_processing_time_ms
            FROM ai_scan_events
            WHERE "createdAt" >= ${periodFilter.gte} AND "createdAt" <= ${periodFilter.lte}
        `);

        return (
            rows[0] ?? {
                total_scans: 0,
                scans_today: 0,
                attendance_scans: 0,
                result_scans: 0,
                failed_scans: 0,
                total_images_processed: 0,
                avg_processing_time_ms: null,
            }
        );
    }

    private async getScanTrend(from: Date, to: Date, timezone: string): Promise<DailyScanRow[]> {
        return this.db.$queryRaw<DailyScanRow[]>(Prisma.sql`
            SELECT
                DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
                COUNT(*)::bigint AS scans,
                COUNT(*) FILTER (WHERE "scanType" = 'ATTENDANCE')::bigint AS attendance,
                COUNT(*) FILTER (WHERE "scanType" = 'RESULT')::bigint AS result,
                COUNT(*) FILTER (WHERE success = false)::bigint AS failed
            FROM ai_scan_events
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY 1
            ORDER BY 1
        `);
    }

    private async getScanPeakHours(from: Date, to: Date, timezone: string): Promise<HourlyScanRow[]> {
        return this.db.$queryRaw<HourlyScanRow[]>(Prisma.sql`
            SELECT
                EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::int AS hour,
                COUNT(*)::bigint AS count
            FROM ai_scan_events
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY 1
            ORDER BY 2 DESC, 1 ASC
        `);
    }

    private async getReScanCount(from: Date, to: Date): Promise<number> {
        const rows = await this.db.$queryRaw<Array<{ re_scans: bigint | number }>>(Prisma.sql`
            SELECT COALESCE(SUM(GREATEST(cnt - 1, 0)), 0)::bigint AS re_scans
            FROM (
                SELECT "quickMatchId", "scanType", COUNT(*)::int AS cnt
                FROM ai_scan_events
                WHERE success = true
                  AND "createdAt" >= ${from}
                  AND "createdAt" <= ${to}
                GROUP BY "quickMatchId", "scanType"
            ) grouped
        `);

        return Number(rows[0]?.re_scans ?? 0);
    }

    private async getOcrQualitySummary(
        periodFilter: { gte: Date; lte: Date },
        from: Date,
        to: Date,
        timezone: string
    ) {
        const aiWhere = {
            aiConfidence: { not: null },
            updatedAt: periodFilter,
            status: 'PROCESSED' as const,
        };

        const [
            confidenceAgg,
            needsReviewCount,
            manualEntryCount,
            aiProcessedCount,
            confidenceBuckets,
            confidenceTrend,
        ] = await Promise.all([
            this.db.quickMatchResult.aggregate({
                where: aiWhere,
                _avg: { aiConfidence: true },
                _min: { aiConfidence: true },
                _max: { aiConfidence: true },
            }),
            this.db.quickMatchResult.count({
                where: {
                    needsReview: true,
                    updatedAt: periodFilter,
                },
            }),
            this.db.quickMatchResult.count({
                where: {
                    status: 'MANUAL_ENTRY',
                    updatedAt: periodFilter,
                },
            }),
            this.db.quickMatchResult.count({
                where: aiWhere,
            }),
            this.db.$queryRaw<
                Array<{
                    high_count: bigint | number;
                    medium_count: bigint | number;
                    low_count: bigint | number;
                }>
            >(Prisma.sql`
                SELECT
                    COUNT(*) FILTER (WHERE "aiConfidence" >= 0.85)::bigint AS high_count,
                    COUNT(*) FILTER (WHERE "aiConfidence" >= 0.6 AND "aiConfidence" < 0.85)::bigint AS medium_count,
                    COUNT(*) FILTER (WHERE "aiConfidence" < 0.6)::bigint AS low_count
                FROM quick_match_results
                WHERE "aiConfidence" IS NOT NULL
                  AND status = 'PROCESSED'
                  AND "updatedAt" >= ${periodFilter.gte}
                  AND "updatedAt" <= ${periodFilter.lte}
            `),
            this.db.$queryRaw<
                Array<{
                    day: Date;
                    avg_confidence: number | null;
                    result_count: bigint | number;
                }>
            >(Prisma.sql`
                SELECT
                    DATE(("updatedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
                    AVG("aiConfidence") AS avg_confidence,
                    COUNT(*)::bigint AS result_count
                FROM quick_match_results
                WHERE "aiConfidence" IS NOT NULL
                  AND status = 'PROCESSED'
                  AND "updatedAt" >= ${from}
                  AND "updatedAt" <= ${to}
                GROUP BY 1
                ORDER BY 1
            `),
        ]);

        const highConfidenceCount = Number(confidenceBuckets[0]?.high_count ?? 0);
        const mediumConfidenceCount = Number(confidenceBuckets[0]?.medium_count ?? 0);
        const lowConfidenceCount = Number(confidenceBuckets[0]?.low_count ?? 0);
        const needsReviewRate =
            aiProcessedCount > 0 ? needsReviewCount / aiProcessedCount : 0;
        const lowConfidenceRate =
            aiProcessedCount > 0 ? lowConfidenceCount / aiProcessedCount : 0;

        return {
            avgConfidence: confidenceAgg._avg.aiConfidence
                ? Math.round(confidenceAgg._avg.aiConfidence * 1000) / 1000
                : null,
            minConfidence: confidenceAgg._min.aiConfidence
                ? Math.round(confidenceAgg._min.aiConfidence * 1000) / 1000
                : null,
            maxConfidence: confidenceAgg._max.aiConfidence
                ? Math.round(confidenceAgg._max.aiConfidence * 1000) / 1000
                : null,
            highConfidenceCount,
            mediumConfidenceCount,
            lowConfidenceCount,
            needsReviewCount,
            needsReviewRate: Math.round(needsReviewRate * 1000) / 1000,
            manualEntryCount,
            aiProcessedCount,
            lowConfidenceRate: Math.round(lowConfidenceRate * 1000) / 1000,
            trend: confidenceTrend.map((row) => ({
                date: formatDateKey(row.day),
                avgConfidence:
                    row.avg_confidence != null
                        ? Math.round(Number(row.avg_confidence) * 1000) / 1000
                        : null,
                resultCount: Number(row.result_count),
            })),
        };
    }

    private async getUploadsSummary(
        periodFilter: { gte: Date; lte: Date },
        todayStart: Date,
        todayEnd: Date
    ) {
        const [screenshotsInPeriod, screenshotsToday, attendanceScreenshots, resultScreenshots] =
            await Promise.all([
                this.db.quickScreenshot.count({
                    where: { uploadedAt: periodFilter },
                }),
                this.db.quickScreenshot.count({
                    where: { uploadedAt: { gte: todayStart, lt: todayEnd } },
                }),
                this.db.quickScreenshot.count({
                    where: { uploadedAt: periodFilter, type: 'ATTENDANCE' },
                }),
                this.db.quickScreenshot.count({
                    where: { uploadedAt: periodFilter, type: 'RESULT' },
                }),
            ]);

        return {
            screenshotsInPeriod,
            screenshotsToday,
            attendanceScreenshots,
            resultScreenshots,
        };
    }

    private async getExportsSummary(periodFilter: { gte: Date; lte: Date }) {
        const [standingsGenerated, cropsProcessed, graphicsGenerated] = await Promise.all([
            this.db.quickPointsTable.count({
                where: { createdAt: periodFilter },
            }),
            this.db.quickMatchCrop.count({
                where: { createdAt: periodFilter },
            }),
            this.db.quickMediaAsset.count({
                where: {
                    createdAt: periodFilter,
                    assetType: {
                        in: [
                            'STANDINGS',
                            'SLOT_LIST',
                            'ROSTER',
                            'TOP_10',
                            'SERIES_STANDINGS',
                        ],
                    },
                },
            }),
        ]);

        return {
            standingsGenerated,
            cropsProcessed,
            graphicsGenerated,
        };
    }

    private async getRevenueSummary(
        periodFilter: { gte: Date; lte: Date },
        todayStart: Date,
        todayEnd: Date
    ) {
        const [paymentAgg, paymentsToday, activeSubscriptions] = await Promise.all([
            this.db.payment.aggregate({
                where: {
                    status: 'SUCCEEDED',
                    createdAt: periodFilter,
                },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            this.db.payment.count({
                where: {
                    status: 'SUCCEEDED',
                    createdAt: { gte: todayStart, lt: todayEnd },
                },
            }),
            this.db.user.count({
                where: { subscriptionStatus: 'ACTIVE' },
            }),
        ]);

        return {
            totalRevenueInPeriod: paymentAgg._sum.amount ?? 0,
            paymentsInPeriod: paymentAgg._count._all,
            paymentsToday,
            activeSubscriptions,
        };
    }

    private async getProductSummary(periodFilter: { gte: Date; lte: Date }) {
        const [
            quickMatchesCreated,
            quickMatchesCompleted,
            quickMatchesErrored,
            seriesCreated,
            seriesCompleted,
        ] = await Promise.all([
            this.db.quickMatch.count({ where: { createdAt: periodFilter } }),
            this.db.quickMatch.count({
                where: { status: 'COMPLETED', updatedAt: periodFilter },
            }),
            this.db.quickMatch.count({
                where: { status: 'ERROR', updatedAt: periodFilter },
            }),
            this.db.quickTournamentSeries.count({ where: { createdAt: periodFilter } }),
            this.db.quickTournamentSeries.count({
                where: { status: 'COMPLETED', updatedAt: periodFilter },
            }),
        ]);

        return {
            quickMatchesCreated,
            quickMatchesCompleted,
            quickMatchesErrored,
            seriesCreated,
            seriesCompleted,
        };
    }

    private async getUserSignupTrend(
        from: Date,
        to: Date,
        timezone: string
    ): Promise<DailyUserRow[]> {
        return this.db.$queryRaw<DailyUserRow[]>(Prisma.sql`
            SELECT
                DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
                COUNT(*)::bigint AS new_users
            FROM users
            WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            GROUP BY 1
            ORDER BY 1
        `);
    }

    private async getUserActiveTrend(
        from: Date,
        to: Date,
        timezone: string
    ): Promise<DailyActiveRow[]> {
        return this.db.$queryRaw<DailyActiveRow[]>(Prisma.sql`
            SELECT day, COUNT(DISTINCT uid)::bigint AS active_users
            FROM (
                SELECT
                    DATE(("lastUsedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
                    "userId" AS uid
                FROM sessions
                WHERE "lastUsedAt" >= ${from} AND "lastUsedAt" <= ${to}
                UNION ALL
                SELECT
                    DATE(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}) AS day,
                    "userId" AS uid
                FROM ai_scan_events
                WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}
            ) daily_activity
            GROUP BY day
            ORDER BY day
        `);
    }
}

export const adminDashboardService = new AdminDashboardService();
