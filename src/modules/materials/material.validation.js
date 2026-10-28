import { z } from 'zod';

export const materialTypeEnum = z.enum([
  'brochure',
  'syllabus',
  'notes',
  'worksheet',
  'project',
  'recording',
  'other',
], {
  required_error: 'material_type is required',
  invalid_type_error: "material_type must be one of: 'brochure', 'syllabus', 'notes', 'worksheet', 'project', 'recording', 'other'",
});

export const createMaterialSchema = z.object({
  title: z.string({ required_error: 'title is required' })
    .trim()
    .min(1, 'title cannot be empty')
    .max(255, 'title cannot exceed 255 characters'),
  material_type: materialTypeEnum,
  file_path: z.string({ required_error: 'file_path is required' })
    .trim()
    .min(1, 'file_path cannot be empty')
    .max(500, 'file_path cannot exceed 500 characters'),
  file_type: z.string().trim().max(50).nullable().optional(),
  file_size_bytes: z.number().int().min(0).optional(),
  is_preview: z.boolean().optional().default(false),
  requires_enrollment: z.boolean().optional().default(true),
  display_order: z.number().int().optional().default(0),
});

export const updateMaterialSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  material_type: materialTypeEnum.optional(),
  file_path: z.string().trim().min(1).max(500).optional(),
  file_type: z.string().trim().max(50).nullable().optional(),
  file_size_bytes: z.number().int().min(0).optional(),
  is_preview: z.boolean().optional(),
  requires_enrollment: z.boolean().optional(),
  display_order: z.number().int().optional(),
});

export default {
  createMaterialSchema,
  updateMaterialSchema,
  materialTypeEnum,
};
