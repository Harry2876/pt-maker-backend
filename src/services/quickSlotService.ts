import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { 
    QuickSlotCache, 
    CreateQuickSlotData, 
    UpdateQuickSlotData,
    BulkSlotUpload,
    SlotStatus,
    ParsedSlot
} from '../types/quickSlot';
import { SlotTextParser, ParseResult } from '../utils/slotTextParser';
import { quickMatchService } from './quickMatchService';

export class QuickSlotService extends BaseService {
    private CACHE_TTL = 600; // 10 minutes

    /**
     * Create a single slot assignment
     */
    async createSlot(
        quickMatchId: string,
        userId: string,
        data: CreateQuickSlotData
    ): Promise<QuickSlotCache> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Validate slot number
            if (data.slotNumber < 1 || data.slotNumber > 25) {
                throw new Error('Slot number must be between 1 and 25');
            }

            // 3. Check if slot already exists
            const existing = await this.getSlotByNumber(quickMatchId, data.slotNumber);
            if (existing) {
                throw new Error(`Slot ${data.slotNumber} already exists`);
            }

            // 4. Generate slot ID
            const slotId = randomUUID();

            // 5. Create slot object
            const slot: QuickSlotCache = {
                id: slotId,
                quickMatchId,
                slotNumber: data.slotNumber,
                teamName: data.teamName,
                playerNames: data.playerNames,
                status: 'PENDING',
                detectedInAttendance: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 6. Store in Redis
            await redis.hsetObject(`quickSlot:${slotId}`, slot);
            await redis.hsetObject(`quickMatch:${quickMatchId}:slot:${data.slotNumber}`, slot);
            await redis.sadd(`quickMatch:${quickMatchId}:slots`, slotId);

            // 7. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SLOT', 'CREATE', slotId, slot, userId);

            // 8. Update match status to SLOTS_UPLOADED if this is the first slot
            const slotIds = await redis.smembers(`quickMatch:${quickMatchId}:slots`);
            const slotsCount = slotIds.length;
            if (slotsCount === 1) {
                await quickMatchService.updateStatus(quickMatchId, userId, 'SLOTS_UPLOADED');
            }

            this.logger.info(`Slot ${data.slotNumber} created for Quick Match ${quickMatchId}`);
            return slot;

        } catch (error) {
            this.handleError(error, 'Create Quick Slot');
            throw error;
        }
    }

    /**
     * Create multiple slots in bulk
     */
    async createBulkSlots(
        quickMatchId: string,
        userId: string,
        data: BulkSlotUpload
    ): Promise<{ created: QuickSlotCache[]; errors: string[] }> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            const created: QuickSlotCache[] = [];
            const errors: string[] = [];

            // 2. Process each slot
            for (const slotData of data.slots) {
                try {
                    const slot = await this.createSlot(quickMatchId, userId, slotData);
                    created.push(slot);
                } catch (error: any) {
                    errors.push(`Slot ${slotData.slotNumber}: ${error.message}`);
                    this.logger.warn(`Failed to create slot ${slotData.slotNumber}: ${error.message}`);
                }
            }

            this.logger.info(`Bulk slot creation completed: ${created.length} created, ${errors.length} errors`);
            return { created, errors };

        } catch (error) {
            this.handleError(error, 'Create Bulk Quick Slots');
            throw error;
        }
    }

    /**
     * Parse and create slots from text
     */
    async createSlotsFromText(
        quickMatchId: string,
        userId: string,
        slotsText: string
    ): Promise<{ 
        created: QuickSlotCache[]; 
        parseResult: ParseResult;
        errors: string[] 
    }> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Parse slot text
            const parseResult = SlotTextParser.parse(slotsText);

            if (!parseResult.success) {
                return {
                    created: [],
                    parseResult,
                    errors: parseResult.errors
                };
            }

            // 3. Convert parsed slots to CreateQuickSlotData
            const slotsData: CreateQuickSlotData[] = parseResult.slots.map(parsed => ({
                slotNumber: parsed.slotNumber,
                teamName: parsed.teamName,
                playerNames: undefined // Will be detected from attendance
            }));

            // 4. Create slots in bulk
            const bulkResult = await this.createBulkSlots(quickMatchId, userId, { slots: slotsData });

            return {
                created: bulkResult.created,
                parseResult,
                errors: bulkResult.errors
            };

        } catch (error) {
            this.handleError(error, 'Create Slots from Text');
            throw error;
        }
    }

    /**
     * Get slot by slot number
     */
    async getSlotByNumber(quickMatchId: string, slotNumber: number): Promise<QuickSlotCache | null> {
        try {
            // Check Redis cache first
            const cached = await redis.hgetObject<QuickSlotCache>(
                `quickMatch:${quickMatchId}:slot:${slotNumber}`
            );

            if (cached) {
                return cached;
            }

            // Fallback to database
            const dbSlot = await this.db.quickSlotAssignment.findFirst({
                where: {
                    quickMatchId,
                    slotNumber
                }
            });

            if (!dbSlot) {
                return null;
            }

            // Convert to cache format
            const slot: QuickSlotCache = {
                id: dbSlot.id,
                quickMatchId: dbSlot.quickMatchId,
                slotNumber: dbSlot.slotNumber,
                teamName: dbSlot.teamName,
                playerNames: dbSlot.playerNames 
                    ? JSON.parse(JSON.stringify(dbSlot.playerNames))
                    : undefined,
                status: dbSlot.status as SlotStatus,
                detectedInAttendance: dbSlot.detectedInAttendance,
                createdAt: dbSlot.createdAt.toISOString(),
                updatedAt: dbSlot.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            };

            // Cache it
            await redis.hsetObject(`quickSlot:${slot.id}`, slot, this.CACHE_TTL);
            await redis.hsetObject(`quickMatch:${quickMatchId}:slot:${slotNumber}`, slot, this.CACHE_TTL);

            return slot;

        } catch (error) {
            this.handleError(error, 'Get Slot by Number');
            return null;
        }
    }

    /**
     * List all slots for a Quick Match
     */
    async listQuickMatchSlots(
        quickMatchId: string,
        userId: string,
        filters?: {
            status?: SlotStatus;
            detectedInAttendance?: boolean;
        }
    ): Promise<QuickSlotCache[]> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Build where clause
            const where: any = { quickMatchId };
            if (filters?.status) {
                where.status = filters.status;
            }
            if (filters?.detectedInAttendance !== undefined) {
                where.detectedInAttendance = filters.detectedInAttendance;
            }

            // 3. Get slots from database
            const dbSlots = await this.db.quickSlotAssignment.findMany({
                where,
                orderBy: { slotNumber: 'asc' }
            });

            // 4. Convert to cache format
            const slots: QuickSlotCache[] = dbSlots.map(dbSlot => ({
                id: dbSlot.id,
                quickMatchId: dbSlot.quickMatchId,
                slotNumber: dbSlot.slotNumber,
                teamName: dbSlot.teamName,
                playerNames: dbSlot.playerNames 
                    ? JSON.parse(JSON.stringify(dbSlot.playerNames))
                    : undefined,
                status: dbSlot.status as SlotStatus,
                detectedInAttendance: dbSlot.detectedInAttendance,
                createdAt: dbSlot.createdAt.toISOString(),
                updatedAt: dbSlot.updatedAt.toISOString(),
                dbStatus: 'SYNCED'
            }));

            return slots;

        } catch (error) {
            this.handleError(error, 'List Quick Match Slots');
            throw error;
        }
    }

    /**
     * Update a slot
     */
    async updateSlot(
        slotId: string,
        userId: string,
        data: UpdateQuickSlotData
    ): Promise<QuickSlotCache> {
        try {
            // 1. Get existing slot
            const existing = await redis.hgetObject<QuickSlotCache>(`quickSlot:${slotId}`);
            if (!existing) {
                throw new Error('Slot not found');
            }

            // 2. Verify Quick Match ownership
            const quickMatchId = existing.quickMatchId;
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 3. Update slot object
            const updated: QuickSlotCache = {
                ...existing,
                ...data,
                updatedAt: new Date().toISOString(),
                dbStatus: 'PENDING_SYNC'
            };

            // 4. Update Redis
            await redis.hsetObject(`quickSlot:${slotId}`, updated);
            await redis.hsetObject(`quickMatch:${quickMatchId}:slot:${existing.slotNumber}`, updated);

            // 5. Queue database sync
            await QueueService.syncQuickPtImmediately('QUICK_SLOT', 'UPDATE', slotId, updated, userId);

            this.logger.info(`Slot ${slotId} updated for Quick Match ${quickMatchId}`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update Quick Slot');
            throw error;
        }
    }

    /**
     * Delete a slot
     */
    async deleteSlot(slotId: string, quickMatchId: string, userId: string): Promise<void> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get slot to find slot number
            const slot = await redis.hgetObject<QuickSlotCache>(`quickSlot:${slotId}`);
            if (!slot) {
                throw new Error('Slot not found');
            }

            // 3. Delete from database
            await this.db.quickSlotAssignment.delete({
                where: { id: slotId }
            });

            // 4. Delete from Redis
            await redis.delete(`quickSlot:${slotId}`);
            await redis.delete(`quickMatch:${quickMatchId}:slot:${slot.slotNumber}`);
            await redis.srem(`quickMatch:${quickMatchId}:slots`, slotId);

            this.logger.info(`Slot ${slotId} deleted from Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete Quick Slot');
            throw error;
        }
    }

    /**
     * Delete all slots for a Quick Match
     */
    async deleteAllSlots(quickMatchId: string, userId: string): Promise<void> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Get all slot IDs
            const slotIds = await redis.smembers(`quickMatch:${quickMatchId}:slots`);

            // 3. Delete from database (bulk delete)
            await this.db.quickSlotAssignment.deleteMany({
                where: { quickMatchId }
            });

            // 4. Delete from Redis
            for (const slotId of slotIds) {
                const slot = await redis.hgetObject<QuickSlotCache>(`quickSlot:${slotId}`);
                if (slot) {
                    await redis.delete(`quickSlot:${slotId}`);
                    await redis.delete(`quickMatch:${quickMatchId}:slot:${slot.slotNumber}`);
                }
            }
            await redis.delete(`quickMatch:${quickMatchId}:slots`);

            this.logger.info(`All slots deleted for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Delete All Quick Slots');
            throw error;
        }
    }

    /**
     * Mark slots as detected in attendance
     */
    async markSlotsDetected(
        quickMatchId: string,
        slotNumbers: number[],
        userId: string
    ): Promise<void> {
        try {
            // 1. Verify Quick Match ownership
            const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
            if (!quickMatch) {
                throw new Error('Quick Match not found or access denied');
            }

            // 2. Update each slot
            for (const slotNumber of slotNumbers) {
                const slot = await this.getSlotByNumber(quickMatchId, slotNumber);
                if (slot) {
                    await this.updateSlot(slot.id, userId, {
                        detectedInAttendance: true,
                        status: 'DETECTED'
                    });
                }
            }

            this.logger.info(`Marked ${slotNumbers.length} slots as detected for Quick Match ${quickMatchId}`);

        } catch (error) {
            this.handleError(error, 'Mark Slots Detected');
            throw error;
        }
    }
}

export const quickSlotService = new QuickSlotService();