import { Request, Response } from 'express';
import { adminDashboardService } from '../services/adminDashboardService';
import { adminReviewService } from '../services/adminReviewService';
import { ResponseHelper } from '../utils/responseHelper';
import { asyncHandler } from '../middleware/commonMiddleware';

export class AdminController {
    /**
     * GET /api/v1/admin/dashboard
     * Aggregated platform metrics for the locked admin web panel.
     */
    static getDashboard = asyncHandler(async (req: Request, res: Response) => {
        const query = (req as any).validatedQuery ?? req.query;

        const dashboard = await adminDashboardService.getDashboard({
            from: query.from as string | undefined,
            to: query.to as string | undefined,
            timezone: query.timezone as string | undefined,
            preset: query.preset as string | undefined,
        });

        return res.json(
            ResponseHelper.success('Admin dashboard data retrieved successfully', dashboard)
        );
    });

    /**
     * GET /api/v1/admin/reviews
     * OCR results that need manual review, with screenshots and parsed AI data.
     */
    static getReviews = asyncHandler(async (req: Request, res: Response) => {
        const query = (req as any).validatedQuery ?? req.query;

        const reviews = await adminReviewService.getReviewQueue({
            from: query.from as string | undefined,
            to: query.to as string | undefined,
            timezone: query.timezone as string | undefined,
            preset: query.preset as string | undefined,
            page: query.page != null ? Number(query.page) : undefined,
            limit: query.limit != null ? Number(query.limit) : undefined,
        });

        return res.json(
            ResponseHelper.success('Admin review queue retrieved successfully', reviews)
        );
    });
}
