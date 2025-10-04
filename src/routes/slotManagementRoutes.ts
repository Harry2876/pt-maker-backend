import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { SlotManagementController } from '../controllers/slotManagementController';
import { groupParamsSchema } from '../validations/groupValidation';


/**
 * @swagger
 * tags:
 *   - name: Slot Management
 *     description: Tournament group slot assignment and management operations
 */

const slotManagementRouter = express.Router();

// Apply authentication to all slot management routes
slotManagementRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots/assign:
 *   post:
 *     tags: [Slot Management]
 *     summary: Manually assign a team to a slot
 *     description: |
 *       Assign a team to a specific slot number (1-25) in a group. Only group/tournament owners can assign slots. Slot must be unoccupied and team must be registered for the tournament.
 *       
 *       **Business Rules:**
 *       - Only group/tournament owner can assign slots
 *       - Slot numbers must be between 1 and 25
 *       - Cannot assign to already occupied slot
 *       - Team must be registered for the tournament
 *       - Assignment is tracked with audit trail and Redis-first hybrid sync
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slotNumber, teamRegistrationId]
 *             properties:
 *               slotNumber:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 25
 *                 example: 5
 *                 description: Slot position number (1-25)
 *               teamRegistrationId:
 *                 type: string
 *                 format: uuid
 *                 example: "456e7890-e12c-34f5-b678-789012345678"
 *                 description: Team registration UUID
 *               slotType:
 *                 type: string
 *                 enum: [TEAM_SLOT, MANAGEMENT_SLOT, RESERVED_SLOT]
 *                 default: TEAM_SLOT
 *                 example: TEAM_SLOT
 *                 description: Type of slot being assigned
 *           example:
 *             slotNumber: 5
 *             teamRegistrationId: "456e7890-e12c-34f5-b678-789012345678"
 *             slotType: TEAM_SLOT
 *     responses:
 *       201:
 *         description: Slot assigned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Slot assigned successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                     slotNumber:
 *                       type: integer
 *                       example: 5
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     teamRegistrationId:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     teamName:
 *                       type: string
 *                       example: Team Phoenix
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     slotType:
 *                       type: string
 *                       enum: [TEAM_SLOT, MANAGEMENT_SLOT, RESERVED_SLOT]
 *                       example: TEAM_SLOT
 *                     assignedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     assignedBy:
 *                       type: string
 *                       format: uuid
 *                       example: "user123-4567-89ab-cdef-0123456789ab"
 *                     assignedByName:
 *                       type: string
 *                       example: Tournament Organizer
 *                     dbStatus:
 *                       type: string
 *                       enum: [PENDING_SYNC, SYNCED, ERROR]
 *                       example: PENDING_SYNC
 *       400:
 *         description: Validation error or slot assignment failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to assign slot
 *                 error:
 *                   type: string
 *                   example: Slot 5 is already occupied
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.post('/groups/:groupId/slots/assign', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.assignSlot
);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots:
 *   get:
 *     tags: [Slot Management]
 *     summary: Get all slot assignments for a group
 *     description: |
 *       Retrieves the complete slot layout for a group, showing all assigned and empty slots (1-25). Includes team details, slot types, and assignment metadata. Useful for rendering group slot grids and admin dashboards.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Group slots retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Group slots retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     totalSlots:
 *                       type: integer
 *                       example: 25
 *                       description: Total available slot positions
 *                     occupiedSlots:
 *                       type: integer
 *                       example: 8
 *                       description: Number of currently assigned slots
 *                     availableSlots:
 *                       type: integer
 *                       example: 17
 *                       description: Number of empty slots available
 *                     slots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotNumber:
 *                             type: integer
 *                             example: 5
 *                           isOccupied:
 *                             type: boolean
 *                             example: true
 *                           teamRegistrationId:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                             nullable: true
 *                           teamName:
 *                             type: string
 *                             example: Team Phoenix
 *                             nullable: true
 *                           playerCount:
 *                             type: integer
 *                             example: 4
 *                             nullable: true
 *                           slotType:
 *                             type: string
 *                             enum: [TEAM_SLOT, MANAGEMENT_SLOT, RESERVED_SLOT]
 *                             example: TEAM_SLOT
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                             nullable: true
 *                           assignedBy:
 *                             type: string
 *                             format: uuid
 *                             example: "user123-4567-89ab-cdef-0123456789ab"
 *                             nullable: true
 *                           assignedByName:
 *                             type: string
 *                             example: Tournament Organizer
 *                             nullable: true
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.get('/groups/:groupId/slots', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.getGroupSlots
);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots/{slotNumber}:
 *   put:
 *     tags: [Slot Management]
 *     summary: Update slot assignment
 *     description: |
 *       Update an existing slot assignment. Can change team assignment, activate/deactivate slot, or modify slot properties. Only group/tournament owners can update slots. All changes are tracked with audit trail and Redis-first hybrid sync.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *       - in: path
 *         name: slotNumber
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 25
 *         description: Slot position number (1-25)
 *         example: 5
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               teamRegistrationId:
 *                 type: string
 *                 format: uuid
 *                 example: "789e0123-e45f-67g8-h901-234567890123"
 *                 description: New team registration UUID (null to make slot empty)
 *                 nullable: true
 *               isActive:
 *                 type: boolean
 *                 example: true
 *                 description: Whether slot assignment is active
 *           example:
 *             teamRegistrationId: "789e0123-e45f-67g8-h901-234567890123"
 *             isActive: true
 *     responses:
 *       200:
 *         description: Slot assignment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Slot assignment updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                     slotNumber:
 *                       type: integer
 *                       example: 5
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     teamRegistrationId:
 *                       type: string
 *                       format: uuid
 *                       example: "789e0123-e45f-67g8-h901-234567890123"
 *                     teamName:
 *                       type: string
 *                       example: Team Thunder
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     slotType:
 *                       type: string
 *                       enum: [TEAM_SLOT, MANAGEMENT_SLOT, RESERVED_SLOT]
 *                       example: TEAM_SLOT
 *                     assignedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T14:45:00.000Z"
 *                     assignedBy:
 *                       type: string
 *                       format: uuid
 *                       example: "user123-4567-89ab-cdef-0123456789ab"
 *                     dbStatus:
 *                       type: string
 *                       enum: [PENDING_SYNC, SYNCED, ERROR]
 *                       example: PENDING_SYNC
 *       400:
 *         description: Validation error or update failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Slot assignment update failed
 *                 error:
 *                   type: string
 *                   example: Invalid team registration ID
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 *   delete:
 *     tags: [Slot Management]
 *     summary: Clear slot assignment (remove team)
 *     description: |
 *       Removes a team assignment from a slot, making it available for new assignments. Only group/tournament owners can clear slots. Maintains audit trail and Redis-first hybrid sync.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *       - in: path
 *         name: slotNumber
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 25
 *         description: Slot position number (1-25)
 *         example: 5
 *     responses:
 *       200:
 *         description: Slot cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Slot cleared successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     slotNumber:
 *                       type: integer
 *                       example: 5
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     clearedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T16:20:00.000Z"
 *                     clearedBy:
 *                       type: string
 *                       format: uuid
 *                       example: "user123-4567-89ab-cdef-0123456789ab"
 *                     previousTeam:
 *                       type: object
 *                       properties:
 *                         teamRegistrationId:
 *                           type: string
 *                           format: uuid
 *                           example: "456e7890-e12c-34f5-b678-789012345678"
 *                         teamName:
 *                           type: string
 *                           example: Team Phoenix
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.put('/groups/:groupId/slots/:slotNumber', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.updateSlotAssignment
);

slotManagementRouter.delete('/groups/:groupId/slots/:slotNumber', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.removeSlotAssignment
);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots/availability:
 *   get:
 *     tags: [Slot Management]
 *     summary: Get slot availability for a group
 *     description: |
 *       Provides comprehensive slot availability analysis for a group, including available positions, occupied slots, and capacity utilization statistics. Useful for planning assignments and monitoring group capacity.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Slot availability retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Slot availability retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     groupId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     availableSlots:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 3, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]
 *                       description: Array of available slot numbers
 *                     occupiedSlots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slotNumber:
 *                             type: integer
 *                             example: 2
 *                           teamRegistrationId:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           teamName:
 *                             type: string
 *                             example: Team Phoenix
 *                           playerCount:
 *                             type: integer
 *                             example: 4
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                     totalSlots:
 *                       type: integer
 *                       example: 25
 *                       description: Total slot positions available
 *                     maxAllowedSlots:
 *                       type: integer
 *                       example: 20
 *                       description: Maximum teams allowed in this group
 *                     availableCount:
 *                       type: integer
 *                       example: 20
 *                       description: Number of available slots
 *                     occupiedCount:
 *                       type: integer
 *                       example: 5
 *                       description: Number of occupied slots
 *                     utilizationPercentage:
 *                       type: number
 *                       example: 25.0
 *                       description: Percentage of slots currently occupied
 *                     canAssignMore:
 *                       type: boolean
 *                       example: true
 *                       description: Whether more teams can be assigned
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.get('/groups/:groupId/slots/availability', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.getSlotAvailability
);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots/auto-assign:
 *   post:
 *     tags: [Slot Management]
 *     summary: Automatically assign teams to available slots
 *     description: |
 *       Automatically assigns registered teams to available slot positions using various assignment strategies. Only group/tournament owners can auto-assign. Assignment is atomic and audit-trailed.
 *       
 *       **Assignment Strategies:**
 *       - RANDOM: Random distribution of teams
 *       - BALANCED: Even distribution by skill/ranking
 *       - SKILL_BASED: Assignment by skill/ranking
 *       - MANUAL_ORDER: Assignment by provided team priority list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [strategy]
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: [RANDOM, BALANCED, SKILL_BASED, MANUAL_ORDER]
 *                 example: BALANCED
 *                 description: Assignment strategy to use
 *               excludeSlots:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 25]
 *                 description: Slot numbers to exclude from assignment (optional)
 *               teamPriorities:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     teamRegistrationId:
 *                       type: string
 *                       format: uuid
 *                       example: "456e7890-e12c-34f5-b678-789012345678"
 *                     priority:
 *                       type: integer
 *                       example: 10
 *                     preferredSlots:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [5, 10, 15]
 *                 description: Team priority configuration for manual ordering (optional)
 *           example:
 *             strategy: BALANCED
 *             excludeSlots: [1, 25]
 *             teamPriorities:
 *               - teamRegistrationId: "456e7890-e12c-34f5-b678-789012345678"
 *                 priority: 10
 *                 preferredSlots: [5, 10]
 *     responses:
 *       200:
 *         description: Auto assignment completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Auto assignment completed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     assignedCount:
 *                       type: integer
 *                       example: 8
 *                       description: Number of teams successfully assigned
 *                     assignments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "789e0123-e45f-67g8-h901-234567890123"
 *                           slotNumber:
 *                             type: integer
 *                             example: 5
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                             example: "123e4567-e89b-12d3-a456-426614174000"
 *                           teamRegistrationId:
 *                             type: string
 *                             format: uuid
 *                             example: "456e7890-e12c-34f5-b678-789012345678"
 *                           teamName:
 *                             type: string
 *                             example: Team Phoenix
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           slotType:
 *                             type: string
 *                             enum: [TEAM_SLOT, MANAGEMENT_SLOT, RESERVED_SLOT]
 *                             example: TEAM_SLOT
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2024-01-15T10:30:00.000Z"
 *                           assignedBy:
 *                             type: string
 *                             format: uuid
 *                             example: "user123-4567-89ab-cdef-0123456789ab"
 *                           dbStatus:
 *                             type: string
 *                             enum: [PENDING_SYNC, SYNCED, ERROR]
 *                             example: PENDING_SYNC
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *                       description: List of errors encountered during assignment
 *                     strategy:
 *                       type: string
 *                       enum: [RANDOM, BALANCED, SKILL_BASED, MANUAL_ORDER]
 *                       example: BALANCED
 *                     executionTime:
 *                       type: number
 *                       example: 1.25
 *                       description: Assignment execution time in seconds
 *       400:
 *         description: Validation error or failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Auto assignment failed
 *                 error:
 *                   type: string
 *                   example: No eligible teams found for assignment
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.post('/groups/:groupId/slots/auto-assign', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.autoAssignSlots
);

/**
 * @swagger
 * /api/v1/slot-management/groups/{groupId}/slots/swap:
 *   post:
 *     tags: [Slot Management]
 *     summary: Swap teams between two slots
 *     description: |
 *       Swaps team assignments between two slot positions within a group. Both slots must exist and be currently occupied. Operation is atomic and audit-trailed. Only group/tournament owners can swap slots.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 *         description: Group UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [slot1, slot2]
 *             properties:
 *               slot1:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 25
 *                 example: 5
 *                 description: First slot number for swap operation
 *               slot2:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 25
 *                 example: 10
 *                 description: Second slot number for swap operation
 *               reason:
 *                 type: string
 *                 maxLength: 200
 *                 example: Balancing group strength distribution
 *                 description: Optional reason for the swap operation
 *           example:
 *             slot1: 5
 *             slot2: 10
 *             reason: Balancing group strength distribution
 *     responses:
 *       200:
 *         description: Slots swapped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Slots swapped successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     slot1:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "789e0123-e45f-67g8-h901-234567890123"
 *                         slotNumber:
 *                           type: integer
 *                           example: 5
 *                         groupId:
 *                           type: string
 *                           format: uuid
 *                           example: "123e4567-e89b-12d3-a456-426614174000"
 *                         teamRegistrationId:
 *                           type: string
 *                           format: uuid
 *                           example: "abc12345-e67f-89g0-h123-456789012345"
 *                         teamName:
 *                           type: string
 *                           example: Team Thunder
 *                         isActive:
 *                           type: boolean
 *                           example: true
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2024-01-15T16:45:00.000Z"
 *                     slot2:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "def67890-e23f-45g6-h789-012345678901"
 *                         slotNumber:
 *                           type: integer
 *                           example: 10
 *                         groupId:
 *                           type: string
 *                           format: uuid
 *                           example: "123e4567-e89b-12d3-a456-426614174000"
 *                         teamRegistrationId:
 *                           type: string
 *                           format: uuid
 *                           example: "456e7890-e12c-34f5-b678-789012345678"
 *                         teamName:
 *                           type: string
 *                           example: Team Phoenix
 *                         isActive:
 *                           type: boolean
 *                           example: true
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *                           example: "2024-01-15T16:45:00.000Z"
 *                     reason:
 *                       type: string
 *                       example: Balancing group strength distribution
 *                     swappedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T16:45:00.000Z"
 *                     swappedBy:
 *                       type: string
 *                       format: uuid
 *                       example: "user123-4567-89ab-cdef-0123456789ab"
 *       400:
 *         description: Slot swap validation error or failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Slot swap failed
 *                 error:
 *                   type: string
 *                   example: One or both slots are empty or invalid
 *       401:
 *         $ref: '#/components/schemas/UnauthorizedErrorResponse'
 *       403:
 *         $ref: '#/components/schemas/ForbiddenErrorResponse'
 *       404:
 *         $ref: '#/components/schemas/NotFoundErrorResponse'
 *       500:
 *         $ref: '#/components/schemas/ServerErrorResponse'
 */
slotManagementRouter.post('/groups/:groupId/slots/swap', 
    validateRequest(groupParamsSchema, 'params'),
    SlotManagementController.swapSlots
);

export default slotManagementRouter;