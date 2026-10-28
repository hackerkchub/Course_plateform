import { z } from 'zod';

export const courseIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Course ID must be a positive integer'),
});

export const lessonIdParamSchema = z.object({
  lessonId: z.coerce.number().int().positive('Lesson ID must be a positive integer'),
});

export const enrollmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Enrollment ID must be a positive integer'),
});

export const selfEnrollSchema = z.object({
  batch_id: z.number().int().positive('Batch ID must be a positive integer').nullable().optional(),
});

export const studentEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  status: z.enum(['active', 'expired', 'cancelled', 'completed', 'all']).default('all'),
});

export const lessonProgressSchema = z.object({
  completed: z.boolean().default(true),
  last_position_seconds: z.number().int().min(0, 'Position seconds cannot be negative').default(0),
});

export const adminEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  course_id: z.coerce.number().int().positive().optional(),
  user_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'expired', 'cancelled', 'completed']).optional(),
  source: z.enum(['free', 'admin_manual', 'demo_convert']).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const adminCreateEnrollmentSchema = z.object({
  user_id: z.number().int().positive('Valid user_id is required'),
  course_id: z.number().int().positive('Valid course_id is required'),
  batch_id: z.number().int().positive('Batch ID must be positive').nullable().optional(),
  access_expires_at: z.string().nullable().optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
});

export const adminUpdateEnrollmentSchema = z.object({
  enrollment_status: z.enum(['active', 'expired', 'cancelled', 'completed']).optional(),
  batch_id: z.number().int().positive('Batch ID must be positive').nullable().optional(),
  access_expires_at: z.string().nullable().optional(),
  notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').nullable().optional(),
});
