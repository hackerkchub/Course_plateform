import { z } from 'zod';

export const googleLoginSchema = z.object({
  id_token: z.string({
    required_error: 'Google ID token is required',
    invalid_type_error: 'Google ID token must be a string',
  }).min(1, 'Google ID token cannot be empty'),
});

export const updateProfileSchema = z.object({
  name: z.string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .optional(),
  phone: z.string()
    .trim()
    .regex(/^[6-9][0-9]{9}$/, 'Phone must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9')
    .optional(),
}).refine((data) => data.name !== undefined || data.phone !== undefined, {
  message: 'At least one field (name or phone) must be provided for update',
});

export default {
  googleLoginSchema,
  updateProfileSchema,
};
