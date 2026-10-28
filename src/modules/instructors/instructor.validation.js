import { z } from 'zod';

export const createInstructorSchema = z.object({
  name: z.string({
    required_error: 'Instructor name is required',
  }).trim().min(2, 'Name must be at least 2 characters').max(150, 'Name must not exceed 150 characters'),
  designation: z.string().max(150, 'Designation must not exceed 150 characters').nullable().optional(),
  experience_years: z.coerce.number().min(0, 'Experience years must be 0 or greater').max(99, 'Invalid experience years').nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500, 'Photo URL must not exceed 500 characters').nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
  status: z.enum(['active', 'inactive']).default('active').optional(),
});

export const updateInstructorSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(150, 'Name must not exceed 150 characters').optional(),
  designation: z.string().max(150, 'Designation must not exceed 150 characters').nullable().optional(),
  experience_years: z.coerce.number().min(0).max(99).nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().max(500, 'Photo URL must not exceed 500 characters').nullable().optional(),
  social_links: z.record(z.string()).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export default {
  createInstructorSchema,
  updateInstructorSchema,
};
