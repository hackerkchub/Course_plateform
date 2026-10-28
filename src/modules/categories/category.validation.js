import { z } from 'zod';
import { isValidSlug } from '../../utils/slug.js';

export const createCategorySchema = z.object({
  name: z.string({
    required_error: 'Category name is required',
  }).trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters'),
  slug: z.string().trim().refine(isValidSlug, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  }).optional(),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').nullable().optional(),
  icon_url: z.string().max(500, 'Icon URL must not exceed 500 characters').nullable().optional(),
  banner_url: z.string().max(500, 'Banner URL must not exceed 500 characters').nullable().optional(),
  display_order: z.coerce.number().int().default(0).optional(),
  status: z.enum(['active', 'inactive']).default('active').optional(),
  seo_title: z.string().max(70, 'SEO title must not exceed 70 characters').nullable().optional(),
  seo_description: z.string().max(160, 'SEO description must not exceed 160 characters').nullable().optional(),
  og_image_url: z.string().max(500, 'OG image URL must not exceed 500 characters').nullable().optional(),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').optional(),
  slug: z.string().trim().refine(isValidSlug, {
    message: 'Slug must contain only lowercase alphanumeric characters and hyphens',
  }).optional(),
  description: z.string().max(1000, 'Description must not exceed 1000 characters').nullable().optional(),
  icon_url: z.string().max(500, 'Icon URL must not exceed 500 characters').nullable().optional(),
  banner_url: z.string().max(500, 'Banner URL must not exceed 500 characters').nullable().optional(),
  display_order: z.coerce.number().int().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  seo_title: z.string().max(70, 'SEO title must not exceed 70 characters').nullable().optional(),
  seo_description: z.string().max(160, 'SEO description must not exceed 160 characters').nullable().optional(),
  og_image_url: z.string().max(500, 'OG image URL must not exceed 500 characters').nullable().optional(),
});

export const reorderCategorySchema = z.object({
  items: z.array(
    z.object({
      id: z.coerce.number().int().positive('Category ID must be a positive integer'),
      display_order: z.coerce.number().int('Display order must be an integer'),
    })
  ).min(1, 'At least one item must be provided for reordering'),
});

export default {
  createCategorySchema,
  updateCategorySchema,
  reorderCategorySchema,
};
