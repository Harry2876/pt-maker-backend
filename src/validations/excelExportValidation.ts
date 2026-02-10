import { z } from 'zod';

export const excelExportSchema = z.object({
    includePlayerDetails: z.boolean()
        .optional()
        .default(false),
    
    includePointsBreakdown: z.boolean()
        .optional()
        .default(true),
        
    customFilename: z.string()
        .min(1, 'Filename cannot be empty')
        .max(100, 'Filename too long')
        .regex(/^[a-zA-Z0-9\s\-_()]+$/, 'Invalid filename characters')
        .optional()
});

export const excelExportParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid quick match ID format')
});