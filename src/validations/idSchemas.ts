import { z } from 'zod';

/** Prisma User.id — @default(cuid()) */
export const userIdSchema = z.string().cuid('Invalid user ID format');
