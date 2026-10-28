import { z } from 'zod';

export const createBatchSchema = z.object({
  batch_name: z.string({ required_error: 'batch_name is required' })
    .trim()
    .min(1, 'batch_name cannot be empty')
    .max(150, 'batch_name cannot exceed 150 characters'),
  start_date: z.string({ required_error: 'start_date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
  end_date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  class_days: z.string().trim().max(100).nullable().optional(),
  class_timing: z.string().trim().max(100).nullable().optional(),
  total_seats: z.number({ required_error: 'total_seats is required' })
    .int()
    .min(1, 'total_seats must be at least 1'),
  enrollment_deadline: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'enrollment_deadline must be in YYYY-MM-DD format')
    .nullable()
    .optional(),
  location: z.string().trim().max(150).nullable().optional(),
  status: z.enum(['open', 'full', 'closed', 'completed']).optional().default('open'),
}).refine(data => {
  if (data.end_date && data.start_date) {
    return new Date(data.end_date) >= new Date(data.start_date);
  }
  return true;
}, {
  message: 'end_date must be greater than or equal to start_date',
  path: ['end_date'],
});

export const updateBatchSchema = z.object({
  batch_name: z.string().trim().min(1).max(150).optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format').nullable().optional(),
  class_days: z.string().trim().max(100).nullable().optional(),
  class_timing: z.string().trim().max(100).nullable().optional(),
  total_seats: z.number().int().min(1).optional(),
  enrollment_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'enrollment_deadline must be in YYYY-MM-DD format').nullable().optional(),
  location: z.string().trim().max(150).nullable().optional(),
  status: z.enum(['open', 'full', 'closed', 'completed']).optional(),
}).refine(data => {
  if (data.end_date && data.start_date) {
    return new Date(data.end_date) >= new Date(data.start_date);
  }
  return true;
}, {
  message: 'end_date must be greater than or equal to start_date',
  path: ['end_date'],
});
