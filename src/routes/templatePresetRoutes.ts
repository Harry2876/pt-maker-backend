import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { TemplatePresetController } from '../controllers/templatePresetController';
import {
    createTemplatePresetSchema,
    updateTemplatePresetSchema,
    templatePresetParamsSchema,
    listTemplatePresetsQuerySchema,
} from '../validations/templatePresetValidation';

const templatePresetRouter = express.Router();

templatePresetRouter.use(authenticateUser);

templatePresetRouter.post('/', validateRequest(createTemplatePresetSchema), TemplatePresetController.createPreset);
templatePresetRouter.get(
    '/',
    validateRequest(listTemplatePresetsQuerySchema, 'query'),
    TemplatePresetController.listPresets
);
templatePresetRouter.get(
    '/:presetId',
    validateRequest(templatePresetParamsSchema, 'params'),
    TemplatePresetController.getPreset
);
templatePresetRouter.put(
    '/:presetId',
    validateRequest(templatePresetParamsSchema, 'params'),
    validateRequest(updateTemplatePresetSchema),
    TemplatePresetController.updatePreset
);
templatePresetRouter.delete(
    '/:presetId',
    validateRequest(templatePresetParamsSchema, 'params'),
    TemplatePresetController.deletePreset
);

export default templatePresetRouter;
