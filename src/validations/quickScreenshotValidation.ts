import { z } from 'zod';

// Screenshot upload validation
export const uploadQuickScreenshotSchema = z.object({
    type: z.enum(['ATTENDANCE', 'RESULT'] as const, {
        message: 'Screenshot type must be either ATTENDANCE or RESULT'
    }).optional(), // Make it optional since middleware handles it
    
    pageNumber: z.string()
    .transform(val => val ? parseInt(val, 10) : undefined)
    .refine(val => val === undefined || (Number.isInteger(val) && val >= 1 && val <= 20), {
        message: 'Page number must be an integer between 1 and 20'
    })
    .optional()
});

// Screenshot params
export const quickScreenshotParamsSchema = z.object({
    quickMatchId: z.string().uuid('Invalid quick match ID'),
    screenshotId: z.string().uuid('Invalid screenshot ID').optional()
});

// Query params for listing screenshots
export const listQuickScreenshotsQuerySchema = z.object({
    type: z.enum(['ATTENDANCE', 'RESULT'] as const).optional(),
    
    isProcessed: z.string()
        .transform(val => val === 'true')
        .optional()
});

// Delete screenshot validation
export const deleteQuickScreenshotSchema = z.object({
    quickMatchId: z.string().uuid('Invalid quick match ID')
});