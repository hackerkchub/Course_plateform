import { z } from 'zod';

const qualificationEnum = z.enum([
  'any',
  '10th',
  '12th',
  'diploma',
  'graduate',
  'post_graduate',
]);

const experienceEnum = z.enum([
  'fresher_allowed',
  'experience_required',
]);

const customQuestionSchema = z.object({
  key: z.string().min(1, 'Question key is required').max(50),
  question: z.string().min(1, 'Question text is required').max(500),
  field_type: z.enum(['text', 'select', 'radio', 'number']).default('text'),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
  correct_answers: z.array(z.string()).optional(),
});

export const updateEligibilityRulesSchema = z.object({
  eligibility_enabled: z.boolean({
    required_error: 'eligibility_enabled boolean flag is required',
  }),
  minimum_qualification: qualificationEnum.nullable().optional(),
  minimum_percentage: z
    .number()
    .min(0, 'Minimum percentage cannot be negative')
    .max(100, 'Minimum percentage cannot exceed 100')
    .nullable()
    .optional(),
  eligible_streams: z.array(z.string().max(100)).nullable().optional(),
  minimum_age: z.number().int().min(1, 'Minimum age must be positive').nullable().optional(),
  maximum_age: z.number().int().min(1, 'Maximum age must be positive').nullable().optional(),
  required_skills: z.array(z.string().max(100)).nullable().optional(),
  experience_required: experienceEnum.nullable().optional(),
  custom_questions: z.array(customQuestionSchema).nullable().optional(),
  disclaimer: z.string().max(2000).nullable().optional(),
}).refine(
  (data) => {
    if (
      data.minimum_age !== undefined &&
      data.minimum_age !== null &&
      data.maximum_age !== undefined &&
      data.maximum_age !== null
    ) {
      return data.maximum_age >= data.minimum_age;
    }
    return true;
  },
  {
    message: 'maximum_age must be greater than or equal to minimum_age',
    path: ['maximum_age'],
  }
);

export const submitEligibilityCheckSchema = z.object({
  answers: z.record(z.any(), {
    required_error: 'answers object is required',
  }),
});

export const listEligibilityChecksQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  result: z.enum(['eligible', 'not_eligible']).optional(),
});
