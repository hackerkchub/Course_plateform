const express = require('express');
const {
  helmetMiddleware,
  corsMiddleware,
  cookieParserMiddleware,
  generalRateLimiter,
} = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');
const notFoundHandler = require('./middleware/notFound');
const healthRoutes = require('./routes/health.routes');

const app = express();

// Trust proxy for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Apply Security Middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParserMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Apply rate limiter to /api routes
app.use('/api', generalRateLimiter);

// Mount Health Endpoints under /api/health
app.use('/api/health', healthRoutes);

// Placeholder root API info route
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Course Platform API v1.0',
    documentation: '/api/docs',
  });
});

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
