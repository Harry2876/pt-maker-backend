import express from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/commonMiddleware';
import { UploadController } from '../controllers/uploadController';
import { screenshotUpload, getUploadProgress } from '../middleware/fileUpload';
import { matchParamsSchema } from '../validations/matchValidation';

const uploadRouter = express.Router();

// Apply authentication to all upload routes
uploadRouter.use(authenticateUser);

// Screenshot upload routes
uploadRouter.post('/matches/:id/screenshots/upload',
    validateRequest(matchParamsSchema, 'params'),
    ...screenshotUpload, // This spreads the middleware array
    UploadController.uploadScreenshots
);

uploadRouter.get('/matches/:id/screenshots',
    validateRequest(matchParamsSchema, 'params'),
    UploadController.getMatchScreenshots
);

uploadRouter.delete('/screenshots/:id/delete',
    UploadController.deleteScreenshot
);

// Upload progress checking
uploadRouter.get('/progress/:uploadId',
    getUploadProgress
);

export default uploadRouter;