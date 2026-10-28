import { z } from 'zod';
import { isValidSlug } from '../../utils/slug.js';

export const createCourseSchema = z.object({
  course_code: z.string({
    required_error: 'Course code is required',
  }).trim().min(2, 'Course code must be at least 2 characters').max(50, 'Course code must not exceed 50 characters'),
  course_name: z.string({
    required_error: 'Course name is required',
  }).trim().min(3, 'Course name must be at least 3 characters').max(255, 'Course name must not exceed 255 characters'),
  slug: z.string().trim().refine(isValidSlug, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  }).optional(),
  short_description: z.string({
    required_error: 'Short description is required',
  }).trim().max(500, 'Short description must not exceed 500 characters'),
  description: z.string({
    required_error: 'Description is required',
  }).min(10, 'Description must be at least 10 characters'),
  subcategory_id: z.coerce.number().int().positive('Subcategory ID must be a positive integer'),
  instructor_id: z.coerce.number().int().positive().nullable().optional(),
  course_level: z.enum(['beginner', 'intermediate', 'advanced'], {
    required_error: 'Course level must be beginner, intermediate, or advanced',
  }),
  language: z.string({
    required_error: 'Language is required',
  }).trim().max(50),
  mode: z.enum(['online', 'offline', 'hybrid', 'self_paced'], {
    required_error: 'Mode must be online, offline, hybrid, or self_paced',
  }),
  duration_hours: z.coerce.number().min(0, 'Duration hours must be 0 or greater'),
  duration_days: z.coerce.number().int().min(0).nullable().optional(),
  thumbnail_url: z.string().max(500).nullable().optional(),
  banner_url: z.string().max(500).nullable().optional(),
  intro_video_url: z.string().max(500).nullable().optional(),
  demo_video_url: z.string().max(500).nullable().optional(),
  alt_text: z.string().max(255).nullable().optional(),
  brochure_url: z.string().max(500).nullable().optional(),
  syllabus_url: z.string().max(500).nullable().optional(),
  gallery_images: z.array(z.string().max(500)).max(10, 'Maximum 10 gallery images allowed').nullable().optional(),
  price: z.coerce.number().min(0, 'Price must be 0 or greater'),
  offer_price: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().max(10).default('INR').optional(),
  tax_inclusive: z.coerce.boolean().default(false).optional(),
  gst_percentage: z.coerce.number().min(0).max(100).default(0).optional(),
  is_free: z.coerce.boolean().default(false).optional(),
  refund_policy: z.string().nullable().optional(),
  refund_days: z.coerce.number().int().min(0).default(0).optional(),
  is_featured: z.coerce.boolean().default(false).optional(),
  is_new: z.coerce.boolean().default(false).optional(),
  is_trending: z.coerce.boolean().default(false).optional(),
  display_order: z.coerce.number().int().default(0).optional(),
  tags: z.array(z.string()).max(20, 'Maximum 20 tags allowed').optional(),
  what_you_will_learn: z.array(z.string()).optional(),
  tools_covered: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
}).refine(data => {
  if (data.offer_price !== undefined && data.offer_price !== null && data.price !== undefined) {
    return Number(data.offer_price) <= Number(data.price);
  }
  return true;
}, {
  message: 'Offer price cannot be greater than regular price',
  path: ['offer_price'],
});

export const updateCourseSchema = z.object({
  course_code: z.string().trim().min(2).max(50).optional(),
  course_name: z.string().trim().min(3).max(255).optional(),
  slug: z.string().trim().refine(isValidSlug, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  }).optional(),
  short_description: z.string().trim().max(500).optional(),
  description: z.string().min(10).optional(),
  subcategory_id: z.coerce.number().int().positive().optional(),
  instructor_id: z.coerce.number().int().positive().nullable().optional(),
  course_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  language: z.string().trim().max(50).optional(),
  mode: z.enum(['online', 'offline', 'hybrid', 'self_paced']).optional(),
  duration_hours: z.coerce.number().min(0).optional(),
  duration_days: z.coerce.number().int().min(0).nullable().optional(),
  thumbnail_url: z.string().max(500).nullable().optional(),
  banner_url: z.string().max(500).nullable().optional(),
  intro_video_url: z.string().max(500).nullable().optional(),
  demo_video_url: z.string().max(500).nullable().optional(),
  alt_text: z.string().max(255).nullable().optional(),
  brochure_url: z.string().max(500).nullable().optional(),
  syllabus_url: z.string().max(500).nullable().optional(),
  gallery_images: z.array(z.string().max(500)).max(10).nullable().optional(),
  price: z.coerce.number().min(0).optional(),
  offer_price: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().max(10).optional(),
  tax_inclusive: z.coerce.boolean().optional(),
  gst_percentage: z.coerce.number().min(0).max(100).optional(),
  is_free: z.coerce.boolean().optional(),
  refund_policy: z.string().nullable().optional(),
  refund_days: z.coerce.number().int().min(0).optional(),
  is_featured: z.coerce.boolean().optional(),
  is_new: z.coerce.boolean().optional(),
  is_trending: z.coerce.boolean().optional(),
  display_order: z.coerce.number().int().optional(),
  tags: z.array(z.string()).max(20).optional(),
  what_you_will_learn: z.array(z.string()).optional(),
  tools_covered: z.array(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
}).refine(data => {
  if (data.offer_price !== undefined && data.offer_price !== null && data.price !== undefined) {
    return Number(data.offer_price) <= Number(data.price);
  }
  return true;
}, {
  message: 'Offer price cannot be greater than regular price',
  path: ['offer_price'],
});

export const updateCourseStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'archived'], {
    required_error: 'Status must be draft, published, or archived',
  }),
});

export const searchQuerySchema = z.object({
  q: z.string({
    required_error: 'Search query parameter q is required',
  }).trim().min(2, 'Search query must be at least 2 characters'),
  type: z.enum(['course', 'category', 'subcategory', 'all']).default('all').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10).optional(),
});

export default {
  createCourseSchema,
  updateCourseSchema,
  updateCourseStatusSchema,
  searchQuerySchema,
};
