import { z } from 'zod';

const booleanQueryParam = (defaultValue: boolean) =>
    z.preprocess((value) => {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true') return true;
            if (normalized === 'false') return false;
        }
        return value;
    }, z.boolean().optional().default(defaultValue));

export const excelExportSchema = z.object({
    includePlayerDetails: booleanQueryParam(false),
    
    includePointsBreakdown: booleanQueryParam(true),
        
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