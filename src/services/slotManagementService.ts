import { BaseService } from './baseService';
import redis from '../config/redis';
import { QueueService } from './queueService';
import { randomUUID } from 'crypto';
import { 
    SlotAssignmentCache, 
    CreateSlotAssignmentData, 
    UpdateSlotAssignmentData,
    BulkSlotAssignmentData,
    SlotAvailability,
    GroupSlotLayout,
    AutoSlotAssignmentConfig,
    AutoSlotAssignmentResult
} from '../types/slotAssignment';

export class SlotManagementService extends BaseService {
    private CACHE_TTL = 300; // 5 minutes

    // Create slot assignment with hybrid sync
    async assignSlot(data: CreateSlotAssignmentData, assignedBy: string) {
        try {
            // 1. Validate slot number (1-25)
            if (data.slotNumber < 1 || data.slotNumber > 25) {
                throw new Error('Slot number must be between 1 and 25');
            }

            // 2. Check if slot is already occupied
            const existingSlot = await redis.hgetObject<SlotAssignmentCache>(`slot:${data.groupId}:${data.slotNumber}`);
            if (existingSlot && existingSlot.teamRegistrationId) {
                throw new Error(`Slot ${data.slotNumber} is already occupied`);
            }

            // 3. Generate slot assignment ID
            const slotAssignmentId = randomUUID();

            // 4. Create slot assignment object
            const slotAssignment: SlotAssignmentCache = {
                id: slotAssignmentId,
                slotNumber: data.slotNumber,
                groupId: data.groupId,
                teamRegistrationId: data.teamRegistrationId,
                teamName: '', // Will be populated from DB sync
                isActive: true,
                assignedAt: new Date().toISOString(),
                assignedBy,
                assignedByName: '', // Will be populated from DB sync
                dbStatus: 'PENDING_SYNC'
            };

            // 5. Store in Redis immediately
            await redis.hsetObject(`slot:${data.groupId}:${data.slotNumber}`, slotAssignment);
            await redis.hsetObject(`slotAssignment:${slotAssignmentId}`, slotAssignment);
            await redis.sadd(`group:${data.groupId}:slots`, data.slotNumber.toString());

            // 6. If team is assigned, track team slots
            if (data.teamRegistrationId) {
                await redis.sadd(`team:${data.teamRegistrationId}:slots`, `${data.groupId}:${data.slotNumber}`);
            }

            // 7. Queue database sync
            await QueueService.syncImmediately('SLOT_ASSIGNMENT', slotAssignmentId, slotAssignment, assignedBy);

            this.logger.info(`Slot ${data.slotNumber} assigned in group ${data.groupId}`);
            return slotAssignment;

        } catch (error) {
            this.handleError(error, 'Assign slot');
            return null;
        }
    }

    // Get all slot assignments for a group
    async getGroupSlots(groupId: string): Promise<GroupSlotLayout> {
        try {
            const slotNumbers = await redis.smembers(`group:${groupId}:slots`);
            const slots: SlotAssignmentCache[] = [];

            // Get all slot assignments
            for (let i = 1; i <= 25; i++) {
                const slot = await redis.hgetObject<SlotAssignmentCache>(`slot:${groupId}:${i}`);
                if (slot) {
                    slots.push(slot);
                } else {
                    // Create empty slot representation
                    slots.push({
                        id: '',
                        slotNumber: i,
                        groupId,
                        teamRegistrationId: undefined,
                        teamName: undefined,
                        isActive: true,
                        assignedAt: '',
                        assignedBy: '',
                        assignedByName: undefined,
                        dbStatus: 'SYNCED'
                    });
                }
            }

            // Get group info for layout
            const group = await redis.hgetObject<any>(`group:${groupId}`);
            const assignedSlots = slots.filter(s => s.teamRegistrationId).length;

            return {
                groupId,
                groupName: group?.name || 'Unknown Group',
                maxSlots: 25,
                assignedSlots,
                emptySlots: 25 - assignedSlots,
                slots: slots.map(slot => ({
                    slotNumber: slot.slotNumber,
                    teamRegistrationId: slot.teamRegistrationId,
                    teamName: slot.teamName,
                    playerCount: undefined, // Will be populated later
                    isActive: slot.isActive,
                    assignedAt: slot.assignedAt,
                    assignedBy: slot.assignedBy
                }))
            };

        } catch (error) {
            this.handleError(error, 'Get group slots');
            return {
                groupId,
                groupName: 'Error',
                maxSlots: 25,
                assignedSlots: 0,
                emptySlots: 25,
                slots: []
            };
        }
    }

    // Update slot assignment
    async updateSlot(groupId: string, slotNumber: number, data: UpdateSlotAssignmentData, updatedBy: string) {
        try {
            // Get existing slot
            const existing = await redis.hgetObject<SlotAssignmentCache>(`slot:${groupId}:${slotNumber}`);
            if (!existing) {
                throw new Error(`Slot ${slotNumber} not found in group ${groupId}`);
            }

            // Update slot assignment
            const updated: SlotAssignmentCache = {
                ...existing,
                teamRegistrationId: data.teamRegistrationId !== undefined ? data.teamRegistrationId : existing.teamRegistrationId,
                isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
                assignedAt: new Date().toISOString(),
                assignedBy: updatedBy,
                dbStatus: 'PENDING_SYNC'
            };

            // Store in Redis
            await redis.hsetObject(`slot:${groupId}:${slotNumber}`, updated);
            await redis.hsetObject(`slotAssignment:${updated.id}`, updated);

            // Update team slot tracking
            if (existing.teamRegistrationId && existing.teamRegistrationId !== data.teamRegistrationId) {
                await redis.srem(`team:${existing.teamRegistrationId}:slots`, `${groupId}:${slotNumber}`);
            }
            if (data.teamRegistrationId) {
                await redis.sadd(`team:${data.teamRegistrationId}:slots`, `${groupId}:${slotNumber}`);
            }

            // Queue database sync
            await QueueService.syncImmediately('SLOT_ASSIGNMENT', updated.id, updated, updatedBy);

            this.logger.info(`Slot ${slotNumber} updated in group ${groupId}`);
            return updated;

        } catch (error) {
            this.handleError(error, 'Update slot');
            return null;
        }
    }

    // Remove team from slot (make slot empty)
    async clearSlot(groupId: string, slotNumber: number, clearedBy: string) {
        try {
            return await this.updateSlot(groupId, slotNumber, { 
                teamRegistrationId: undefined,
                isActive: true 
            }, clearedBy);
        } catch (error) {
            this.handleError(error, 'Clear slot');
            return null;
        }
    }

    // Get available slots in a group
    async getAvailableSlots(groupId: string): Promise<SlotAvailability> {
        try {
            const groupLayout = await this.getGroupSlots(groupId);
            
            const availableSlots = groupLayout.slots
                .filter(slot => !slot.teamRegistrationId)
                .map(slot => slot.slotNumber);

            const occupiedSlots = groupLayout.slots
                .filter(slot => slot.teamRegistrationId)
                .map(slot => ({
                    slotNumber: slot.slotNumber,
                    teamRegistrationId: slot.teamRegistrationId,
                    teamName: slot.teamName,
                    playerCount: slot.playerCount,
                    isActive: slot.isActive,
                    assignedAt: slot.assignedAt,
                    assignedBy: slot.assignedBy
                }));

            return {
                groupId,
                availableSlots,
                occupiedSlots,
                totalSlots: 25,
                maxAllowedSlots: 25
            };

        } catch (error) {
            this.handleError(error, 'Get available slots');
            return {
                groupId,
                availableSlots: [],
                occupiedSlots: [],
                totalSlots: 25,
                maxAllowedSlots: 25
            };
        }
    }

    // Auto-assign teams to available slots
    async autoAssignSlots(config: AutoSlotAssignmentConfig, assignedBy: string): Promise<AutoSlotAssignmentResult> {
        try {
            const availability = await this.getAvailableSlots(config.groupId);
            let availableSlots = availability.availableSlots;

            // Remove excluded slots
            if (config.excludeSlots) {
                availableSlots = availableSlots.filter(slot => !config.excludeSlots!.includes(slot));
            }

            // Get teams to assign (this would come from team registration service)
            // For now, we'll just return the structure
            const assignments: SlotAssignmentCache[] = [];
            const errors: string[] = [];

            // Shuffle slots based on strategy
            switch (config.strategy) {
                case 'RANDOM':
                    availableSlots = this.shuffleArray(availableSlots);
                    break;
                case 'BALANCED':
                    availableSlots.sort((a, b) => a - b); // Ascending order
                    break;
                case 'SKILL_BASED':
                    // Would implement skill-based sorting here
                    break;
                case 'MANUAL_ORDER':
                    // Keep original order
                    break;
            }

            return {
                success: assignments.length > 0,
                assignedCount: assignments.length,
                assignments,
                errors
            };

        } catch (error) {
            this.handleError(error, 'Auto assign slots');
            return {
                success: false,
                assignedCount: 0,
                assignments: [],
                errors: [(error as any).message]
            };
        }
    }

    // Helper method to shuffle array
    private shuffleArray<T>(array: T[]): T[] {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
}

export const slotManagementService = new SlotManagementService();