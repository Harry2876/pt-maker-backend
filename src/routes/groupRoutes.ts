import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { GroupController } from '../controllers/groupController';
import { 
    createGroupSchema, 
    updateGroupSchema, 
    groupParamsSchema,
    tournamentGroupParamsSchema 
} from '../validations/groupValidation';

/**
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Group management operations
 */

const groupRouter = express.Router();

// Apply authentication to all group routes
groupRouter.use(authenticateUser);

/**
 * @swagger
 * /api/v1/groups/tournaments/{tournamentId}/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Get tournament groups
 *     description: Get all groups for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Groups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: No groups found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/v1/groups/tournaments/{tournamentId}/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Get tournament groups
 *     description: Get all groups for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     responses:
 *       200:
 *         description: Tournament groups retrieved successfully
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
 *                   example: "Tournament groups retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Group'
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Tournament-specific group routes (nested resources)
groupRouter.get('/tournaments/:tournamentId/groups', 
    validateRequest(tournamentGroupParamsSchema, 'params'),
    GroupController.getTournamentGroups                                     // GET /groups/tournaments/:tournamentId/groups
);

/**
 * @swagger
 * /api/v1/groups/tournaments/{tournamentId}/groups/create:
 *   post:
 *     tags: [Groups]
 *     summary: Create group for tournament
 *     description: Create a new group for a specific tournament
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGroupRequest'
 *     responses:
 *       201:
 *         description: Group created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
groupRouter.post('/tournaments/:tournamentId/groups/create', 
    validateRequest(tournamentGroupParamsSchema, 'params'),
    validateRequest(createGroupSchema),
    GroupController.createGroup                                              // POST /groups/tournaments/:tournamentId/groups/create
);

/**
 * @swagger
 * /api/v1/groups/get/{id}:
 *   get:
 *     tags: [Groups]
 *     summary: Get group by ID
 *     description: Get a specific group by its ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Group not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Individual group operations
groupRouter.get('/get/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.getGroupById                                             // GET /groups/get/:id
);

/**
 * @swagger
 * /api/v1/groups/update/{id}:
 *   put:
 *     tags: [Groups]
 *     summary: Update group
 *     description: Update group details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Group ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateGroupRequest'
 *     responses:
 *       200:
 *         description: Group updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Group not found or not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
groupRouter.put('/update/:id', 
    validateRequest(groupParamsSchema, 'params'),
    validateRequest(updateGroupSchema),
    GroupController.updateGroup                                              // PUT /groups/update/:id
);

/**
 * @swagger
 * /api/v1/groups/delete/{id}:
 *   delete:
 *     tags: [Groups]
 *     summary: Delete group
 *     description: Delete a group by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Group deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         description: Group not found or not authorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
groupRouter.delete('/delete/:id', 
    validateRequest(groupParamsSchema, 'params'),
    GroupController.deleteGroup                                              // DELETE /groups/delete/:id
);

export default groupRouter;