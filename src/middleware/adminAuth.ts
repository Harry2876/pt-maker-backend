import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ResponseHelper } from '../utils/responseHelper';
import logger from '../utils/logger';

/**
 * Protects admin dashboard routes with a shared secret header.
 * Pattern mirrors src/routes/devRoutes.ts (X-Dev-Secret).
 */
export const adminDashboardAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!env.ENABLE_ADMIN_ROUTES) {
        return res.status(404).json({ error: 'Not found' });
    }

    const expected = env.ADMIN_DASHBOARD_SECRET;
    if (!expected) {
        return res.status(503).json({
            error: 'Admin dashboard is not configured',
            message: 'Set ENABLE_ADMIN_ROUTES=true and ADMIN_DASHBOARD_SECRET (min 16 chars) in .env',
        });
    }

    const provided = req.headers['x-admin-secret'];
    if (!provided || provided !== expected) {
        logger.warn(`Unauthorized admin dashboard access attempt from IP: ${req.ip}`);
        return res.status(401).json(
            ResponseHelper.unauthorized('Missing or incorrect X-Admin-Secret header')
        );
    }

    return next();
};
