import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from '../config/env.js';
import { generalRateLimiter } from './rateLimiter.js';

// Security headers
const helmetMiddleware = helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
});

// CORS configuration
const corsMiddleware = cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. mobile apps, curl, automated tests)
    if (!origin) return callback(null, true);
    
    // In dev / test, accept localhost variants
    if (env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (origin === env.FRONTEND_URL) {
      return callback(null, true);
    }

    return callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

const cookieParserMiddleware = cookieParser();

export {
  helmetMiddleware,
  corsMiddleware,
  cookieParserMiddleware,
  generalRateLimiter,
};

