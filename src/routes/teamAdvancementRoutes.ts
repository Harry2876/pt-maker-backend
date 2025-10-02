import { Router } from 'express';
import { TeamAdvancementController } from '../controllers/teamAdvancementController';
import { authenticateUser } from '../middleware/auth';

/**
 * @swagger
 * tags:
 *   - name: Team Advancement
 *     description: Team progression and bracket management

 */

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateUser);

/**
 * @swagger
 * /api/team-advancement/stage/{stageId}/qualify:
 *   post:
 *     summary: Qualify teams from a stage based on group rankings
 *     description: |
 *       Automatically qualifies teams from all groups in a stage based on their performance rankings.
 *       
 *       **Process:**
 *       1. Analyzes leaderboards for all groups in the stage
 *       2. Applies qualification criteria (top N teams per group)
 *       3. Uses tie-breaking rules for teams with equal points
 *       4. Updates team registration status (QUALIFIED/ELIMINATED)
 *       5. Caches qualification results for future reference
 *       
 *       **Qualification Logic:**
 *       - Primary: Total points (descending)
 *       - Tie-breaker 1: Total kills (descending)
 *       - Tie-breaker 2: Best position (ascending - lower is better)
 *       
 *       **Requirements:**
 *       - Stage must exist and have groups with teams
 *       - Groups must have completed matches with results
 *       - User must own the tournament
 *       
 *       **Response Data:**
 *       - Complete qualification summary with qualified/eliminated teams
 *       - Group-by-group breakdown of results
 *       - Average points required to qualify
 *       - Detailed team performance data
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Teams qualified successfully
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
 *                   example: "Teams qualified successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stageId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     stageName:
 *                       type: string
 *                       example: "Quarter Finals"
 *                     totalGroups:
 *                       type: integer
 *                       example: 4
 *                       description: "Number of groups in this stage"
 *                     totalTeamsStarted:
 *                       type: integer
 *                       example: 32
 *                       description: "Total teams that participated in this stage"
 *                     totalTeamsQualified:
 *                       type: integer
 *                       example: 16
 *                       description: "Total teams that qualified to next stage"
 *                     qualificationSummary:
 *                       type: object
 *                       properties:
 *                         teamsAdvanced:
 *                           type: integer
 *                           example: 16
 *                         teamsEliminated:
 *                           type: integer
 *                           example: 16
 *                         averagePointsToQualify:
 *                           type: number
 *                           example: 85
 *                           description: "Average points needed to qualify"
 *                     groupResults:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                           groupName:
 *                             type: string
 *                             example: "Group A"
 *                           totalTeams:
 *                             type: integer
 *                             example: 8
 *                           qualificationSpots:
 *                             type: integer
 *                             example: 4
 *                           qualifiedTeams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamRegistrationId:
 *                                   type: string
 *                                   format: uuid
 *                                 teamName:
 *                                   type: string
 *                                   example: "Team Alpha"
 *                                 finalGroupPosition:
 *                                   type: integer
 *                                   example: 1
 *                                   description: "Final ranking within the group"
 *                                 totalPoints:
 *                                   type: number
 *                                   example: 95
 *                                 totalKills:
 *                                   type: integer
 *                                   example: 45
 *                                 fromGroupId:
 *                                   type: string
 *                                   format: uuid
 *                                 fromGroupName:
 *                                   type: string
 *                                   example: "Group A"
 *                                 qualificationReason:
 *                                   type: string
 *                                   example: "Qualified as #1 (Top 4)"
 *                           eliminatedTeams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamRegistrationId:
 *                                   type: string
 *                                   format: uuid
 *                                 teamName:
 *                                   type: string
 *                                   example: "Team Beta"
 *                                 finalGroupPosition:
 *                                   type: integer
 *                                   example: 5
 *                                 totalPoints:
 *                                   type: number
 *                                   example: 42
 *                                 eliminationReason:
 *                                   type: string
 *                                   example: "Eliminated at #5 (Only top 4 qualify)"
 *       400:
 *         description: Failed to qualify teams
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
 *                   example: "Failed to qualify teams from stage"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "No groups found for this stage"
 *       401:
 *         description: Unauthorized
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
 *                   example: "Unauthorized access"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       404:
 *         description: Stage not found
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
 *                   example: "Stage not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Stage with the provided ID does not exist or you don't have access to it"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 */
router.post('/stage/:stageId/qualify', TeamAdvancementController.qualifyTeamsFromStage);

/**
 * @swagger
 * /api/team-advancement/stage/{stageId}/qualification-results:
 *   get:
 *     summary: Get qualification results for a stage
 *     description: |
 *       Retrieves cached qualification results for a specific stage.
 *       
 *       **Use Cases:**
 *       - View qualification results after running qualification process
 *       - Check which teams qualified vs eliminated
 *       - Analyze performance statistics for stage
 *       - Frontend display of qualification status
 *       
 *       **Response includes:**
 *       - Complete qualification summary
 *       - Team performance breakdown by group
 *       - Qualification statistics and averages
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Qualification results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QualificationResultResponse'
 *       404:
 *         description: No qualification results found for this stage
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
 *                   example: "No qualification results found for this stage"
 */
router.get('/stage/:stageId/qualification-results', TeamAdvancementController.getStageQualificationResults);

/**
 * @swagger
 * /api/team-advancement/progress/{currentStageId}/to/{nextStageId}:
 *   post:
 *     summary: Progress qualified teams to next stage
 *     description: |
 *       Redistributes qualified teams from current stage into the next stage's groups using the specified distribution strategy.
 *       
 *       **Prerequisites:**
 *       - Teams must be qualified from current stage (run qualification first)
 *       - Next stage must exist with created groups
 *       - Groups in next stage must have sufficient capacity
 *       
 *       **Process:**
 *       1. Retrieves qualified teams from current stage
 *       2. Gets next stage groups (created by organizer)
 *       3. Applies selected distribution strategy
 *       4. Updates team registrations with new group assignments
 *       5. Reserves management slots as configured
 *       
 *       **Distribution Strategies Explained:**
 *       
 *       **RANDOM:**
 *       - Teams shuffled randomly
 *       - Distributed evenly across groups
 *       - Good for casual tournaments
 *       
 *       **BALANCED:**
 *       - Teams sorted by total points (best to worst)
 *       - Distributed to balance group strength
 *       - Ensures competitive balance
 *       
 *       **SNAKE_DRAFT:**
 *       - Top performers distributed in snake pattern
 *       - Round 1: Group A→B→C→D
 *       - Round 2: Group D→C→B→A
 *       - Optimal for competitive balance
 *       
 *       **SEEDED:**
 *       - Top teams spread evenly across all groups
 *       - Team #1→Group A, #2→Group B, #3→Group C, #4→Group D, #5→Group A...
 *       - Ensures each group has similar skill distribution
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currentStageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Current stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *       - in: path
 *         name: nextStageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Next stage UUID identifier
 *         example: "789e0123-e45f-67g8-h901-234567890123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - strategy
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: ['RANDOM', 'BALANCED', 'SNAKE_DRAFT', 'SEEDED']
 *                 description: |
 *                   Distribution strategy for team redistribution
 *                   - RANDOM: Random distribution
 *                   - BALANCED: Balanced by points
 *                   - SNAKE_DRAFT: Snake draft pattern
 *                   - SEEDED: Seeded distribution
 *                 example: "SNAKE_DRAFT"
 *               preserveTopPerformers:
 *                 type: boolean
 *                 description: Whether to spread top teams across groups (used with BALANCED strategy)
 *                 example: true
 *                 default: false
 *               balanceByPoints:
 *                 type: boolean
 *                 description: Whether to balance groups by total points
 *                 example: true
 *                 default: false
 *           examples:
 *             snake_draft:
 *               summary: Snake Draft Distribution
 *               value:
 *                 strategy: "SNAKE_DRAFT"
 *                 preserveTopPerformers: true
 *             balanced:
 *               summary: Balanced Distribution
 *               value:
 *                 strategy: "BALANCED"
 *                 preserveTopPerformers: true
 *                 balanceByPoints: true
 *             random:
 *               summary: Random Distribution
 *               value:
 *                 strategy: "RANDOM"
 *             seeded:
 *               summary: Seeded Distribution
 *               value:
 *                 strategy: "SEEDED"
 *     responses:
 *       200:
 *         description: Teams progressed successfully
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
 *                   example: "Teams progressed to next stage successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     fromStage:
 *                       type: object
 *                       properties:
 *                         stageId:
 *                           type: string
 *                           format: uuid
 *                         stageName:
 *                           type: string
 *                           example: "Quarter Finals"
 *                         totalTeamsQualified:
 *                           type: integer
 *                           example: 16
 *                     toStage:
 *                       type: object
 *                       properties:
 *                         stageId:
 *                           type: string
 *                           format: uuid
 *                         stageName:
 *                           type: string
 *                           example: "Semi Finals"
 *                         totalGroups:
 *                           type: integer
 *                           example: 2
 *                         maxTeamsPerGroup:
 *                           type: integer
 *                           example: 25
 *                     teamDistribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           groupId:
 *                             type: string
 *                             format: uuid
 *                           groupName:
 *                             type: string
 *                             example: "Group A"
 *                           assignedTeams:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 teamRegistrationId:
 *                                   type: string
 *                                   format: uuid
 *                                 teamName:
 *                                   type: string
 *                                   example: "Team Alpha"
 *                                 totalPoints:
 *                                   type: number
 *                                   example: 95
 *                                 totalKills:
 *                                   type: integer
 *                                   example: 45
 *                           managementSlots:
 *                             type: integer
 *                             example: 2
 *                             description: "Number of slots reserved for management"
 *                           totalSlots:
 *                             type: integer
 *                             example: 25
 *                           filledSlots:
 *                             type: integer
 *                             example: 8
 *                     progressionSummary:
 *                       type: object
 *                       properties:
 *                         teamsAdvanced:
 *                           type: integer
 *                           example: 16
 *                         newGroupsPopulated:
 *                           type: integer
 *                           example: 2
 *                         averageTeamsPerGroup:
 *                           type: number
 *                           example: 8
 *                         managementSlotsReserved:
 *                           type: integer
 *                           example: 4
 *       400:
 *         description: Invalid distribution strategy or progression failed
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
 *                   example: "Failed to progress teams to next stage"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Next stage not found. Please create the next stage first."
 */
router.post('/progress/:currentStageId/to/:nextStageId', TeamAdvancementController.progressTeamsToNextStage);

/**
 * @swagger
 * /api/team-advancement/complete-progression/{currentStageId}/to/{nextStageId}:
 *   post:
 *     summary: Complete full stage progression (all-in-one)
 *     description: |
 *       Performs complete automated stage progression including qualification, redistribution, slot assignment, and stage advancement.
 *       
 *       **This endpoint combines all progression steps:**
 *       1. **Qualify Teams** - Automatically qualify teams from current stage groups
 *       2. **Redistribute Teams** - Move qualified teams to next stage groups
 *       3. **Assign Slots** - Auto-assign teams to slots in new groups (slot 1, 2, 3...)
 *       4. **Advance Stage** - Mark current stage as completed, activate next stage
 *       
 *       **Benefits:**
 *       - One API call for complete progression
 *       - Atomic operation (all steps succeed or fail together)
 *       - Reduces complexity for frontend implementation
 *       - Automatic error handling and rollback
 *       
 *       **Use This When:**
 *       - You want fully automated progression
 *       - Frontend needs simple one-click advancement
 *       - You don't need granular control over each step
 *       
 *       **Use Individual Endpoints When:**
 *       - You need custom logic between steps
 *       - You want to review qualification results before redistribution
 *       - You need to handle errors at specific steps
 *       - You want manual slot assignment control
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: currentStageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Current stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *       - in: path
 *         name: nextStageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Next stage UUID identifier
 *         example: "789e0123-e45f-67g8-h901-234567890123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - strategy
 *             properties:
 *               strategy:
 *                 type: string
 *                 enum: ['RANDOM', 'BALANCED', 'SNAKE_DRAFT', 'SEEDED']
 *                 description: Distribution strategy for team redistribution
 *                 example: "SNAKE_DRAFT"
 *               preserveTopPerformers:
 *                 type: boolean
 *                 description: Whether to spread top teams across groups
 *                 example: true
 *                 default: false
 *               balanceByPoints:
 *                 type: boolean
 *                 description: Whether to balance groups by total points
 *                 example: true
 *                 default: false
 *           examples:
 *             complete_progression:
 *               summary: Complete Automated Progression
 *               value:
 *                 strategy: "SNAKE_DRAFT"
 *                 preserveTopPerformers: true
 *     responses:
 *       200:
 *         description: Stage progression completed successfully
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
 *                   example: "Stage progression completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     qualificationResult:
 *                       $ref: '#/components/schemas/StageQualificationResult'
 *                     progressionResult:
 *                       $ref: '#/components/schemas/StageProgressionResult'
 *                     slotAssignmentResults:
 *                       type: object
 *                       properties:
 *                         totalSlotsAssigned:
 *                           type: integer
 *                           example: 16
 *                           description: "Total number of slot assignments made"
 *                         groupResults:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               groupId:
 *                                 type: string
 *                                 format: uuid
 *                               groupName:
 *                                 type: string
 *                                 example: "Group A"
 *                               teamsAssigned:
 *                                 type: integer
 *                                 example: 8
 *                               slotsUsed:
 *                                 type: integer
 *                                 example: 8
 *                     stageAdvancementResult:
 *                       type: object
 *                       properties:
 *                         completedStage:
 *                           type: object
 *                           description: "Details of the completed stage"
 *                         nextStage:
 *                           type: object
 *                           description: "Details of the activated next stage"
 *                         tournamentCompleted:
 *                           type: boolean
 *                           example: false
 *                           description: "Whether this was the final stage"
 *                     summary:
 *                       type: object
 *                       properties:
 *                         teamsQualified:
 *                           type: integer
 *                           example: 16
 *                         teamsEliminated:
 *                           type: integer
 *                           example: 16
 *                         newGroupsPopulated:
 *                           type: integer
 *                           example: 2
 *                         slotsAssigned:
 *                           type: integer
 *                           example: 16
 *                         nextStageActivated:
 *                           type: boolean
 *                           example: true
 *       400:
 *         description: Failed to complete stage progression
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
 *                   example: "Failed to complete stage progression"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "PROGRESSION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Failed to qualify teams from current stage"
 */
router.post('/complete-progression/:currentStageId/to/:nextStageId', TeamAdvancementController.completeStageProgression);

/**
 * @swagger
 * /api/team-advancement/stage/{stageId}/groups:
 *   post:
 *     summary: Create groups for a stage
 *     description: |
 *       Creates multiple groups for a specific tournament stage in bulk.
 *       
 *       **Purpose:**
 *       - Organizers can create groups for upcoming stages
 *       - Groups define the structure for team redistribution
 *       - Each group has its own team limits and qualification rules
 *       
 *       **Group Configuration:**
 *       - **name**: Group identifier (usually A, B, C, etc.)
 *       - **maxTeams**: Maximum teams that can be assigned to this group
 *       - **qualificationSpots**: How many teams qualify from this group to next stage
 *       
 *       **Best Practices:**
 *       - Create groups before attempting team redistribution
 *       - Ensure total capacity across groups >= qualified teams from previous stage
 *       - Use consistent naming (Group A, Group B, etc.)
 *       - Plan qualification spots to match next stage capacity
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - groupsData
 *             properties:
 *               groupsData:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 20
 *                 description: Array of group configurations to create
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                   properties:
 *                     name:
 *                       type: string
 *                       minLength: 1
 *                       maxLength: 50
 *                       description: Group name (usually A, B, C, etc.)
 *                       example: "Group A"
 *                     maxTeams:
 *                       type: integer
 *                       minimum: 2
 *                       maximum: 50
 *                       default: 24
 *                       description: Maximum teams that can be assigned to this group
 *                       example: 8
 *                     qualificationSpots:
 *                       type: integer
 *                       minimum: 1
 *                       default: 8
 *                       description: Number of teams that qualify from this group
 *                       example: 4
 *           examples:
 *             semifinals:
 *               summary: Semi-Finals Groups (2 groups, 8 teams each, top 4 qualify)
 *               value:
 *                 groupsData:
 *                   - name: "Group A"
 *                     maxTeams: 8
 *                     qualificationSpots: 4
 *                   - name: "Group B"
 *                     maxTeams: 8
 *                     qualificationSpots: 4
 *             quarterfinals:
 *               summary: Quarter-Finals Groups (4 groups, 8 teams each, top 2 qualify)
 *               value:
 *                 groupsData:
 *                   - name: "Group A"
 *                     maxTeams: 8
 *                     qualificationSpots: 2
 *                   - name: "Group B"
 *                     maxTeams: 8
 *                     qualificationSpots: 2
 *                   - name: "Group C"
 *                     maxTeams: 8
 *                     qualificationSpots: 2
 *                   - name: "Group D"
 *                     maxTeams: 8
 *                     qualificationSpots: 2
 *             finals:
 *               summary: Finals Group (1 group, 8 teams, winner takes all)
 *               value:
 *                 groupsData:
 *                   - name: "Finals"
 *                     maxTeams: 8
 *                     qualificationSpots: 1
 *     responses:
 *       201:
 *         description: Stage groups created successfully
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
 *                   example: "Stage groups created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stageId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     stageName:
 *                       type: string
 *                       example: "Semi Finals"
 *                     totalGroups:
 *                       type: integer
 *                       example: 2
 *                       description: "Number of groups created"
 *                     createdGroups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                             example: "Group A"
 *                           maxTeams:
 *                             type: integer
 *                             example: 8
 *                           qualificationSpots:
 *                             type: integer
 *                             example: 4
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                           stageId:
 *                             type: string
 *                             format: uuid
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           dbStatus:
 *                             type: string
 *                             enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *                             example: "PENDING_SYNC"
 *       400:
 *         description: Invalid groups data
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
 *                   example: "Failed to create stage groups"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Groups data is required and must be a non-empty array"
 */
router.post('/stage/:stageId/groups', TeamAdvancementController.createStageGroups);

/**
 * @swagger
 * /api/team-advancement/stage/{stageId}/groups:
 *   get:
 *     summary: Get groups for a stage
 *     description: |
 *       Retrieves all groups associated with a specific tournament stage.
 *       
 *       **Use Cases:**
 *       - View stage structure before team redistribution
 *       - Check group capacity and qualification rules
 *       - Frontend display of stage organization
 *       - Validate stage setup before progression
 *       
 *       **Response includes:**
 *       - Complete group configuration
 *       - Total group count for the stage
 *       - Group capacity and qualification settings
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Stage groups retrieved successfully
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
 *                   example: "Stage groups retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stageId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     totalGroups:
 *                       type: integer
 *                       example: 2
 *                       description: "Number of groups in this stage"
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                             example: "Group A"
 *                           maxTeams:
 *                             type: integer
 *                             example: 8
 *                             description: "Maximum teams that can be assigned"
 *                           qualificationSpots:
 *                             type: integer
 *                             example: 4
 *                             description: "Teams that qualify from this group"
 *                           tournamentId:
 *                             type: string
 *                             format: uuid
 *                           stageId:
 *                             type: string
 *                             format: uuid
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                           dbStatus:
 *                             type: string
 *                             enum: ["PENDING_SYNC", "SYNCED", "ERROR"]
 *       401:
 *         description: Unauthorized
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
 *                   example: "Unauthorized access"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       403:
 *         description: Access denied
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
 *                   example: "Access denied"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     details:
 *                       type: string
 *                       example: "You don't have permission to access this stage"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 *       404:
 *         description: Stage not found
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
 *                   example: "Stage not found"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     details:
 *                       type: string
 *                       example: "Stage with the provided ID does not exist or you don't have access to it"
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 meta:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     version:
 *                       type: string
 *                       example: "1.0"
 */
router.get('/stage/:stageId/groups', TeamAdvancementController.getStageGroups);

/**
 * @swagger
 * /api/team-advancement/stage/{stageId}/progression-results:
 *   get:
 *     summary: Get progression results for a stage
 *     description: |
 *       Retrieves cached team progression results showing redistribution to next stage.
 *       
 *       **Use Cases:**
 *       - View redistribution results after team progression
 *       - Check team assignments in next stage groups
 *       - Analyze distribution balance and fairness
 *       - Frontend display of progression status
 *       
 *       **Response includes:**
 *       - Source and destination stage information
 *       - Complete team distribution across new groups
 *       - Progression statistics and summary
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Stage UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Progression results retrieved successfully
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
 *                   example: "Progression results retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/StageProgressionResult'
 *       404:
 *         description: No progression results found
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
 *                   example: "No progression results found for this stage"
 */
router.get('/stage/:stageId/progression-results', TeamAdvancementController.getStageProgressionResults);

/**
 * @swagger
 * /api/team-advancement/tournament/{tournamentId}/progress:
 *   get:
 *     summary: Get complete tournament progress
 *     description: |
 *       Retrieves comprehensive tournament progress including overall status, stage completion, and detailed progression analytics.
 *       
 *       **This endpoint provides:**
 *       - Overall tournament progress percentage
 *       - Current active stage information
 *       - Progress details for each stage (qualification/progression)
 *       - Group information and statistics
 *       - Team advancement tracking
 *       
 *       **Perfect for:**
 *       - Tournament dashboard displays
 *       - Progress tracking for organizers
 *       - Real-time tournament status monitoring
 *       - Frontend progress bars and statistics
 *       
 *       **Response Structure:**
 *       - High-level tournament status
 *       - Stage-by-stage breakdown
 *       - Qualification and progression summaries
 *       - Group population statistics
 *     tags: [Team Advancement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tournamentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Tournament UUID identifier
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Tournament progress retrieved successfully
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
 *                   example: "Tournament progress retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     tournamentId:
 *                       type: string
 *                       format: uuid
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     totalStages:
 *                       type: integer
 *                       example: 4
 *                       description: "Total number of stages in tournament"
 *                     completedStages:
 *                       type: integer
 *                       example: 2
 *                       description: "Number of stages completed"
 *                     currentStage:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         stageNumber:
 *                           type: integer
 *                           example: 3
 *                         name:
 *                           type: string
 *                           example: "Semi Finals"
 *                         id:
 *                           type: string
 *                           format: uuid
 *                       description: "Currently active stage (null if tournament completed)"
 *                     overallProgress:
 *                       type: number
 *                       example: 50
 *                       description: "Overall tournament progress percentage (0-100)"
 *                     stageProgress:
 *                       type: array
 *                       description: "Detailed progress for each stage"
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                                 example: "Quarter Finals"
 *                               stageNumber:
 *                                 type: integer
 *                                 example: 2
 *                               isActive:
 *                                 type: boolean
 *                                 example: false
 *                               isCompleted:
 *                                 type: boolean
 *                                 example: true
 *                               totalGroups:
 *                                 type: integer
 *                                 example: 4
 *                           groups:
 *                             type: integer
 *                             example: 4
 *                             description: "Number of groups in this stage"
 *                           qualification:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               teamsQualified:
 *                                 type: integer
 *                                 example: 16
 *                               teamsEliminated:
 *                                 type: integer
 *                                 example: 16
 *                               averagePointsToQualify:
 *                                 type: number
 *                                 example: 85
 *                             description: "Qualification results (null if not yet qualified)"
 *                           progression:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               teamsAdvanced:
 *                                 type: integer
 *                                 example: 16
 *                               newGroupsPopulated:
 *                                 type: integer
 *                                 example: 2
 *                             description: "Progression results (null if not yet progressed)"
 *       404:
 *         description: Tournament not found or no stages found
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
 *                   example: "No stages found for this tournament"
 *       500:
 *         description: Failed to retrieve tournament progress
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
 *                   example: "Failed to retrieve tournament progress"
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "INTERNAL_ERROR"
 *                     details:
 *                       type: string
 *                       example: "Database connection failed"
 */
router.get('/tournament/:tournamentId/progress', TeamAdvancementController.getTournamentProgress);

/**
 * @swagger
 * components:
 *   schemas:
 *     StageQualificationResult:
 *       type: object
 *       properties:
 *         stageId:
 *           type: string
 *           format: uuid
 *         stageName:
 *           type: string
 *         totalGroups:
 *           type: integer
 *         totalTeamsStarted:
 *           type: integer
 *         totalTeamsQualified:
 *           type: integer
 *         qualificationSummary:
 *           type: object
 *           properties:
 *             teamsAdvanced:
 *               type: integer
 *             teamsEliminated:
 *               type: integer
 *             averagePointsToQualify:
 *               type: number
 *         groupResults:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               groupId:
 *                 type: string
 *                 format: uuid
 *               groupName:
 *                 type: string
 *               totalTeams:
 *                 type: integer
 *               qualificationSpots:
 *                 type: integer
 *               qualifiedTeams:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/QualifiedTeam'
 *               eliminatedTeams:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/EliminatedTeam'
 * 
 *     StageProgressionResult:
 *       type: object
 *       properties:
 *         fromStage:
 *           type: object
 *           properties:
 *             stageId:
 *               type: string
 *               format: uuid
 *             stageName:
 *               type: string
 *             totalTeamsQualified:
 *               type: integer
 *         toStage:
 *           type: object
 *           properties:
 *             stageId:
 *               type: string
 *               format: uuid
 *             stageName:
 *               type: string
 *             totalGroups:
 *               type: integer
 *             maxTeamsPerGroup:
 *               type: integer
 *         teamDistribution:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/GroupTeamAssignment'
 *         progressionSummary:
 *           type: object
 *           properties:
 *             teamsAdvanced:
 *               type: integer
 *             newGroupsPopulated:
 *               type: integer
 *             averageTeamsPerGroup:
 *               type: number
 *             managementSlotsReserved:
 *               type: integer
 * 
 *     QualifiedTeam:
 *       type: object
 *       properties:
 *         teamRegistrationId:
 *           type: string
 *           format: uuid
 *         teamName:
 *           type: string
 *         finalGroupPosition:
 *           type: integer
 *         totalPoints:
 *           type: number
 *         totalKills:
 *           type: integer
 *         fromGroupId:
 *           type: string
 *           format: uuid
 *         fromGroupName:
 *           type: string
 *         qualificationReason:
 *           type: string
 * 
 *     EliminatedTeam:
 *       type: object
 *       properties:
 *         teamRegistrationId:
 *           type: string
 *           format: uuid
 *         teamName:
 *           type: string
 *         finalGroupPosition:
 *           type: integer
 *         totalPoints:
 *           type: number
 *         eliminationReason:
 *           type: string
 * 
 *     GroupTeamAssignment:
 *       type: object
 *       properties:
 *         groupId:
 *           type: string
 *           format: uuid
 *         groupName:
 *           type: string
 *         assignedTeams:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/QualifiedTeam'
 *         managementSlots:
 *           type: integer
 *         totalSlots:
 *           type: integer
 *         filledSlots:
 *           type: integer
 * 
 *     QualificationResultResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           $ref: '#/components/schemas/StageQualificationResult'
 */

export default router;