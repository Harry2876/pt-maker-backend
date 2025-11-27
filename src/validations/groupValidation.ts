import { z } from 'zod';

export const createGroupSchema = z.object({
    name: z.string()
        .min(2, 'Group name must be at least 2 characters')
        .max(50, 'Group name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Group name contains invalid characters'),
    
    maxTeams: z.number()
        .int('Max teams must be an integer')
        .positive('Max teams must be positive')
        .min(1, 'Max teams must be at least 1')
        .max(100, 'Max teams cannot exceed 100')
        .optional(),
    
    qualificationSpots: z.number()
        .int('Qualification spots must be an integer')
        .positive('Qualification spots must be positive')
        .min(1, 'Qualification spots must be at least 1')
        .max(50, 'Qualification spots cannot exceed 50')
        .optional()
});

export const updateGroupSchema = z.object({
    name: z.string()
        .min(2, 'Group name must be at least 2 characters')
        .max(50, 'Group name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Group name contains invalid characters')
        .optional(),
    
    maxTeams: z.number()
        .int('Max teams must be an integer')
        .positive('Max teams must be positive')
        .min(1, 'Max teams must be at least 1')
        .max(100, 'Max teams cannot exceed 100')
        .optional(),
    
    qualificationSpots: z.number()
        .int('Qualification spots must be an integer')
        .positive('Qualification spots must be positive')
        .min(1, 'Qualification spots must be at least 1')
        .max(50, 'Qualification spots cannot exceed 50')
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const groupParamsSchema = z.object({
    groupId: z.string()
        .uuid('Invalid group ID format')
});

export const tournamentGroupParamsSchema = z.object({
    tournamentId: z.string()
        .uuid('Invalid tournament ID format'),
    id: z.string()
        .uuid('Invalid group ID format')
        .optional()
});