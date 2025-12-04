import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { QuickPointsTableCache } from '../types/quickResult';

export interface CreatePointsTableData {
    quickMatchId: string;
    tableImageUrl?: string;
    csvData?: any;
    template: string;
    generationTimeMs?: number;
}

export interface UpdatePointsTableData {
    tableImageUrl?: string;
    csvData?: any;
    template?: string;
    expiresAt?: string;
}

export class QuickPointsTableService extends BaseService {
    private CACHE_TTL = 3600; // 1 hour

    /**
     * Create a points table record
     */
    async createPointsTable(
        userId: string,
        data: CreatePointsTableData
    ): Promise<QuickPointsTableCache> {
        try {
            // 1. Verify match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(data.quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Generate points table ID
            const pointsTableId = randomUUID();

            // 3. Create points table object
            const pointsTable: QuickPointsTableCache = {
                id: pointsTableId,
                quickMatchId: data.quickMatchId,
                tableImageUrl: data.tableImageUrl,
                csvData: data.csvData,
                pngGeneratedAt: data.tableImageUrl ? new Date().toISOString() : undefined,
                generationTimeMs: data.generationTimeMs,
                template: data.template,
                expiresAt: this.calculateExpiryDate(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Store in Redis
            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, pointsTable, this.CACHE_TTL);
            await redis.set(`quickMatch:${data.quickMatchId}:pointsTable`, pointsTableId, this.CACHE_TTL);

            // 5. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_POINTS_TABLE', 'CREATE', pointsTableId, pointsTable, userId);

            this.logger.info(`Points table ${pointsTableId} created for Quick Match ${data.quickMatchId}`);
            return pointsTable;

        } catch (error) {
            this.handleError(error, 'Create Points Table');
            throw error;
        }
    }

    /**
     * Get points table by ID
     */
    async getPointsTableById(
        pointsTableId: string,
        userId: string
    ): Promise<QuickPointsTableCache | null> {
        try {
            // 1. Check Redis cache first
            const cached = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${pointsTableId}`);
            
            if (cached) {
                // Verify ownership via match
                const quickMatch = await quickMatchService.getQuickMatchById(cached.quickMatchId, userId);
                if (!quickMatch) {
                    throw new Error('Access denied to this points table');
                }
                return cached;
            }

            // 2. Fallback to database
            const dbPointsTable = await this.db.quickPointsTable.findUnique({
                where: { id: pointsTableId },
                include: {
                    quickMatch: {
                        select: { userId: true }
                    }
                }
            });

            if (!dbPointsTable || dbPointsTable.quickMatch.userId !== userId) {
                return null;
            }

            // 3. Convert to cache format
            const pointsTable: QuickPointsTableCache = {
                id: dbPointsTable.id,
                quickMatchId: dbPointsTable.quickMatchId,
                tableImageUrl: dbPointsTable.tableImageUrl || undefined,
                csvData: dbPointsTable.csvData,
                pngGeneratedAt: dbPointsTable.pngGeneratedAt?.toISOString(),
                generationTimeMs: dbPointsTable.generationTimeMs || undefined,
                template: dbPointsTable.template,
                expiresAt: dbPointsTable.expiresAt?.toISOString(),
                createdAt: dbPointsTable.createdAt.toISOString(),
                updatedAt: dbPointsTable.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // 4. Cache it
            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, pointsTable, this.CACHE_TTL);

            return pointsTable;

        } catch (error) {
            this.handleError(error, 'Get Points Table by ID');
            return null;
        }
    }

    /**
     * Get points table for a Quick Match
     */
    async getPointsTableByMatchId(
        quickMatchId: string,
        userId: string
    ): Promise<QuickPointsTableCache | null> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Check Redis cache first
            const cachedId = await redis.get(`quickMatch:${quickMatchId}:pointsTable`);
            if (cachedId) {
                const cached = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${cachedId}`);
                if (cached) {
                    return cached;
                }
            }

            // 3. Fallback to database (get latest)
            const dbPointsTable = await this.db.quickPointsTable.findFirst({
                where: { quickMatchId },
                orderBy: { createdAt: 'desc' }
            });

            if (!dbPointsTable) {
                return null;
            }

            // 4. Convert to cache format
            const pointsTable: QuickPointsTableCache = {
                id: dbPointsTable.id,
                quickMatchId: dbPointsTable.quickMatchId,
                tableImageUrl: dbPointsTable.tableImageUrl || undefined,
                csvData: dbPointsTable.csvData,
                pngGeneratedAt: dbPointsTable.pngGeneratedAt?.toISOString(),
                generationTimeMs: dbPointsTable.generationTimeMs || undefined,
                template: dbPointsTable.template,
                expiresAt: dbPointsTable.expiresAt?.toISOString(),
                createdAt: dbPointsTable.createdAt.toISOString(),
                updatedAt: dbPointsTable.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // 5. Cache it
            await redis.hsetObject(`quickPointsTable:${pointsTable.id}`, pointsTable, this.CACHE_TTL);
            await redis.set(`quickMatch:${quickMatchId}:pointsTable`, pointsTable.id, this.CACHE_TTL);

            return pointsTable;

        } catch (error) {
            this.handleError(error, 'Get Points Table by Match ID');
            return null;
        }
    }

    /**
     * List all points tables for a Quick Match
     */
    async listPointsTablesForMatch(
        quickMatchId: string,
        userId: string
    ): Promise<QuickPointsTableCache[]> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get from database
            const dbPointsTables = await this.db.quickPointsTable.findMany({
                where: { quickMatchId },
                orderBy: { createdAt: 'desc' }
            });

            // 3. Convert to cache format
            const pointsTables: QuickPointsTableCache[] = dbPointsTables.map(dbPointsTable => ({
                id: dbPointsTable.id,
                quickMatchId: dbPointsTable.quickMatchId,
                tableImageUrl: dbPointsTable.tableImageUrl || undefined,
                csvData: dbPointsTable.csvData,
                pngGeneratedAt: dbPointsTable.pngGeneratedAt?.toISOString(),
                generationTimeMs: dbPointsTable.generationTimeMs || undefined,
                template: dbPointsTable.template,
                expiresAt: dbPointsTable.expiresAt?.toISOString(),
                createdAt: dbPointsTable.createdAt.toISOString(),
                updatedAt: dbPointsTable.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            }));

            return pointsTables;

        } catch (error) {
            this.handleError(error, 'List Points Tables for Match');
            throw error;
        }
    }

    /**
     * Update points table
     */
    async updatePointsTable(
        pointsTableId: string,
        userId: string,
        data: UpdatePointsTableData
    ): Promise<QuickPointsTableCache> {
        try {
            // 1. Get existing points table
            const existing = await this.getPointsTableById(pointsTableId, userId);
            if (!existing) {
                throw new Error('Points table not found or access denied');
            }

            // 2. Update points table object
            const updated: QuickPointsTableCache = {
                ...existing,
                ...data,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 3. Update Redis
            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, updated, this.CACHE_TTL);

            // 4. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_POINTS_TABLE', 'UPDATE', pointsTableId, updated, userId);

            this.logger.info(`Points table ${pointsTableId} updated`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update Points Table');
            throw error;
        }
    }

    /**
     * Delete points table
     */
    async deletePointsTable(
        pointsTableId: string,
        userId: string
    ): Promise<void> {
        try {
            // 1. Get points table to verify ownership
            const pointsTable = await this.getPointsTableById(pointsTableId, userId);
            if (!pointsTable) {
                throw new Error('Points table not found or access denied');
            }

            // 2. Delete from database
            await this.db.quickPointsTable.delete({
                where: { id: pointsTableId }
            });

            // 3. Delete from Redis
            await redis.delete(`quickPointsTable:${pointsTableId}`);
            await redis.delete(`quickMatch:${pointsTable.quickMatchId}:pointsTable`);

            this.logger.info(`Points table ${pointsTableId} deleted`);

        } catch (error) {
            this.handleError(error, 'Delete Points Table');
            throw error;
        }
    }

    /**
     * Delete all points tables for a Quick Match
     */
    async deleteAllPointsTablesForMatch(
        quickMatchId: string,
        userId: string
    ): Promise<void> {
        try {
            // 1. Verify ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get all points tables
            const pointsTables = await this.listPointsTablesForMatch(quickMatchId, userId);

            // 3. Delete from database (bulk)
            await this.db.quickPointsTable.deleteMany({
                where: { quickMatchId }
            });

            // 4. Delete from Redis
            for (const pointsTable of pointsTables) {
                await redis.delete(`quickPointsTable:${pointsTable.id}`);
            }
            await redis.delete(`quickMatch:${quickMatchId}:pointsTable`);

            this.logger.info(`All points tables deleted for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete All Points Tables for Match');
            throw error;
        }
    }

    /**
     * Check if points table has expired
     */
    async isExpired(pointsTableId: string): Promise<boolean> {
        try {
            const pointsTable = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${pointsTableId}`);
            
            if (!pointsTable || !pointsTable.expiresAt) {
                return false;
            }

            return new Date(pointsTable.expiresAt) < new Date();

        } catch (error) {
            this.logger.error('Error checking points table expiry:', error);
            return false;
        }
    }

    /**
     * Calculate expiry date (7 days from now)
     * @private
     */
    private calculateExpiryDate(): string {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 7); // 7 days
        return expiryDate.toISOString();
    }
}

export const quickPointsTableService = new QuickPointsTableService();