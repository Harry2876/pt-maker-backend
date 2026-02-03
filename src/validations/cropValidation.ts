import { z } from 'zod';

// Generate crops request validation
export const generateCropsSchema = z.object({
    screenshotUrl: z.string()
        .url('Invalid screenshot URL format')
        .max(500, 'Screenshot URL too long'),
    
    cropType: z.string()
        .min(2, 'Crop type must be at least 2 characters')
        .max(50, 'Crop type must be at most 50 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Crop type contains invalid characters')
        .optional()
});

// Crop params validation  
export const cropParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid match ID format')
});

// Crop download params validation
export const cropDownloadParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid match ID format'),
    cropId: z.string()
        .cuid('Invalid crop ID format')
});