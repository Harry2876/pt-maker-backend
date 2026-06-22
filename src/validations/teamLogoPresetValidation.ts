import { z } from 'zod';

export const createPresetSchema = z.object({
    name: z.string().min(1, 'Preset name is required').max(100, 'Preset name must be at most 100 characters'),
});

export const updatePresetSchema = z.object({
    name: z.string().min(1, 'Preset name is required').max(100, 'Preset name must be at most 100 characters'),
});

export const presetParamsSchema = z.object({
    presetId: z.string().min(1, 'Preset ID is required'),
});

export const presetEntryParamsSchema = z.object({
    presetId: z.string().min(1, 'Preset ID is required'),
    entryId: z.string().min(1, 'Entry ID is required'),
});

export const addEntryBodySchema = z.object({
    teamName: z.string().min(1, 'Team name is required').max(100, 'Team name must be at most 100 characters'),
});

export const assignPresetEntrySchema = z.object({
    presetEntryId: z.string().min(1, 'Preset entry ID is required'),
});

export const suggestLogosSchema = z.object({
    teamNames: z.array(z.string().min(1).max(100)).min(1, 'At least one team name is required').max(25),
});
