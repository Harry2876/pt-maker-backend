import express, { Request, Response, NextFunction } from 'express';
import { DevAuthController } from '../controllers/devAuthController';
import { env } from '../config/env';

const devRouter = express.Router();

// Middleware 1: hard-block in production
devRouter.use((_req: Request, res: Response, next: NextFunction) => {
    if (env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    return next();
});

// Middleware 2: require X-Dev-Secret header matching DEV_SECRET env var
devRouter.use((req: Request, res: Response, next: NextFunction) => {
    const provided = req.headers['x-dev-secret'];
    const expected = env.DEV_SECRET;

    if (!expected) {
        return res.status(503).json({
            error: 'Dev token endpoint is not configured',
            message: 'Add DEV_SECRET (min 16 chars) to your .env file to enable this endpoint.',
        });
    }

    if (!provided || provided !== expected) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing or incorrect X-Dev-Secret header.',
        });
    }

    return next();
});

/**
 * POST /api/v1/dev/token
 * Returns a 30-day access token for the shared dev test account.
 * Requires header: X-Dev-Secret: <DEV_SECRET from .env>
 * Only available when NODE_ENV !== 'production'.
 */
devRouter.post('/token', DevAuthController.getDevToken);

export default devRouter;
