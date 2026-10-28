import { z } from 'zod';

export const courseIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Course ID must be a positive integer'),
});

export const wishlistQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});
