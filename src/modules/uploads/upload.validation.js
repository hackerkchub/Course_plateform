import { z } from 'zod';

export const uploadPurposeEnum = z.enum(['image', 'document', 'material'], {
  required_error: 'purpose is required',
  invalid_type_error: "purpose must be one of 'image', 'document', or 'material'",
});

export const deleteUploadSchema = z.object({
  path: z.string({ required_error: 'path is required' })
    .trim()
    .min(1, 'path cannot be empty')
    .refine(val => !val.includes('..') && !val.includes('\0'), {
      message: 'Path traversal detected in file path',
    }),
});
