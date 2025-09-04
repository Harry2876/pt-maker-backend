import { Request, Response } from 'express';
import { scoringRuleService } from '../services/scoringRuleService';
import { asyncHandler } from '../middleware/commonMiddleware';
import { ResponseHelper } from '../utils/responseHelper';

export class ScoringRuleController {
    // Create scoring rule
    static createScoringRule = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { ruleName, ruleType, killPoints, positionMultiplier, customFormula, description, priority } = req.body;
        const userId = req.user!.id;

        const scoringRule = await scoringRuleService.createScoringRule({
            tournamentId,
            ruleName,
            ruleType,
            killPoints,
            positionMultiplier,
            customFormula,
            description,
            priority
        }, userId);

        if (!scoringRule) {
            return res.status(400).json(ResponseHelper.validationError('Failed to create scoring rule'));
        }

        return res.status(201).json(ResponseHelper.success('Scoring rule created successfully', scoringRule));
    });

    // Get tournament scoring rules
    static getTournamentScoringRules = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const userId = req.user!.id;

        const rules = await scoringRuleService.getTournamentScoringRules(tournamentId);

        if (!rules || rules.length === 0) {
            return res.status(404).json(ResponseHelper.notFound('No scoring rules found for this tournament'));
        }

        return res.status(200).json(ResponseHelper.success('Tournament scoring rules retrieved successfully', {
            rules,
            count: rules.length
        }));
    });

    // Get scoring rule by ID
    static getScoringRuleById = asyncHandler(async (req: Request, res: Response) => {
        const { ruleId } = req.params;
        const userId = req.user!.id;

        const rule = await scoringRuleService.getScoringRule(ruleId);

        if (!rule) {
            return res.status(404).json(ResponseHelper.notFound('Scoring rule not found'));
        }

        return res.status(200).json(ResponseHelper.success('Scoring rule retrieved successfully', rule));
    });

    // Update scoring rule
    static updateScoringRule = asyncHandler(async (req: Request, res: Response) => {
        const { ruleId } = req.params;
        const updateData = req.body;
        const userId = req.user!.id;

        const updatedRule = await scoringRuleService.updateScoringRule(ruleId, updateData, userId);

        if (!updatedRule) {
            return res.status(404).json(ResponseHelper.notFound('Scoring rule not found or update failed'));
        }

        return res.status(200).json(ResponseHelper.success('Scoring rule updated successfully', updatedRule));
    });

    // Delete scoring rule
    static deleteScoringRule = asyncHandler(async (req: Request, res: Response) => {
        const { ruleId } = req.params;
        const userId = req.user!.id;

        const deleted = await scoringRuleService.deleteScoringRule(ruleId, userId);

        if (!deleted) {
            return res.status(404).json(ResponseHelper.notFound('Scoring rule not found or deletion failed'));
        }

        return res.status(200).json(ResponseHelper.success('Scoring rule deleted successfully'));
    });

    // Calculate score using tournament rules
    static calculateScore = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { kills, position, survivalTime, damage } = req.body;
        const userId = req.user!.id;

        const scoreResult = await scoringRuleService.calculateScore(tournamentId, {
            kills,
            position,
            survivalTime,
            customData: { damage }
        });

        return res.status(200).json(ResponseHelper.success('Score calculated successfully', scoreResult));
    });

    // Apply scoring template
    static applyScoringTemplate = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { templateId } = req.body;
        const userId = req.user!.id;

        const appliedRule = await scoringRuleService.applyTemplate(tournamentId, templateId, userId);

        if (!appliedRule) {
            return res.status(400).json(ResponseHelper.validationError('Failed to apply scoring template'));
        }

        return res.status(201).json(ResponseHelper.success('Scoring template applied successfully', appliedRule));
    });

    // Get popular scoring templates
    static getPopularTemplates = asyncHandler(async (req: Request, res: Response) => {
        const templates = scoringRuleService.getPopularTemplates();

        return res.status(200).json(ResponseHelper.success('Popular scoring templates retrieved successfully', {
            templates,
            count: templates.length
        }));
    });

    // Bulk create scoring rules
    static bulkCreateScoringRules = asyncHandler(async (req: Request, res: Response) => {
        const { tournamentId } = req.params;
        const { rules } = req.body;
        const userId = req.user!.id;

        const result = await scoringRuleService.bulkCreateRules({
            tournamentId,
            rules
        }, userId);

        return res.status(201).json(ResponseHelper.success('Bulk scoring rules created', result));
    });

    // Validate scoring rule
    static validateScoringRule = asyncHandler(async (req: Request, res: Response) => {
        const validationData = req.body;

        const validation = await scoringRuleService.validateScoringRule(validationData);

        return res.status(200).json(ResponseHelper.success('Scoring rule validation complete', validation));
    });
}