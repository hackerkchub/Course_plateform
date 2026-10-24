const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { env } = require('../config/env');
const { sendError } = require('../utils/response');

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

const { generalRateLimiter } = require('./rateLimiter');

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  cookieParserMiddleware: cookieParser(),
  generalRateLimiter,
};
