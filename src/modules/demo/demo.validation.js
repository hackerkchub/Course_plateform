import { z } from 'zod';

export const demoTypeEnum = z.enum(['live', 'recorded']);
export const demoStatusEnum = z.enum(['pending', 'contacted', 'scheduled', 'completed', 'cancelled']);

export const demoSettingsSchema = z.object({
  demo_enabled: z.boolean({ required_error: 'demo_enabled is required' }),
  demo_request_enabled: z.boolean({ required_error: 'demo_request_enabled is required' }),
  demo_type: demoTypeEnum.optional().nullable(),
  demo_duration_minutes: z.number().int().min(1).max(300).optional().default(45),
  demo_schedule: z.string().datetime().optional().nullable(),
  time_slots: z.array(z.string().trim()).optional().nullable(),
  accepting_requests: z.boolean().optional().default(true),
  request_start_at: z.string().datetime().optional().nullable(),
  request_end_at: z.string().datetime().optional().nullable(),
  max_requests_per_slot: z.number().int().min(1).optional().default(10),
  allowed_demo_types: z.array(demoTypeEnum).optional().nullable(),
  meeting_platform: z.string().trim().max(50).optional().nullable(),
  requires_approval: z.boolean().optional().default(false),
  form_title: z.string().trim().max(150).optional().nullable(),
  submit_button_text: z.string().trim().max(50).optional().nullable(),
  success_message: z.string().trim().optional().nullable(),
  form_fields: z.array(z.record(z.any())).optional().nullable(),
  custom_questions: z.array(z.record(z.any())).optional().nullable(),
  honeypot_enabled: z.boolean().optional().default(true),
  rate_limit_per_hour: z.number().int().min(1).max(100).optional().default(5),
}).refine(data => {
  if (data.request_start_at && data.request_end_at) {
    return new Date(data.request_end_at) >= new Date(data.request_start_at);
  }
  return true;
}, {
  message: 'request_end_at must be after or equal to request_start_at',
  path: ['request_end_at'],
});

export const createDemoRequestSchema = z.object({
  student_name: z.string({ required_error: 'student_name is required' })
    .trim()
    .min(2, 'student_name must be at least 2 characters')
    .max(100, 'student_name cannot exceed 100 characters'),
  email: z.string({ required_error: 'email is required' })
    .trim()
    .email('Invalid email address')
    .max(191, 'email cannot exceed 191 characters'),
  phone: z.string({ required_error: 'phone is required' })
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'phone must be a valid 10-digit Indian mobile number starting with 6-9'),
  city: z.string().trim().max(100).optional().nullable(),
  current_qualification: z.string().trim().max(100).optional().nullable(),
  experience_level: z.string().trim().max(50).optional().nullable(),
  preferred_demo_type: demoTypeEnum,
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'preferred_date must be in YYYY-MM-DD format').optional().nullable(),
  preferred_time: z.string().trim().max(50).optional().nullable(),
  message: z.string().trim().max(500, 'message cannot exceed 500 characters').optional().nullable(),
  custom_answers: z.record(z.any()).optional().nullable(),
  consent: z.literal(true, {
    errorMap: () => ({ message: 'consent must be true to proceed' }),
  }),
  honeypot: z.string().optional().nullable(),
  source: z.string().trim().max(50).optional().nullable(),
  utm_source: z.string().trim().max(100).optional().nullable(),
  utm_medium: z.string().trim().max(100).optional().nullable(),
  utm_campaign: z.string().trim().max(100).optional().nullable(),
});

export const updateDemoRequestSchema = z.object({
  status: demoStatusEnum.optional(),
  assigned_to: z.number().int().positive().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  meeting_link: z.string().trim().url('meeting_link must be a valid URL').max(500).optional().nullable(),
  admin_notes: z.string().trim().optional().nullable(),
  follow_up_at: z.string().datetime().optional().nullable(),
  attended: z.boolean().optional().nullable(),
});

export const bulkUpdateDemoRequestsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'ids array cannot be empty'),
  status: demoStatusEnum.optional(),
  assigned_to: z.number().int().positive().optional().nullable(),
  admin_notes: z.string().trim().optional(),
});

export const addDemoNoteSchema = z.object({
  note: z.string({ required_error: 'note is required' })
    .trim()
    .min(1, 'note cannot be empty'),
});

export const convertDemoRequestSchema = z.object({
  batch_id: z.number().int().positive().optional().nullable(),
  access_expires_at: z.string().datetime().optional().nullable(),
});

export default {
  demoSettingsSchema,
  createDemoRequestSchema,
  updateDemoRequestSchema,
  bulkUpdateDemoRequestsSchema,
  addDemoNoteSchema,
  convertDemoRequestSchema,
  demoTypeEnum,
  demoStatusEnum,
};
