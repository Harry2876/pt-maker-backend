import { z } from 'zod';

export const createTeamRegistrationSchema = z.object({
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters'),
    
    contactInfo: z.string()
        .min(5, 'Contact info must be at least 5 characters')
        .max(100, 'Contact info must be at most 100 characters'),
    
    groupId: z.string()
        .uuid('Invalid group ID format')
        .optional()
});

export const updateTeamRegistrationSchema = z.object({
    teamName: z.string()
        .min(2, 'Team name must be at least 2 characters')
        .max(50, 'Team name must be at most 50 characters')
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Team name contains invalid characters')
        .optional(),
    
    contactInfo: z.string()
        .min(5, 'Contact info must be at least 5 characters')
        .max(100, 'Contact info must be at most 100 characters')
        .optional(),
    
    registrationStatus: z.enum(['PENDING', 'CONFIRMED', 'QUALIFIED', 'ELIMINATED'] as const).optional(),
    
    finalPosition: z.number()
        .int('Final position must be an integer')
        .positive('Final position must be positive')
        .min(1, 'Final position must be at least 1')
        .optional(),
    
    totalPoints: z.number()
        .int('Total points must be an integer')
        .min(0, 'Total points cannot be negative')
        .optional(),
    
    groupId: z.string()
        .uuid('Invalid group ID format')
        .optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const teamRegistrationParamsSchema = z.object({
    id: z.string()
        .uuid('Invalid team registration ID format')
});

export const tournamentTeamRegistrationParamsSchema = z.object({
    tournamentId: z.string()
        .uuid('Invalid tournament ID format'),
    id: z.string()
        .uuid('Invalid team registration ID format')
        .optional()
});