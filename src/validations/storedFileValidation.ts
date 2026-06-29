import { z } from 'zod';

export const storedFileParamsSchema = z.object({
    fileId: z.string().trim().min(1, 'fileId is required'),
});

export const storedFileQuerySchema = z.object({
    exp: z.union([z.string(), z.number()]).optional(),
    sig: z.string().optional(),
});
