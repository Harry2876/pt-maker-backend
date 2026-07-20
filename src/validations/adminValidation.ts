import { z } from 'zod';

export const dashboardPresetValues = ['today', 'yesterday', 'week', 'month'] as const;

export const adminDashboardQuerySchema = z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    timezone: z.string().min(1).max(64).optional(),
    preset: z.enum(['today', 'yesterday', 'week', 'month', 'custom']).optional(),
});

export const adminReviewQuerySchema = adminDashboardQuerySchema.extend({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type AdminDashboardQuery = z.infer<typeof adminDashboardQuerySchema>;
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;
