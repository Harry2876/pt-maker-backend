import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { quickMatchService } from './quickMatchService';
import { quickProcessingService } from './quickProcessingService';
import { pythonAIService } from './pythonAIService';
import { QuickPointsTableCache } from '../types/quickResult';

export interface ExportPointsTableRequest {
    quickMatchId: string;
    userId: string;
    template?: string; // 'default', 'minimal', 'detailed', etc.
}

export interface ExportPointsTableResponse {
    success: boolean;
    pointsTableId: string;
    pngUrl: string;
    csvData: any;
    generationTimeMs: number;
}

export class QuickExportService extends BaseService {
    private readonly DEFAULT_TEMPLATE = 'default';
    private readonly EXPORT_CACHE_TTL = 3600; // 1 hour

    constructor() {
        super();
    }

    /**
     * Generate and export points table for a Quick Match
     */
    async exportPointsTable(
        request: ExportPointsTableRequest
    ): Promise<ExportPointsTableResponse> {
        const startTime = Date.now();

        try {
            const { quickMatchId, userId, template = this.DEFAULT_TEMPLATE } = request;

            this.logger.info(`Starting points table export for Quick Match ${quickMatchId}`);

            // 1. Verify match exists and is completed
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            if (quickMatch.status !== 'COMPLETED') {
                throw new Error(`Cannot export points table. Match status: ${quickMatch.status}. Please complete result processing first.`);
            }

            // 2. Get match results
            const results = await quickProcessingService.getMatchResults(quickMatchId, userId);
            
            if (results.length === 0) {
                throw new Error('No results found for this match. Please process results first.');
            }

            // 3. Format results for Python AI
            const matchResults = results.map(result => ({
                slot_number: result.slotNumber,
                team_name: result.teamName,
                position: result.position,
                total_kills: result.totalKills,
                position_points: result.positionPoints,
                kill_points: result.killPoints,
                total_points: result.totalPoints
            }));

            // 4. Call Python AI to generate points table
            this.logger.info(`Calling Python AI to generate points table with ${results.length} teams`);
            
            const aiResponse = await pythonAIService.generatePointsTable(
                matchResults,
                quickMatch.matchName,
                template
            );

            // 5. Create points table record
            const pointsTableId = randomUUID();
            const pointsTable: QuickPointsTableCache = {
                id: pointsTableId,
                quickMatchId,
                tableImageUrl: aiResponse.data.png_url,
                csvData: aiResponse.data.csv_data,
                pngGeneratedAt: new Date().toISOString(),
                generationTimeMs: aiResponse.metadata?.generation_time_ms,
                template,
                expiresAt: this.calculateExpiryDate(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED' // Direct DB write, so it's synced
            };

            const generationTimeMs = Date.now() - startTime;

            // 6. Store directly in database (no queue needed)
            await this.db.quickPointsTable.create({
                data: {
                    id: pointsTableId,
                    quickMatchId: quickMatchId,
                    tableImageUrl: aiResponse.data.png_url,
                    csvData: aiResponse.data.csv_data,
                    pngGeneratedAt: new Date(),
                    generationTimeMs: generationTimeMs,
                    template: 'default',
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // 7. Cache the result for quick access
            await redis.hsetObject(`quickPointsTable:${pointsTableId}`, pointsTable, this.EXPORT_CACHE_TTL);
            await redis.set(`quickMatch:${quickMatchId}:pointsTable`, pointsTableId, this.EXPORT_CACHE_TTL);

            this.logger.info(`Points table exported successfully: ${pointsTableId} (${generationTimeMs}ms)`);

            return {
                success: true,
                pointsTableId,
                pngUrl: aiResponse.data.png_url,
                csvData: aiResponse.data.csv_data,
                generationTimeMs
            };

        } catch (error) {
            this.handleError(error, 'Export Points Table');
            throw error;
        }
    }

    /**
     * Get existing points table for a match
     */
    async getPointsTable(
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

            // 3. Fallback to database
            const dbPointsTable = await this.db.quickPointsTable.findFirst({
                where: { quickMatchId },
                orderBy: { createdAt: 'desc' } // Get latest
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
            await redis.hsetObject(`quickPointsTable:${pointsTable.id}`, pointsTable, this.EXPORT_CACHE_TTL);

            return pointsTable;

        } catch (error) {
            this.handleError(error, 'Get Points Table');
            return null;
        }
    }

    /**
     * Regenerate points table (e.g., with different template)
     */
    async regeneratePointsTable(
        quickMatchId: string,
        userId: string,
        template?: string
    ): Promise<ExportPointsTableResponse> {
        try {
            this.logger.info(`Regenerating points table for Quick Match ${quickMatchId}`);

            // Simply call export again (it will generate a new one)
            return await this.exportPointsTable({
                quickMatchId,
                userId,
                template
            });

        } catch (error) {
            this.handleError(error, 'Regenerate Points Table');
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
            // 1. Get points table
            const pointsTable = await redis.hgetObject<QuickPointsTableCache>(`quickPointsTable:${pointsTableId}`);
            
            if (pointsTable) {
                // 2. Verify ownership
                const quickMatch = await quickMatchService.getQuickMatchById(pointsTable.quickMatchId, userId);
                if (!quickMatch) {
                    throw new Error('Access denied');
                }
            }

            // 3. Delete from database
            await this.db.quickPointsTable.delete({
                where: { id: pointsTableId }
            });

            // 4. Delete from Redis
            await redis.delete(`quickPointsTable:${pointsTableId}`);
            if (pointsTable) {
                await redis.delete(`quickMatch:${pointsTable.quickMatchId}:pointsTable`);
            }

            this.logger.info(`Points table ${pointsTableId} deleted`);

        } catch (error) {
            this.handleError(error, 'Delete Points Table');
            throw error;
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
}

export const quickExportService = new QuickExportService();