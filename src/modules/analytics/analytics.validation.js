import { z } from 'zod';

export const courseIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Course ID must be a positive integer'),
});

export const recordViewSchema = z.object({
  session_id: z.string().min(1, 'session_id is required').max(64, 'session_id must not exceed 64 characters'),
  referrer: z.string().max(500, 'referrer must not exceed 500 characters').nullish(),
  source: z.enum(['organic', 'direct', 'social', 'campaign']).optional().default('direct'),
  device_type: z.enum(['desktop', 'mobile', 'tablet']).optional().default('desktop'),
});

export const getCourseAnalyticsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be in YYYY-MM-DD format').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be in YYYY-MM-DD format').optional(),
  group_by: z.enum(['day', 'week', 'month']).optional().default('day'),
});

export const getCoursesAnalyticsQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('10'),
  sort_by: z.enum(['total_views', 'unique_visitors', 'enrollment_count', 'conversion_rate', 'course_name']).optional().default('total_views'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const getAdminDashboardQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
