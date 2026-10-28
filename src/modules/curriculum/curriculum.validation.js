import { z } from 'zod';

export const createModuleSchema = z.object({
  title: z.string({ required_error: 'Module title is required' })
    .trim()
    .min(1, 'Module title cannot be empty')
    .max(255, 'Module title cannot exceed 255 characters'),
  description: z.string().trim().nullable().optional(),
  display_order: z.number().int().min(0).optional().default(0),
  is_published: z.boolean().optional().default(false),
});

export const updateModuleSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().nullable().optional(),
  display_order: z.number().int().min(0).optional(),
  is_published: z.boolean().optional(),
});

export const createLessonSchema = z.object({
  title: z.string({ required_error: 'Lesson title is required' })
    .trim()
    .min(1, 'Lesson title cannot be empty')
    .max(255, 'Lesson title cannot exceed 255 characters'),
  description: z.string().trim().nullable().optional(),
  lesson_type: z.enum(['video', 'article', 'quiz', 'assignment'], {
    required_error: 'lesson_type is required',
    invalid_type_error: "lesson_type must be 'video', 'article', 'quiz', or 'assignment'",
  }),
  content_url: z.string().trim().max(500).nullable().optional(),
  duration_seconds: z.number().int().min(0, 'duration_seconds cannot be negative').optional().default(0),
  is_preview: z.boolean().optional().default(false),
  is_published: z.boolean().optional().default(false),
  display_order: z.number().int().min(0).optional().default(0),
});

export const updateLessonSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().nullable().optional(),
  lesson_type: z.enum(['video', 'article', 'quiz', 'assignment']).optional(),
  content_url: z.string().trim().max(500).nullable().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  is_preview: z.boolean().optional(),
  is_published: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
});

export const reorderCurriculumSchema = z.object({
  modules: z.array(z.object({
    id: z.number({ required_error: 'Module ID is required' }).int().positive(),
    display_order: z.number({ required_error: 'display_order is required' }).int().min(0),
    lessons: z.array(z.object({
      id: z.number({ required_error: 'Lesson ID is required' }).int().positive(),
      display_order: z.number({ required_error: 'display_order is required' }).int().min(0),
    })).optional(),
  })).min(1, 'At least one module must be provided for reordering'),
});
