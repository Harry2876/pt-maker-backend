import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { ScoringRuleController } from '../controllers/scoringRuleController';
import {
    createScoringRuleSchema,
    updateScoringRuleSchema,
    tournamentScoringRuleParamsSchema,
    scoringRuleParamsSchema,
    calculateScoreSchema,
    applyTemplateSchema,
    bulkCreateScoringRulesSchema,
    validateScoringRuleSchema
} from '../validations/scoringRuleValidation';

/**
 * @swagger
 * tags:
 *   - name: Scoring Rules
 *     description: Tournament scoring rule configuration and calculation
 */

const scoringRuleRouter = express.Router();

scoringRuleRouter.use(authenticateUser);

// Tournament-scoped rule CRUD
scoringRuleRouter.get(
    '/tournaments/:tournamentId/rules',
    validateRequest(tournamentScoringRuleParamsSchema, 'params'),
    ScoringRuleController.getTournamentScoringRules
);

scoringRuleRouter.post(
    '/tournaments/:tournamentId/rules',
    validateRequest(tournamentScoringRuleParamsSchema, 'params'),
    validateRequest(createScoringRuleSchema),
    ScoringRuleController.createScoringRule
);

scoringRuleRouter.post(
    '/tournaments/:tournamentId/rules/bulk',
    validateRequest(tournamentScoringRuleParamsSchema, 'params'),
    validateRequest(bulkCreateScoringRulesSchema),
    ScoringRuleController.bulkCreateScoringRules
);

// Score calculation and templates
scoringRuleRouter.post(
    '/tournaments/:tournamentId/calculate',
    validateRequest(tournamentScoringRuleParamsSchema, 'params'),
    validateRequest(calculateScoreSchema),
    ScoringRuleController.calculateScore
);

scoringRuleRouter.post(
    '/tournaments/:tournamentId/apply-template',
    validateRequest(tournamentScoringRuleParamsSchema, 'params'),
    validateRequest(applyTemplateSchema),
    ScoringRuleController.applyScoringTemplate
);

// Individual rule operations
scoringRuleRouter.get(
    '/rules/:ruleId',
    validateRequest(scoringRuleParamsSchema, 'params'),
    ScoringRuleController.getScoringRuleById
);

scoringRuleRouter.put(
    '/rules/:ruleId',
    validateRequest(scoringRuleParamsSchema, 'params'),
    validateRequest(updateScoringRuleSchema),
    ScoringRuleController.updateScoringRule
);

scoringRuleRouter.delete(
    '/rules/:ruleId',
    validateRequest(scoringRuleParamsSchema, 'params'),
    ScoringRuleController.deleteScoringRule
);

// Global utilities
scoringRuleRouter.get(
    '/templates',
    ScoringRuleController.getPopularTemplates
);

scoringRuleRouter.post(
    '/validate',
    validateRequest(validateScoringRuleSchema),
    ScoringRuleController.validateScoringRule
);

export default scoringRuleRouter;
