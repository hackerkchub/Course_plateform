const dotenv = require('dotenv');
const { z } = require('zod');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database configuration
  DB_HOST: z.string().min(1, 'DB_HOST is required').default('localhost'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1, 'DB_USER is required').default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME is required').default('course_platform_db'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),

  // JWT configuration
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),

  // CORS and Frontend URL
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').default('http://localhost:3000'),

  // File Uploads
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  // Super Admin Email for initial seed
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email address'),
});

let validatedEnv;

function validateEnv(envInput = process.env) {
  const result = envSchema.safeParse(envInput);
  if (!result.success) {
    const errorDetails = result.error.errors.map(err => `  - ${err.path.join('.')}: ${err.message}`).join('\n');
    console.error('\n❌ FATAL: Environment validation failed:\n' + errorDetails + '\n');
    throw new Error('Environment validation failed');
  }
  return result.data;
}

try {
  validatedEnv = validateEnv(process.env);
} catch (error) {
  // If in test environment, allow tests to inject their own mock configuration
  if (process.env.NODE_ENV === 'test') {
    validatedEnv = {
      PORT: 5000,
      NODE_ENV: 'test',
      DB_HOST: 'localhost',
      DB_PORT: 3306,
      DB_USER: 'root',
      DB_PASSWORD: '',
      DB_NAME: 'course_platform_db',
      DB_CONNECTION_LIMIT: 5,
      JWT_ACCESS_SECRET: 'test_access_secret_minimum_32_characters_long_for_security',
      JWT_REFRESH_SECRET: 'test_refresh_secret_minimum_32_characters_long_for_security',
      ACCESS_TOKEN_TTL: '15m',
      REFRESH_TOKEN_TTL: '30d',
      GOOGLE_CLIENT_ID: 'test_google_client_id.apps.googleusercontent.com',
      FRONTEND_URL: 'http://localhost:3000',
      UPLOAD_DIR: 'uploads',
      MAX_UPLOAD_MB: 10,
      SUPER_ADMIN_EMAIL: 'superadmin@courseplatform.com',
    };
  } else {
    process.exit(1);
  }
}

module.exports = {
  env: validatedEnv,
  validateEnv,
  envSchema,
};
