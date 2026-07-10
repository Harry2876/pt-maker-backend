import { BaseService } from './baseService';
import redis from '../config/redis';
import { randomUUID } from 'crypto';
import { db } from '../config/database';
import {
    QuickSlotCache,
    QuickSlotListItem,
    CreateQuickSlotData,
    UpdateQuickSlotData,
    BulkSlotUpload,
    SlotStatus,
    ParsedSlot
} from '../types/quickSlot';
import { quickPtSyncQueue } from '../config/queues';
import { SlotTextParser, ParseResult } from '../utils/slotTextParser';
import { quickMatchService } from './quickMatchService';
import { r2Service } from './cloudflareR2Service';
import { issueLogoClientPreview, toLogoPreviewResponse } from '../utils/logoPreviewUtils';
import { ServiceError } from '../utils/serviceError';

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

            // Whether this slot is being created from an attendance scan
            const fromAttendance = !!(data.playerNames && data.playerNames.length > 0);

            // 5. Create slot object
            const slot: QuickSlotCache = {
                id: slotId,
                quickMatchId,
                slotNumber: data.slotNumber,
                teamName: data.teamName,
                playerNames: data.playerNames,
                status: fromAttendance ? 'DETECTED' : 'PENDING',
                detectedInAttendance: fromAttendance,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED'
            };

            // 6. Store directly in database (no queue needed)
            await this.db.quickSlotAssignment.create({
                data: {
                    id: slotId,
                    quickMatchId,
                    slotNumber: data.slotNumber,
                    teamName: data.teamName,
                    ...(data.playerNames?.length && { playerNames: data.playerNames as any }),
                    status: fromAttendance ? 'DETECTED' : 'PENDING',
                    detectedInAttendance: fromAttendance,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // 7. Cache the result for quick access
            await redis.hsetObject(`quickSlot:${slotId}`, slot);
            await redis.hsetObject(`quickMatch:${quickMatchId}:slot:${data.slotNumber}`, slot);
            await redis.sadd(`quickMatch:${quickMatchId}:slots`, slotId);

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
    ): Promise<QuickSlotListItem[]> {
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

            // 3. Get slots from database with optional preset logo
            const dbSlots = await this.db.quickSlotAssignment.findMany({
                where,
                orderBy: { slotNumber: 'asc' },
                include: {
                    logoPresetEntry: {
                        select: {
                            id: true,
                            logoR2Key: true,
                            logoStorageUrl: true,
                        },
                    },
                },
            });

            // 4. Convert to list items with signed preview URLs
            const slots = await Promise.all(
                dbSlots.map((dbSlot) => this.toSlotListItem(dbSlot, userId, quickMatchId))
            );

            return slots;

        } catch (error) {
            this.handleError(error, 'List Quick Match Slots');
            throw error;
        }
    }

    private async toSlotListItem(
        dbSlot: {
            id: string;
            quickMatchId: string;
            slotNumber: number;
            teamName: string;
            playerNames: unknown;
            status: string;
            detectedInAttendance: boolean;
            createdAt: Date;
            updatedAt: Date;
            logoPresetEntryId: string | null;
            matchLogoR2Key: string | null;
            matchLogoStorageUrl: string | null;
            logoPresetEntry?: {
                id: string;
                logoR2Key: string;
                logoStorageUrl: string;
            } | null;
        },
        userId: string,
        quickMatchId: string,
    ): Promise<QuickSlotListItem> {
        const presetLogoStorageUrl = dbSlot.logoPresetEntry?.logoStorageUrl ?? null;
        const matchLogoStorageUrl = dbSlot.matchLogoStorageUrl ?? null;
        const logoStorageUrl = matchLogoStorageUrl ?? presetLogoStorageUrl;
        const effectiveR2Key = dbSlot.matchLogoR2Key ?? dbSlot.logoPresetEntry?.logoR2Key ?? null;

        const preview = effectiveR2Key
            ? await issueLogoClientPreview({ userId, r2Key: effectiveR2Key, quickMatchId })
            : null;
        const previewFields = toLogoPreviewResponse(preview);

        return {
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
            dbStatus: 'SYNCED',
            logoPresetEntryId: dbSlot.logoPresetEntryId,
            matchLogoStorageUrl,
            presetLogoStorageUrl,
            logoStorageUrl,
            ...previewFields,
        };
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

            // 3. Update directly in database (no queue needed)
            await this.db.quickSlotAssignment.update({
                where: { id: slotId },
                data: {
                    ...(data.teamName !== undefined && { teamName: data.teamName }),
                    ...(data.status !== undefined && { status: data.status }),
                    ...(data.detectedInAttendance !== undefined && { detectedInAttendance: data.detectedInAttendance }),
                    ...(data.playerNames !== undefined && { playerNames: data.playerNames as any }),
                    status: data.status ?? 'DETECTED',
                    updatedAt: new Date()
                }
            });

            // 4. Create updated object for cache
            const updated: QuickSlotCache = {
                ...existing,
                ...data,
                updatedAt: new Date().toISOString(),
                dbStatus: 'SYNCED' // Direct DB write, so it's synced
            };

            // 5. Update Redis cache
            await redis.hsetObject(`quickSlot:${slotId}`, updated);
            await redis.hsetObject(`quickMatch:${quickMatchId}:slot:${existing.slotNumber}`, updated);

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
    
            // 2. Get slot from DB (source of truth)
            const dbSlot = await this.db.quickSlotAssignment.findFirst({
                where: { id: slotId, quickMatchId },
                select: { id: true, slotNumber: true, matchLogoR2Key: true },
            });
    
            if (!dbSlot) {
                throw new Error('Slot not found');
            }
    
            // 2.5 Delete match logo from R2 if attached (same pattern as removeMatchLogo)
            if (dbSlot.matchLogoR2Key) {
                await r2Service.deleteFile(dbSlot.matchLogoR2Key).catch(() => { });
            }
    
            // 3. Delete slot from database
            await this.db.quickSlotAssignment.delete({
                where: { id: dbSlot.id },
            });
    
            // 3.5 Delete the result for this slot (any status — including placeholder 0s)
            const result = await this.db.quickMatchResult.findFirst({
                where: { quickMatchId, slotNumber: dbSlot.slotNumber },
                select: { id: true },
            });
            if (result) {
                await this.db.quickMatchResult.delete({ where: { id: result.id } });
                await redis.delete(`quickResult:${result.id}`);
                await redis.srem(`quickMatch:${quickMatchId}:results`, result.id);
            }
    
            // 4. Delete from Redis
            await redis.delete(`quickSlot:${dbSlot.id}`);
            await redis.delete(`quickMatch:${quickMatchId}:slot:${dbSlot.slotNumber}`);
            await redis.srem(`quickMatch:${quickMatchId}:slots`, dbSlot.id);

            const { quickSeriesService } = await import('./quickSeriesService');
            await quickSeriesService.refreshSeriesForMatch(quickMatchId, userId);

            this.logger.info(`Slot ${dbSlot.id} deleted from Quick Match ${quickMatchId}`);
    
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

            // 2. Get all slots from DB before bulk delete (source of truth)
            const dbSlots = await this.db.quickSlotAssignment.findMany({
                where: { quickMatchId },
                select: { id: true, slotNumber: true, matchLogoR2Key: true },
            });

            // 2.5 Delete match logos from R2
            for (const slot of dbSlots) {
                if (slot.matchLogoR2Key) {
                    await r2Service.deleteFile(slot.matchLogoR2Key).catch(() => { });
                }
            }

            // 3. Delete from database (bulk delete)
            await this.db.quickSlotAssignment.deleteMany({
                where: { quickMatchId }
            });

            // 3.5 Delete all results for this match (any status)
            const results = await this.db.quickMatchResult.findMany({
                where: { quickMatchId },
                select: { id: true },
            });
            if (results.length > 0) {
                await this.db.quickMatchResult.deleteMany({ where: { quickMatchId } });
                await Promise.all(results.map((r) => redis.delete(`quickResult:${r.id}`)));
                await redis.delete(`quickMatch:${quickMatchId}:results`);
            }

            // 4. Delete from Redis
            for (const slot of dbSlots) {
                await redis.delete(`quickSlot:${slot.id}`);
                await redis.delete(`quickMatch:${quickMatchId}:slot:${slot.slotNumber}`);
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

    /**
     * Upload and attach a match-specific logo to a slot.
     * Stored at match-logos/{matchId}/slot-{slotNumber}-{uuid}.{ext}
     */
    async attachMatchLogo(
        userId: string,
        quickMatchId: string,
        slotNumber: number,
        fileBuffer: Buffer,
        mimeType: string
    ): Promise<{
        logoStorageUrl: string;
        fileId: string;
        previewUrl: string;
        signedUrl: string;
        signedLogoUrl: string;
        expiresAt: string;
        previewUrlExpiresInSeconds: number;
    }> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const slot = await this.db.quickSlotAssignment.findFirst({
            where: { quickMatchId, slotNumber },
        });
        if (!slot) {
            throw new ServiceError(`Slot ${slotNumber} not found in match`, 404, 'NOT_FOUND');
        }

        const extMap: Record<string, string> = {
            'image/jpeg': 'jpg', 'image/jpg': 'jpg',
            'image/png': 'png', 'image/webp': 'webp',
        };
        const ext = extMap[mimeType];
        if (!ext) {
            throw new ServiceError('Invalid logo type. Allowed: jpeg, png, webp.', 400, 'INVALID_FILE_TYPE');
        }

        if (fileBuffer.length > 5 * 1024 * 1024) {
            throw new ServiceError('Logo file too large. Maximum size is 5MB.', 400, 'FILE_TOO_LARGE');
        }

        // Delete old logo if present
        if (slot.matchLogoR2Key) {
            await r2Service.deleteFile(slot.matchLogoR2Key).catch(() => { });
        }

        const r2Key = `match-logos/${quickMatchId}/slot-${slotNumber}-${randomUUID()}.${ext}`;
        const { url } = await r2Service.uploadLogoBuffer(fileBuffer, r2Key, mimeType);

        await this.db.quickSlotAssignment.update({
            where: { id: slot.id },
            data: { matchLogoR2Key: r2Key, matchLogoStorageUrl: url },
        });

        const preview = await issueLogoClientPreview({ userId, r2Key, quickMatchId });
        if (!preview) {
            throw new ServiceError('Failed to generate logo preview URL', 500, 'PREVIEW_URL_FAILED');
        }
        this.logger.info(`Match logo attached to slot ${slotNumber} in match ${quickMatchId}`);

        return {
            logoStorageUrl: url,
            fileId: preview.fileId,
            previewUrl: preview.previewUrl,
            signedUrl: preview.signedUrl,
            signedLogoUrl: preview.previewUrl,
            expiresAt: preview.expiresAt,
            previewUrlExpiresInSeconds: preview.previewUrlExpiresInSeconds,
        };
    }

    /**
     * Remove the match-specific logo from a slot.
     */
    async removeMatchLogo(userId: string, quickMatchId: string, slotNumber: number): Promise<void> {
        const quickMatch = await quickMatchService.getQuickMatchById(quickMatchId, userId);
        if (!quickMatch) {
            throw new ServiceError('Quick Match not found or access denied', 404, 'NOT_FOUND');
        }

        const slot = await this.db.quickSlotAssignment.findFirst({
            where: { quickMatchId, slotNumber },
        });
        if (!slot) {
            throw new ServiceError(`Slot ${slotNumber} not found in match`, 404, 'NOT_FOUND');
        }

        if (slot.matchLogoR2Key) {
            await r2Service.deleteFile(slot.matchLogoR2Key).catch(() => { });
        }

        await this.db.quickSlotAssignment.update({
            where: { id: slot.id },
            data: { matchLogoR2Key: null, matchLogoStorageUrl: null },
        });

        this.logger.info(`Match logo removed from slot ${slotNumber} in match ${quickMatchId}`);
    }

    /**
     * Resolve the effective logo URL for a slot.
     * Priority: matchLogoStorageUrl > logoPresetEntry.logoStorageUrl > null
     */
    resolveLogoUrl(slot: {
        matchLogoStorageUrl?: string | null;
        logoPresetEntry?: { logoStorageUrl: string } | null;
    }): string | null {
        return slot.matchLogoStorageUrl ?? slot.logoPresetEntry?.logoStorageUrl ?? null;
    }
}

export const quickSlotService = new QuickSlotService();