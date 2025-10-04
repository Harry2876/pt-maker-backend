import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { SlotManagementController } from '../controllers/slotManagementController';
import { groupParamsSchema } from '../validations/groupValidation';

const slotManagementRouter = express.Router();

// Apply authentication to all slot management routes
slotManagementRouter.use(authenticateUser);

// Manual slot assignment
slotManagementRouter.post('/groups/:groupId/slots/assign', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.assignSlot
);

// Get all slots for a group
slotManagementRouter.get('/groups/:groupId/slots', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.getGroupSlots
);

// Update slot assignment
slotManagementRouter.put('/groups/:groupId/slots/:slotNumber', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.updateSlotAssignment
);

// Clear slot (remove team)
slotManagementRouter.delete('/groups/:groupId/slots/:slotNumber', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.removeSlotAssignment
);

// Get slot availability
slotManagementRouter.get('/groups/:groupId/slots/availability', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.getSlotAvailability
);

// ⭐ AUTO-ASSIGNMENT ROUTE (The missing functionality!)
slotManagementRouter.post('/groups/:groupId/slots/auto-assign', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.autoAssignSlots
);

// Swap teams between slots
slotManagementRouter.post('/groups/:groupId/slots/swap', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.swapSlots
);

export default slotManagementRouter;