import { Prisma } from '@prisma/client';
import { BaseService } from './baseService';
import { unifiedScreenshotService } from './unifiedScreenshotService';
import { buildDashboardWindow } from '../utils/dateRangeUtils';
import {
    AdminReviewFlaggedResult,
    AdminReviewMatchGroup,
    AdminReviewPlayerResult,
    AdminReviewQueueData,
    AdminReviewScreenshot,
} from '../types/adminReview';

interface ReviewQueryOptions {
    from?: string;
    to?: string;
    timezone?: string;
    preset?: string;
    page?: number;
    limit?: number;
}

type FlaggedResultRow = {
    id: string;
    quickMatchId: string;
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
    playerResults: unknown;
    updatedAt: Date;
};

function parsePlayerResults(raw: unknown): AdminReviewPlayerResult[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    return raw
        .map((entry) => {
            if (!entry || typeof entry !== 'object') {
                return null;
            }
            const row = entry as Record<string, unknown>;
            const playerName = String(row.playerName ?? row.name ?? '').trim();
            if (!playerName) {
                return null;
            }
            return {
                playerName,
                kills: Number(row.kills ?? row.finishes ?? 0) || 0,
            };
        })
        .filter((row): row is AdminReviewPlayerResult => row !== null);
}

function resolveReviewReason(result: FlaggedResultRow): string {
    if (result.needsReview) {
        return 'Missing kills — OCR could not read kill counts reliably for this team';
    }
    if (result.warningType) {
        return result.warningType.replace(/_/g, ' ').toLowerCase();
    }
    if (result.aiConfidence != null && result.aiConfidence < 0.6) {
        return 'Low roster-to-slot match confidence';
    }
    return 'Flagged for manual review';
}

export class AdminReviewService extends BaseService {
    async getReviewQueue(options: ReviewQueryOptions = {}): Promise<AdminReviewQueueData> {
        const window = buildDashboardWindow(options);
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(50, Math.max(1, options.limit ?? 20));
        const periodFilter = { gte: window.from, lte: window.to };

        const flaggedWhere: Prisma.QuickMatchResultWhereInput = {
            status: 'PROCESSED',
            updatedAt: periodFilter,
            OR: [
                { needsReview: true },
                { aiConfidence: { lt: 0.6 } },
                { warningType: { not: null } },
            ],
        };

        const [
            totalFlaggedResults,
            needsReviewCount,
            lowConfidenceCount,
            warningCount,
            distinctMatches,
        ] = await Promise.all([
            this.db.quickMatchResult.count({ where: flaggedWhere }),
            this.db.quickMatchResult.count({
                where: { ...flaggedWhere, needsReview: true },
            }),
            this.db.quickMatchResult.count({
                where: {
                    ...flaggedWhere,
                    aiConfidence: { lt: 0.6 },
                },
            }),
            this.db.quickMatchResult.count({
                where: {
                    ...flaggedWhere,
                    warningType: { not: null },
                },
            }),
            this.db.quickMatchResult.findMany({
                where: flaggedWhere,
                distinct: ['quickMatchId'],
                select: { quickMatchId: true },
                orderBy: { updatedAt: 'desc' },
            }),
        ]);

        const totalMatches = distinctMatches.length;
        const totalPages = Math.max(1, Math.ceil(totalMatches / limit));
        const matchIdsPage = distinctMatches
            .slice((page - 1) * limit, page * limit)
            .map((row) => row.quickMatchId);

        if (matchIdsPage.length === 0) {
            return {
                period: {
                    from: window.from.toISOString(),
                    to: window.to.toISOString(),
                    timezone: window.timezone,
                    preset: window.preset,
                    label: window.label,
                },
                summary: {
                    totalFlaggedResults,
                    totalMatches,
                    needsReviewCount,
                    lowConfidenceCount,
                    warningCount,
                },
                items: [],
                pagination: {
                    page,
                    limit,
                    totalMatches,
                    totalPages,
                },
                generatedAt: new Date().toISOString(),
            };
        }

        const [flaggedResults, matches, scanEvents] = await Promise.all([
            this.db.quickMatchResult.findMany({
                where: {
                    ...flaggedWhere,
                    quickMatchId: { in: matchIdsPage },
                },
                orderBy: [{ quickMatchId: 'asc' }, { slotNumber: 'asc' }],
            }),
            this.db.quickMatch.findMany({
                where: { id: { in: matchIdsPage } },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            fullName: true,
                            phoneNumber: true,
                        },
                    },
                },
            }),
            this.db.aiScanEvent.findMany({
                where: {
                    quickMatchId: { in: matchIdsPage },
                    success: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        const screenshotsByMatch = await this.loadScreenshotsByMatch(
            matchIdsPage,
            matches.map((m) => ({ id: m.id, userId: m.userId }))
        );

        const matchMap = new Map(matches.map((m) => [m.id, m]));
        const resultsByMatch = new Map<string, FlaggedResultRow[]>();
        for (const result of flaggedResults) {
            const bucket = resultsByMatch.get(result.quickMatchId) ?? [];
            bucket.push(result as FlaggedResultRow);
            resultsByMatch.set(result.quickMatchId, bucket);
        }

        const lastScanByMatch = new Map<string, { createdAt: Date; scanType: string }>();
        for (const scan of scanEvents) {
            if (!lastScanByMatch.has(scan.quickMatchId)) {
                lastScanByMatch.set(scan.quickMatchId, {
                    createdAt: scan.createdAt,
                    scanType: scan.scanType,
                });
            }
        }

        const items: AdminReviewMatchGroup[] = [];
        for (const matchId of matchIdsPage) {
            const match = matchMap.get(matchId);
            if (!match) {
                continue;
            }

            const rows = resultsByMatch.get(matchId) ?? [];
            const lastScan = lastScanByMatch.get(matchId);

            const flaggedResultItems: AdminReviewFlaggedResult[] = rows.map((row) => ({
                resultId: row.id,
                slotNumber: row.slotNumber,
                teamName: row.teamName,
                detectedTeamName: row.detectedTeamName,
                position: row.position,
                rank: row.rank,
                totalKills: row.totalKills,
                positionPoints: row.positionPoints,
                killPoints: row.killPoints,
                totalPoints: row.totalPoints,
                aiConfidence:
                    row.aiConfidence != null
                        ? Math.round(row.aiConfidence * 1000) / 1000
                        : null,
                needsReview: row.needsReview,
                warningType: row.warningType,
                entryNotes: row.entryNotes,
                reviewReason: resolveReviewReason(row),
                playerResults: parsePlayerResults(row.playerResults),
                updatedAt: row.updatedAt.toISOString(),
            }));

            items.push({
                quickMatchId: match.id,
                matchName: match.matchName,
                game: match.game,
                matchStatus: String(match.status),
                owner: {
                    id: match.user.id,
                    username: match.user.username,
                    fullName: match.user.fullName,
                    phoneNumber: match.user.phoneNumber,
                },
                lastScanAt: lastScan?.createdAt.toISOString() ?? null,
                lastScanType: lastScan?.scanType ?? null,
                screenshots: screenshotsByMatch.get(matchId) ?? [],
                flaggedResults: flaggedResultItems,
                flaggedCount: flaggedResultItems.length,
            });
        }

        return {
            period: {
                from: window.from.toISOString(),
                to: window.to.toISOString(),
                timezone: window.timezone,
                preset: window.preset,
                label: window.label,
            },
            summary: {
                totalFlaggedResults,
                totalMatches,
                needsReviewCount,
                lowConfidenceCount,
                warningCount,
            },
            items,
            pagination: {
                page,
                limit,
                totalMatches,
                totalPages,
            },
            generatedAt: new Date().toISOString(),
        };
    }

    private async loadScreenshotsByMatch(
        matchIds: string[],
        owners: Array<{ id: string; userId: string }>
    ): Promise<Map<string, AdminReviewScreenshot[]>> {
        const ownerByMatch = new Map(owners.map((o) => [o.id, o.userId]));
        const dbScreenshots = await this.db.quickScreenshot.findMany({
            where: { quickMatchId: { in: matchIds } },
            orderBy: [{ type: 'asc' }, { uploadedAt: 'asc' }],
        });

        const grouped = new Map<string, typeof dbScreenshots>();
        for (const shot of dbScreenshots) {
            const list = grouped.get(shot.quickMatchId) ?? [];
            list.push(shot);
            grouped.set(shot.quickMatchId, list);
        }

        const output = new Map<string, AdminReviewScreenshot[]>();

        await Promise.all(
            matchIds.map(async (matchId) => {
                const ownerUserId = ownerByMatch.get(matchId);
                const shots = grouped.get(matchId) ?? [];
                if (!ownerUserId || shots.length === 0) {
                    output.set(matchId, []);
                    return;
                }

                const withPreviews = await unifiedScreenshotService.attachQuickPtPreviewUrls(
                    shots.map((s) => ({
                        id: s.id,
                        quickMatchId: s.quickMatchId,
                        fileName: s.fileName,
                        storageUrl: s.storageUrl,
                        type: s.type,
                    })),
                    ownerUserId
                );

                output.set(
                    matchId,
                    withPreviews.map((s) => ({
                        id: s.id,
                        type: s.type,
                        originalName: shots.find((x) => x.id === s.id)?.originalName ?? '',
                        previewUrl: s.previewUrl,
                        signedUrl: s.signedUrl,
                        expiresAt: s.expiresAt,
                        uploadedAt:
                            shots.find((x) => x.id === s.id)?.uploadedAt.toISOString() ?? '',
                    }))
                );
            })
        );

        return output;
    }
}

export const adminReviewService = new AdminReviewService();
