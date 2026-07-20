import express, { Request, Response, NextFunction } from 'express';
import { AdminController } from '../controllers/adminController';
import { adminDashboardAuth } from '../middleware/adminAuth';
import { validateRequest } from '../middleware/commonMiddleware';
import { adminDashboardQuerySchema, adminReviewQuerySchema } from '../validations/adminValidation';
import { env } from '../config/env';

const adminRouter = express.Router();

adminRouter.use((_req: Request, res: Response, next: NextFunction) => {
    if (!env.ENABLE_ADMIN_ROUTES) {
        return res.status(404).json({ error: 'Not found' });
    }
    return next();
});

adminRouter.use(adminDashboardAuth);

/**
 * GET /api/v1/admin/dashboard
 * Single endpoint for the admin web panel (DAU, OCR scans, peak hours, revenue, etc.).
 * Requires header: X-Admin-Secret: <ADMIN_DASHBOARD_SECRET from .env>
 */
adminRouter.get(
    '/dashboard',
    validateRequest(adminDashboardQuerySchema, 'query'),
    AdminController.getDashboard
);

/**
 * GET /api/v1/admin/reviews
 * Flagged OCR results with match screenshots and AI-read player/kill data.
 */
adminRouter.get(
    '/reviews',
    validateRequest(adminReviewQuerySchema, 'query'),
    AdminController.getReviews
);

export default adminRouter;
