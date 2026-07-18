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
    AutoSlotAssignmentResult,
    SlotType,
    TeamPriority
} from '../types/slotAssignment';
import { TeamRegistrationCache } from '@/types/teamRegistration';

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

            let teamName = '';
            if (data.teamRegistrationId) {
                const team = await redis.hgetObject<TeamRegistrationCache>(`teamRegistration:${data.teamRegistrationId}`);
                teamName = team?.teamName ?? '';
            }

            // 4. Create slot assignment object
            const slotAssignment: SlotAssignmentCache = {
                id: slotAssignmentId,
                slotNumber: data.slotNumber,
                groupId: data.groupId,
                teamRegistrationId: data.teamRegistrationId,
                teamName,
                isActive: true,
                slotType: data.slotType || SlotType.TEAM_SLOT,
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
                        slotType: SlotType.TEAM_SLOT,
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
                teamRegistrationId: data.teamRegistrationId !== undefined
                    ? (data.teamRegistrationId ?? undefined)
                    : existing.teamRegistrationId,
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
                teamRegistrationId: null,
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
            const unassignedTeams = await this.getUnassignedTeams(config.groupId);
            const assignments: SlotAssignmentCache[] = [];
            const errors: string[] = [];

            //Apply team priorities if provided
            let teamsToAssign = unassignedTeams;
            if (config.teamPriorities && config.teamPriorities.length > 0) {
                teamsToAssign = this.sortTeamsByPriority(unassignedTeams, config.teamPriorities);
            }

            //shuffle slots based on strategy
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
            //Assign teams to slots
            const maxAssignments = Math.min(availableSlots.length, teamsToAssign.length);

            for (let i = 0; i < maxAssignments; i++) {
                const team = teamsToAssign[i];
                const slotNumber = availableSlots[i];

                try {
                    const assignment = await this.assignSlot({
                        slotNumber,
                        groupId: config.groupId,
                        teamRegistrationId: team.id,
                        slotType: SlotType.TEAM_SLOT
                    }, assignedBy);
                    if (assignment) {
                        assignments.push(assignment);
                    }
                } catch (error) {
                    errors.push(`Failed to assign team ${team.id} to slot ${slotNumber}: ${(error as any).message}`);
                }
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

    // Get teams that don't have slot assignments yet
    private async getUnassignedTeams(groupId: string) {
        try {
            // Get all team registrations for this group
            const teamIds = await redis.smembers(`group:${groupId}:teamRegistrations`);
            const unassignedTeams = [];

            for (const teamId of teamIds) {
                const team = await redis.hgetObject<TeamRegistrationCache>(`teamRegistration:${teamId}`);
                if (team) {
                    // Check if team already has a slot assignment
                    const teamSlots = await redis.smembers(`team:${teamId}:slots`);
                    const hasSlotInGroup = teamSlots.some(slot => slot.startsWith(`${groupId}:`));

                    if (!hasSlotInGroup) {
                        unassignedTeams.push(team);
                    }
                }
            }

            return unassignedTeams;
        } catch (error) {
            this.logger.error('Failed to get unassigned teams:', error);
            return [];
        }
    }

    // Sort teams by priority for assignment
    private sortTeamsByPriority(teams: TeamRegistrationCache[], priorities: TeamPriority[]) {
        const priorityMap = new Map(priorities.map(p => [p.teamRegistrationId, p.priority]));

        return teams.sort((a, b) => {
            const priorityA = priorityMap.get(a.id) || 0;
            const priorityB = priorityMap.get(b.id) || 0;
            return priorityB - priorityA; // Higher priority first
        });
    }
}

export const slotManagementService = new SlotManagementService();