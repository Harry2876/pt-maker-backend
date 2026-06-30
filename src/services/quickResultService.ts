import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickSlotService } from './quickSlotService';
import { QuickMatchResultCache, CreateQuickMatchResultData } from '../types/quickResult';
import { sortMatchResultsForStandings } from '../utils/standingsSort';
import { QuickMatchCache } from '../types/quickMatch';
import {
    CreateManualResultData,
    UpdateManualResultData,
    ValidationResult,
    ValidationError,
    ValidationWarning,
    PointsBreakdown,
    BulkResultCreationData,
    BulkOperationResult
} from '../types/manualResult';
import { ServiceError } from '../utils/serviceError';

export interface PersistResultOptions {
    status?: QuickMatchResultCache['status'];
    /** When true, upsert by slotNumber (AI re-processing). When false, reject duplicate slots. */
    upsert?: boolean;
    /** Skip match completion side-effects (used during bulk create). */
    skipFinalize?: boolean;
}

export class QuickResultService extends BaseService {
    private readonly CACHE_TTL = 600;

    /**
     * Single write path for AI + manual results — Postgres first, Redis cache second.
     */
    async persistResult(
        quickMatchId: string,
        userId: string,
        data: CreateQuickMatchResultData,
        options: PersistResultOptions = {}
    ): Promise<QuickMatchResultCache> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const status = options.status ?? 'PENDING';
        const rank = data.rank ?? data.position;
        const now = new Date();

        const existing = await this.db.quickMatchResult.findUnique({
            where: {
                quickMatchId_slotNumber: { quickMatchId, slotNumber: data.slotNumber },
            },
        });

        if (existing && !options.upsert) {
            throw new ServiceError(
                `Slot ${data.slotNumber} already has a result`,
                409,
                'DUPLICATE_SLOT'
            );
        }

        const dbPayload = {
            slotNumber: data.slotNumber,
            teamName: data.teamName,
            detectedTeamName: data.detectedTeamName ?? data.teamName,
            position: data.position,
            rank,
            totalKills: data.totalKills,
            positionPoints: data.positionPoints,
            killPoints: data.killPoints,
            totalPoints: data.totalPoints,
            playerResults: data.playerResults
                ? JSON.parse(JSON.stringify(data.playerResults))
                : undefined,
            status,
            warningType: data.warningType ?? null,
            needsReview: data.needsReview ?? false,
            aiConfidence: data.aiConfidence ?? null,
            updatedAt: now,
        };

        const dbResult = existing
            ? await this.db.quickMatchResult.update({
                  where: { id: existing.id },
                  data: dbPayload,
              })
            : await this.db.quickMatchResult.create({
                  data: {
                      id: randomUUID(),
                      quickMatchId,
                      ...dbPayload,
                      createdAt: now,
                  },
              });

        const result = this.convertDbToCache(dbResult);
        await this.cacheResult(result);

        this.logger.info(
            `${existing ? 'Updated' : 'Created'} result for slot ${data.slotNumber} (${data.teamName})`
        );
        return result;
    }

    /**
     * Remove AI-processed results before a fresh OCR run.
     * Manual entries (MANUAL_ENTRY, VERIFIED) are preserved.
     */
    async deleteProcessedResults(quickMatchId: string, userId: string): Promise<number> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const processed = await this.db.quickMatchResult.findMany({
            where: { quickMatchId, status: 'PROCESSED' },
            select: { id: true },
        });

        if (processed.length === 0) {
            return 0;
        }

        await this.db.quickMatchResult.deleteMany({
            where: { quickMatchId, status: 'PROCESSED' },
        });

        await Promise.all(processed.map((r) => redis.delete(`quickResult:${r.id}`)));
        const remainingIds = await redis.smembers(`quickMatch:${quickMatchId}:results`);
        const processedIdSet = new Set(processed.map((r) => r.id));
        await Promise.all(
            remainingIds
                .filter((id) => processedIdSet.has(id))
                .map((id) => redis.srem(`quickMatch:${quickMatchId}:results`, id))
        );

        this.logger.info(`Deleted ${processed.length} PROCESSED result(s) for match ${quickMatchId}`);
        return processed.length;
    }

    /**
     * Get all results for a match — always reads from Postgres (source of truth).
     */
    async getMatchResults(quickMatchId: string, userId: string): Promise<QuickMatchResultCache[]> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const dbResults = await this.db.quickMatchResult.findMany({
            where: { quickMatchId },
        });

        const results = sortMatchResultsForStandings(dbResults.map((r) => this.convertDbToCache(r)));
        await Promise.all(results.map((r) => this.cacheResult(r)));
        return results;
    }

    async getResultById(resultId: string, userId: string): Promise<QuickMatchResultCache | null> {
        const dbResult = await this.db.quickMatchResult.findUnique({ where: { id: resultId } });
        if (!dbResult) return null;

        const quickMatch = await quickMatchService.getQuickMatchById(dbResult.quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const result = this.convertDbToCache(dbResult);
        await this.cacheResult(result);
        return result;
    }

    async createManualResult(
        quickMatchId: string,
        userId: string,
        data: CreateManualResultData,
        options: { skipFinalize?: boolean } = {}
    ): Promise<QuickMatchResultCache> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        await this.ensureSlotExists(quickMatchId, userId, data.slotNumber, data.teamName);

        const validation = await this.validateResultConstraints(quickMatchId, data);
        if (!validation.isValid) {
            const first = validation.errors[0];
            throw new ServiceError(first.message, 400, first.code);
        }

        const pointsBreakdown = await this.recalculatePoints(data, quickMatch);
        const rank = data.rank ?? data.position;

        const result = await this.persistResult(
            quickMatchId,
            userId,
            {
                slotNumber: data.slotNumber,
                teamName: data.teamName,
                detectedTeamName: data.teamName,
                position: data.position,
                rank,
                totalKills: data.totalKills,
                positionPoints: pointsBreakdown.positionPoints,
                killPoints: pointsBreakdown.killPoints,
                totalPoints: pointsBreakdown.totalPoints,
                playerResults: data.playerResults,
                needsReview: false,
            },
            { status: 'MANUAL_ENTRY' }
        );

        if (!options.skipFinalize) {
            await this.finalizeMatchAfterResults(quickMatchId, userId);
        }

        return result;
    }

    async updateManualResult(
        resultId: string,
        userId: string,
        data: UpdateManualResultData
    ): Promise<QuickMatchResultCache | null> {
        const existing = await this.getResultById(resultId, userId);
        if (!existing) {
            throw new ServiceError('Result not found', 404, 'NOT_FOUND');
        }

        const quickMatch = await quickMatchService.getQuickMatchById(existing.quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const validation = await this.validateResultConstraints(
            existing.quickMatchId,
            { ...existing, ...data },
            resultId
        );
        if (!validation.isValid) {
            const first = validation.errors[0];
            throw new ServiceError(first.message, 400, first.code);
        }

        let positionPoints = existing.positionPoints;
        let killPoints = existing.killPoints;
        let totalPoints = existing.totalPoints;

        if (data.position !== undefined || data.totalKills !== undefined) {
            const breakdown = await this.recalculatePoints({ ...existing, ...data }, quickMatch);
            positionPoints = breakdown.positionPoints;
            killPoints = breakdown.killPoints;
            totalPoints = breakdown.totalPoints;
        }

        const dbResult = await this.db.quickMatchResult.update({
            where: { id: resultId },
            data: {
                ...(data.teamName !== undefined && { teamName: data.teamName }),
                ...(data.position !== undefined && {
                    position: data.position,
                    rank: data.rank ?? data.position,
                }),
                ...(data.rank !== undefined && data.position === undefined && { rank: data.rank }),
                ...(data.totalKills !== undefined && { totalKills: data.totalKills }),
                ...(data.playerResults !== undefined && {
                    playerResults: JSON.parse(JSON.stringify(data.playerResults)),
                }),
                positionPoints,
                killPoints,
                totalPoints,
                status: 'MANUAL_ENTRY',
                updatedAt: new Date(),
            },
        });

        const updated = this.convertDbToCache(dbResult);
        await this.cacheResult(updated);
        await this.refreshSeriesLeaderboardIfNeeded(existing.quickMatchId, userId);
        return updated;
    }

    async deleteResult(resultId: string, userId: string): Promise<void> {
        const existing = await this.getResultById(resultId, userId);
        if (!existing) {
            throw new ServiceError('Result not found', 404, 'NOT_FOUND');
        }

        await this.db.quickMatchResult.delete({ where: { id: resultId } });
        await redis.delete(`quickResult:${resultId}`);
        await redis.srem(`quickMatch:${existing.quickMatchId}:results`, resultId);
        await this.refreshSeriesLeaderboardIfNeeded(existing.quickMatchId, userId);
    }

    async createBulkManualResults(
        quickMatchId: string,
        userId: string,
        data: BulkResultCreationData
    ): Promise<BulkOperationResult> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const result: BulkOperationResult = {
            success: true,
            created: [],
            updated: [],
            errors: [],
            summary: { total: data.results.length, successful: 0, failed: 0 },
        };

        if (data.replaceExisting) {
            await this.db.quickMatchResult.deleteMany({ where: { quickMatchId } });
            const staleIds = await redis.smembers(`quickMatch:${quickMatchId}:results`);
            await Promise.all(staleIds.map((id) => redis.delete(`quickResult:${id}`)));
            await redis.delete(`quickMatch:${quickMatchId}:results`);
        }

        for (const resultData of data.results) {
            try {
                if (data.validateConstraints) {
                    await this.ensureSlotExists(
                        quickMatchId,
                        userId,
                        resultData.slotNumber,
                        resultData.teamName
                    );
                    const validation = await this.validateResultConstraints(quickMatchId, resultData);
                    if (!validation.isValid) {
                        result.errors.push(...validation.errors);
                        result.summary.failed++;
                        continue;
                    }
                }

                const created = await this.createManualResult(quickMatchId, userId, {
                    ...resultData,
                    source: 'MANUAL_ENTRY',
                    entryMethod: 'BULK',
                    enteredBy: userId,
                }, { skipFinalize: true });

                result.created.push(created);
                result.summary.successful++;
            } catch (error) {
                result.errors.push({
                    field: 'general',
                    code: error instanceof ServiceError ? error.code : 'CREATION_ERROR',
                    message: `Failed to create result for slot ${resultData.slotNumber}: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                    value: resultData.slotNumber,
                });
                result.summary.failed++;
            }
        }

        if (result.errors.length > 0 && result.created.length === 0) {
            result.success = false;
        }

        if (result.created.length > 0) {
            await this.finalizeMatchAfterResults(quickMatchId, userId);
        }

        return result;
    }

    async updateBulkManualResults(
        quickMatchId: string,
        userId: string,
        updates: Array<{ resultId: string; data: UpdateManualResultData }>
    ): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            created: [],
            updated: [],
            errors: [],
            summary: { total: updates.length, successful: 0, failed: 0 },
        };

        for (const updateItem of updates) {
            try {
                const updatedResult = await this.updateManualResult(
                    updateItem.resultId,
                    userId,
                    updateItem.data
                );
                if (updatedResult) {
                    result.updated.push(updatedResult);
                    result.summary.successful++;
                }
            } catch (error) {
                result.errors.push({
                    field: 'resultId',
                    code: error instanceof ServiceError ? error.code : 'UPDATE_ERROR',
                    message: `Failed to update result ${updateItem.resultId}: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                    value: updateItem.resultId,
                });
                result.summary.failed++;
            }
        }

        if (result.errors.length > 0 && result.updated.length === 0) {
            result.success = false;
        }

        if (result.updated.length > 0) {
            await this.refreshSeriesLeaderboardIfNeeded(quickMatchId, userId);
        }
        return result;
    }

    async deleteBulkManualResults(
        quickMatchId: string,
        userId: string,
        resultIds: string[]
    ): Promise<BulkOperationResult> {
        const result: BulkOperationResult = {
            success: true,
            created: [],
            updated: [],
            errors: [],
            summary: { total: resultIds.length, successful: 0, failed: 0 },
        };

        for (const resultId of resultIds) {
            try {
                await this.deleteResult(resultId, userId);
                result.summary.successful++;
            } catch (error) {
                result.errors.push({
                    field: 'resultId',
                    code: error instanceof ServiceError ? error.code : 'DELETE_ERROR',
                    message: `Failed to delete result ${resultId}: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                    value: resultId,
                });
                result.summary.failed++;
            }
        }

        result.success = result.summary.successful > 0;
        return result;
    }

    async validateResultConstraints(
        quickMatchId: string,
        data: CreateManualResultData | UpdateManualResultData,
        excludeResultId?: string
    ): Promise<ValidationResult> {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        const existingResults = await this.db.quickMatchResult.findMany({
            where: {
                quickMatchId,
                ...(excludeResultId ? { id: { not: excludeResultId } } : {}),
            },
            select: { id: true, position: true, slotNumber: true, teamName: true },
        });

        if ('position' in data && data.position !== undefined) {
            const conflict = existingResults.find((r) => r.position === data.position);
            if (conflict) {
                errors.push({
                    field: 'position',
                    code: 'DUPLICATE_POSITION',
                    message: `Position ${data.position} is already taken by ${conflict.teamName}`,
                    value: data.position,
                });
            }
        }

        if ('slotNumber' in data && data.slotNumber !== undefined) {
            const conflict = existingResults.find((r) => r.slotNumber === data.slotNumber);
            if (conflict) {
                errors.push({
                    field: 'slotNumber',
                    code: 'DUPLICATE_SLOT',
                    message: `Slot ${data.slotNumber} already has a result`,
                    value: data.slotNumber,
                });
            }
        }

        if (data.playerResults && data.playerResults.length > 0 && 'totalKills' in data) {
            const totalPlayerKills = data.playerResults.reduce((sum, p) => sum + p.kills, 0);
            if (data.totalKills !== undefined && totalPlayerKills !== data.totalKills) {
                warnings.push({
                    type: 'KILLS_MISMATCH',
                    message: `Individual player kills (${totalPlayerKills}) don't match total kills (${data.totalKills})`,
                });
            }
        }

        return { isValid: errors.length === 0, errors, warnings };
    }

    async recalculatePoints(
        result: CreateManualResultData | UpdateManualResultData,
        match: QuickMatchCache
    ): Promise<PointsBreakdown> {
        const positionPointsConfig = match.positionPointsConfig || [20, 15, 12, 10, 8, 6, 4, 2, 1, 0];
        const killPointsValue = match.killPointsValue || 1;
        const position = result.position ?? 25;
        const totalKills = result.totalKills ?? 0;
        const positionIndex = Math.min(Math.max(position - 1, 0), positionPointsConfig.length - 1);
        const positionPoints = positionPointsConfig[positionIndex] || 0;
        const killPoints = totalKills * killPointsValue;

        return {
            positionPoints,
            killPoints,
            totalPoints: positionPoints + killPoints,
            calculation: {
                position,
                positionValue: positionPoints,
                totalKills,
                killValue: killPointsValue,
            },
        };
    }

    private async ensureSlotExists(
        quickMatchId: string,
        userId: string,
        slotNumber: number,
        teamName: string
    ): Promise<void> {
        const slot = await quickSlotService.getSlotByNumber(quickMatchId, slotNumber);
        if (!slot) {
            await quickSlotService.createSlot(quickMatchId, userId, { slotNumber, teamName });
        }
    }

    private async finalizeMatchAfterResults(quickMatchId: string, userId: string): Promise<void> {
        await quickMatchService.updateQuickMatch(quickMatchId, userId, { status: 'COMPLETED' });
        await this.refreshSeriesLeaderboardIfNeeded(quickMatchId, userId);
    }

    private async refreshSeriesLeaderboardIfNeeded(quickMatchId: string, userId: string): Promise<void> {
        const { quickSeriesService } = await import('./quickSeriesService');
        await quickSeriesService.refreshSeriesForMatch(quickMatchId, userId);
    }

    private async cacheResult(result: QuickMatchResultCache): Promise<void> {
        await redis.hsetObject(`quickResult:${result.id}`, result, this.CACHE_TTL);
        await redis.sadd(`quickMatch:${result.quickMatchId}:results`, result.id);
    }

    private convertDbToCache(dbResult: any): QuickMatchResultCache {
        return {
            id: dbResult.id,
            quickMatchId: dbResult.quickMatchId,
            slotNumber: dbResult.slotNumber,
            teamName: dbResult.teamName,
            detectedTeamName: dbResult.detectedTeamName || undefined,
            position: dbResult.position,
            rank: dbResult.rank,
            totalKills: dbResult.totalKills,
            positionPoints: dbResult.positionPoints,
            killPoints: dbResult.killPoints,
            totalPoints: dbResult.totalPoints,
            playerResults: dbResult.playerResults
                ? JSON.parse(JSON.stringify(dbResult.playerResults))
                : undefined,
            status: dbResult.status,
            warningType: dbResult.warningType || undefined,
            needsReview: dbResult.needsReview,
            aiConfidence: dbResult.aiConfidence ?? undefined,
            createdAt: dbResult.createdAt.toISOString(),
            updatedAt: dbResult.updatedAt.toISOString(),
            dbStatus: 'SYNCED',
        };
    }
}

export const quickResultService = new QuickResultService();
