import { Request, Response } from 'express';
import { slotManagementService } from '../services/slotManagementService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class SlotManagementController {
    // Assign team to slot
    static assignSlot = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const { slotNumber, teamRegistrationId } = req.body;
        const userId = req.user!.id;

        const slotAssignment = await slotManagementService.assignSlot({
            groupId,
            slotNumber,
            teamRegistrationId
        }, userId);

        if (!slotAssignment) {
            return res.status(400).json(ResponseHelper.validationError('Failed to assign slot'));
        }

        return res.status(201).json(ResponseHelper.success('Slot assigned successfully', slotAssignment));
    });

    // Get all slots for a group
    static getGroupSlots = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;

        const groupSlots = await slotManagementService.getGroupSlots(groupId);

        if (!groupSlots) {
            return res.status(404).json(ResponseHelper.notFound('Group slots not found'));
        }

        return res.json(ResponseHelper.success('Group slots retrieved successfully', groupSlots));
    });

    // Update slot assignment
    static updateSlotAssignment = asyncHandler(async (req: Request, res: Response) => {
        const { groupId, slotNumber } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        const updatedSlot = await slotManagementService.updateSlot(
            groupId, 
            parseInt(slotNumber), 
            updateData, 
            userId
        );

        if (!updatedSlot) {
            return res.status(404).json(ResponseHelper.notFound('Slot not found or update failed'));
        }

        return res.json(ResponseHelper.success('Slot assignment updated successfully', updatedSlot));
    });

    // Remove team from slot (clear slot)
    static removeSlotAssignment = asyncHandler(async (req: Request, res: Response) => {
        const { groupId, slotNumber } = req.params;
        const userId = req.user!.id;

        const cleared = await slotManagementService.clearSlot(
            groupId, 
            parseInt(slotNumber), 
            userId
        );

        if (!cleared) {
            return res.status(404).json(ResponseHelper.notFound('Slot not found or clear failed'));
        }

        return res.json(ResponseHelper.success('Slot cleared successfully'));
    });

    // Get available slots for a group
    static getSlotAvailability = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;

        const availability = await slotManagementService.getAvailableSlots(groupId);

        return res.json(ResponseHelper.success('Slot availability retrieved successfully', availability));
    });

    // Auto-assign teams to available slots
    static autoAssignSlots = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const { strategy, excludeSlots, teamPriorities } = req.body;
        const userId = req.user!.id;

        const autoAssignmentConfig = {
            groupId,
            strategy,
            excludeSlots,
            teamPriorities
        };

        const result = await slotManagementService.autoAssignSlots(autoAssignmentConfig, userId);

        if (!result.success) {
            return res.status(400).json(ResponseHelper.validationError('Auto assignment failed', result.errors.join(', ')));
        }

        return res.json(ResponseHelper.success('Auto assignment completed successfully', result));
    });

    // Swap teams between two slots
    static swapSlots = asyncHandler(async (req: Request, res: Response) => {
        const { groupId } = req.params;
        const { slot1, slot2, reason } = req.body;
        const userId = req.user!.id;

        // Get current assignments for both slots
        const groupSlots = await slotManagementService.getGroupSlots(groupId);
        
        if (!groupSlots) {
            return res.status(404).json(ResponseHelper.notFound('Group not found'));
        }

        const slot1Assignment = groupSlots.slots.find(s => s.slotNumber === slot1);
        const slot2Assignment = groupSlots.slots.find(s => s.slotNumber === slot2);

        if (!slot1Assignment || !slot2Assignment) {
            return res.status(404).json(ResponseHelper.notFound('One or both slots not found'));
        }

        // Perform the swap by updating both slots
        const updateSlot1 = await slotManagementService.updateSlot(
            groupId, 
            slot1, 
            { teamRegistrationId: slot2Assignment.teamRegistrationId }, 
            userId
        );

        const updateSlot2 = await slotManagementService.updateSlot(
            groupId, 
            slot2, 
            { teamRegistrationId: slot1Assignment.teamRegistrationId }, 
            userId
        );

        if (!updateSlot1 || !updateSlot2) {
            return res.status(400).json(ResponseHelper.validationError('Slot swap failed'));
        }

        return res.json(ResponseHelper.success('Slots swapped successfully', {
            slot1: updateSlot1,
            slot2: updateSlot2,
            reason
        }));
    });
}