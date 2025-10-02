import { z } from 'zod';

export const advancedEngineProcessSchema = z.object({
    matchId: z.string().uuid('Invalid match ID format'),
    processingType: z.enum(['FULL_AUTO', 'MANUAL_SLOTS', 'RESULTS_ONLY'] as const, {
        message: 'Processing type must be FULL_AUTO, MANUAL_SLOTS, or RESULTS_ONLY'
    }),
    screenshots: z.object({
        slotScreenshots: z.array(z.string().url('Invalid screenshot URL')).min(0).max(10),
        resultScreenshots: z.array(z.string().url('Invalid screenshot URL')).min(1).max(10)
    }),
    manualSlots: z.array(z.object({
        slotNumber: z.string().min(1),
        teamName: z.string().min(1),
        playerNames: z.array(z.string()).optional()
    })).optional(),
    metadata: z.object({
        gameMode: z.string().optional(),
        mapName: z.string().optional(),
        matchNumber: z.number().optional()
    }).optional(),
    priority: z.enum(['HIGH', 'NORMAL', 'LOW'] as const).default('NORMAL')
});

export const jobStatusParamsSchema = z.object({
    jobId: z.string().min(1, 'Job ID is required')
});

export const matchProcessingParamsSchema = z.object({
    matchId: z.string().uuid('Invalid match ID format')
});

export type AdvancedEngineProcessRequest = z.infer<typeof advancedEngineProcessSchema>;
export type JobStatusParams = z.infer<typeof jobStatusParamsSchema>;
export type MatchProcessingParams = z.infer<typeof matchProcessingParamsSchema>;