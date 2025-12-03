import { z } from 'zod';

// Screenshot upload validation
export const uploadQuickScreenshotSchema = z.object({
    type: z.enum(['ATTENDANCE', 'RESULT'] as const, {
        message: 'Screenshot type must be either ATTENDANCE or RESULT'
    }),
    
    pageNumber: z.number()
        .int('Page number must be an integer')
        .positive('Page number must be positive')
        .min(1, 'Page number must be at least 1')
        .max(20, 'Page number cannot exceed 20')
        .optional()
});

// Screenshot params
export const quickScreenshotParamsSchema = z.object({
    quickMatchId: z.string().cuid('Invalid quick match ID'),
    screenshotId: z.string().cuid('Invalid screenshot ID').optional()
});

// Query params for listing screenshots
export const listQuickScreenshotsQuerySchema = z.object({
    type: z.enum(['ATTENDANCE', 'RESULT'] as const).optional(),
    
    isProcessed: z.string()
        .transform(val => val === 'true')
        .optional()
});