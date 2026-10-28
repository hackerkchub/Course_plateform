import { z } from 'zod';

export const courseIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Course ID must be a positive integer'),
});

export const reviewIdParamSchema = z.object({
  id: z.coerce.number().int().positive('Review ID must be a positive integer'),
});

export const publicReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  sort: z.enum(['newest', 'rating_high', 'rating_low']).default('newest'),
});

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5'),
  title: z.string().trim().max(150, 'Title cannot exceed 150 characters').nullable().optional(),
  text: z.string().trim().max(2000, 'Review text cannot exceed 2000 characters').nullable().optional(),
});

export const updateReviewSchema = z.object({
  rating: z.number().int().min(1, 'Rating must be at least 1').max(5, 'Rating cannot exceed 5').optional(),
  title: z.string().trim().max(150, 'Title cannot exceed 150 characters').nullable().optional(),
  text: z.string().trim().max(2000, 'Review text cannot exceed 2000 characters').nullable().optional(),
}).refine(data => data.rating !== undefined || data.title !== undefined || data.text !== undefined, {
  message: 'At least one field (rating, title, or text) must be provided for update',
});

export const adminReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  moderation_status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
  course_id: z.coerce.number().int().positive().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'oldest', 'rating_high', 'rating_low']).default('newest'),
});

export const moderateReviewSchema = z.object({
  moderation_status: z.enum(['approved', 'rejected'], {
    required_error: "Moderation status must be 'approved' or 'rejected'",
  }),
  reason: z.string().trim().max(500, 'Reason cannot exceed 500 characters').nullable().optional(),
});
