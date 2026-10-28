import { z } from 'zod';

export const updateSeoSchema = z.object({
  seo_title: z.string({ required_error: 'seo_title is required' })
    .trim()
    .min(1, 'seo_title cannot be empty')
    .max(70, 'seo_title cannot exceed 70 characters'),
  seo_description: z.string({ required_error: 'seo_description is required' })
    .trim()
    .min(1, 'seo_description cannot be empty')
    .max(160, 'seo_description cannot exceed 160 characters'),
  focus_keyword: z.string().trim().max(100).nullable().optional(),
  seo_tags: z.array(z.string().trim().min(1).max(50)).max(20, 'Maximum 20 tags allowed').optional(),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain only lowercase letters, numbers, and hyphens').max(255).optional(),
  canonical_url: z.string().trim().url('canonical_url must be a valid URL').max(500).nullable().optional(),
  og_title: z.string().trim().max(255).nullable().optional(),
  og_description: z.string().trim().nullable().optional(),
  og_image_url: z.string().trim().max(500).nullable().optional(),
  robots_directive: z.enum(['index,follow', 'noindex,follow', 'noindex,nofollow']).optional().default('index,follow'),
  schema_type: z.string().trim().max(50).optional().default('Course'),
  schema_markup: z.union([z.record(z.any()), z.string()]).nullable().optional(),
});

export const updatePricingSchema = z.object({
  price: z.number({ required_error: 'price is required' })
    .min(0, 'price cannot be negative'),
  offer_price: z.number().min(0, 'offer_price cannot be negative').nullable().optional(),
  currency: z.string().trim().max(10).optional().default('INR'),
  tax_inclusive: z.boolean().optional().default(false),
  gst_percentage: z.number().min(0).max(100, 'gst_percentage must be between 0 and 100').optional().default(0),
  is_free: z.boolean().optional().default(false),
  refund_policy: z.string().trim().nullable().optional(),
  refund_days: z.number().int().min(0).optional().default(0),
}).refine(data => {
  if (data.is_free) return true;
  if (data.offer_price !== null && data.offer_price !== undefined) {
    return data.offer_price <= data.price;
  }
  return true;
}, {
  message: 'offer_price cannot exceed price',
  path: ['offer_price'],
});

export const createInstallmentPlanSchema = z.object({
  plan_name: z.string({ required_error: 'plan_name is required' })
    .trim()
    .min(1, 'plan_name cannot be empty')
    .max(100, 'plan_name cannot exceed 100 characters'),
  installment_count: z.number({ required_error: 'installment_count is required' })
    .int()
    .min(2, 'installment_count must be at least 2'),
  installment_amount: z.number({ required_error: 'installment_amount is required' })
    .positive('installment_amount must be greater than 0'),
  interval_days: z.number({ required_error: 'interval_days is required' })
    .int()
    .min(1, 'interval_days must be at least 1 day'),
  is_active: z.boolean().optional().default(true),
});

export const updateInstallmentPlanSchema = z.object({
  plan_name: z.string().trim().min(1).max(100).optional(),
  installment_count: z.number().int().min(2).optional(),
  installment_amount: z.number().positive().optional(),
  interval_days: z.number().int().min(1).optional(),
  is_active: z.boolean().optional(),
});

export const createOfferSchema = z.object({
  offer_name: z.string({ required_error: 'offer_name is required' })
    .trim()
    .min(1, 'offer_name cannot be empty')
    .max(150, 'offer_name cannot exceed 150 characters'),
  discount_type: z.enum(['percentage', 'fixed'], {
    required_error: 'discount_type is required',
    invalid_type_error: "discount_type must be 'percentage' or 'fixed'",
  }),
  discount_value: z.number({ required_error: 'discount_value is required' })
    .positive('discount_value must be greater than 0'),
  coupon_code: z.string().trim().max(50).nullable().optional(),
  starts_at: z.string({ required_error: 'starts_at is required' }),
  ends_at: z.string({ required_error: 'ends_at is required' }),
  usage_limit: z.number().int().positive().nullable().optional(),
  per_user_limit: z.number().int().positive().optional().default(1),
  is_active: z.boolean().optional().default(true),
}).refine(data => {
  if (data.discount_type === 'percentage') {
    return data.discount_value >= 1 && data.discount_value <= 100;
  }
  return true;
}, {
  message: 'For percentage discount, discount_value must be between 1 and 100',
  path: ['discount_value'],
}).refine(data => {
  return new Date(data.ends_at) > new Date(data.starts_at);
}, {
  message: 'ends_at must be strictly after starts_at',
  path: ['ends_at'],
});

export const updateOfferSchema = z.object({
  offer_name: z.string().trim().min(1).max(150).optional(),
  discount_type: z.enum(['percentage', 'fixed']).optional(),
  discount_value: z.number().positive().optional(),
  coupon_code: z.string().trim().max(50).nullable().optional(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  per_user_limit: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
}).refine(data => {
  if (data.discount_type === 'percentage' && data.discount_value !== undefined) {
    return data.discount_value >= 1 && data.discount_value <= 100;
  }
  return true;
}, {
  message: 'For percentage discount, discount_value must be between 1 and 100',
  path: ['discount_value'],
}).refine(data => {
  if (data.starts_at && data.ends_at) {
    return new Date(data.ends_at) > new Date(data.starts_at);
  }
  return true;
}, {
  message: 'ends_at must be strictly after starts_at',
  path: ['ends_at'],
});

export const updateFaqsSchema = z.object({
  faqs: z.array(z.object({
    question: z.string({ required_error: 'question is required' }).trim().min(1, 'Question cannot be empty'),
    answer: z.string({ required_error: 'answer is required' }).trim().min(1, 'Answer cannot be empty'),
    display_order: z.number().int().min(0).optional().default(0),
  })),
});

export const updateTestimonialsSchema = z.object({
  testimonials: z.array(z.object({
    name: z.string({ required_error: 'name is required' }).trim().min(1, 'Name cannot be empty').max(150),
    text: z.string({ required_error: 'text is required' }).trim().min(1, 'Text cannot be empty'),
    video_url: z.string().trim().max(500).nullable().optional(),
    photo_url: z.string().trim().max(500).nullable().optional(),
    is_active: z.boolean().optional().default(true),
  })),
});

export const updateBenefitsSchema = z.object({
  certificate_enabled: z.boolean().optional().default(false),
  certificate_type: z.string().trim().max(100).nullable().optional(),
  career_support_enabled: z.boolean().optional().default(false),
  mock_interviews: z.boolean().optional().default(false),
  resume_support: z.boolean().optional().default(false),
  placement_assistance: z.boolean().optional().default(false),
  internship_support: z.boolean().optional().default(false),
  project_count: z.number().int().min(0).optional().default(0),
  lifetime_access: z.boolean().optional().default(false),
  access_duration_days: z.number().int().min(0).optional().default(0),
});

export const updateEnrollmentSettingsSchema = z.object({
  enrollment_limit: z.number().int().positive().nullable().optional(),
  enrollment_start_at: z.string().nullable().optional(),
  enrollment_end_at: z.string().nullable().optional(),
  drip_content_enabled: z.boolean().optional().default(false),
});

export const updatePointsSchema = z.object({
  points: z.array(z.object({
    point_type: z.enum(['learn', 'tool', 'prerequisite', 'required_skill'], {
      required_error: 'point_type is required',
    }),
    text: z.string({ required_error: 'text is required' }).trim().min(1, 'Text cannot be empty'),
    display_order: z.number().int().min(0).optional().default(0),
  })),
});
