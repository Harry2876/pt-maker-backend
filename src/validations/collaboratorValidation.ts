import { z } from 'zod';
import { userIdSchema } from './idSchemas';

const collaboratorRoleSchema = z.enum(['ADMIN', 'MODERATOR', 'RESULT_VERIFIER', 'VIEWER'] as const);

export const tournamentCollaboratorParamsSchema = z.object({
    tournamentId: z.string().uuid('Invalid tournament ID format')
});

export const collaboratorParamsSchema = z.object({
    collaboratorId: z.string().uuid('Invalid collaborator ID format')
});

export const createCollaboratorSchema = z.object({
    userId: userIdSchema,
    role: collaboratorRoleSchema
});

export const updateCollaboratorSchema = z.object({
    role: collaboratorRoleSchema.optional(),
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED'] as const).optional()
}).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update'
});

export const changeCollaboratorRoleSchema = z.object({
    role: collaboratorRoleSchema
});

export const bulkInviteCollaboratorsSchema = z.object({
    collaborators: z.array(z.object({
        userId: userIdSchema,
        role: collaboratorRoleSchema
    })).min(1, 'At least one collaborator must be provided')
});
