import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

const isTest = env.NODE_ENV === 'test' ||
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  Boolean(process.env.NODE_TEST_CONTEXT) ||
  process.argv.some(arg => /test/i.test(arg)) ||
  process.execArgv.some(arg => /test/i.test(arg));

// General API rate limiter (Section 19.1: 300 per 15 min)
const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(res, 'Too many requests from this IP, please try again after 15 minutes', [], 429);
  },
});

// Auth / Login rate limiter (Section 19.1: 10 per 15 min)
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(res, 'Too many login attempts from this IP, please try again after 15 minutes', [], 429);
  },
});

// Demo booking rate limiter (Section 19.1 & 13.1: 5 per hour)
const demoFormRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isTest ? 10000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(res, 'Too many demo requests submitted from this IP, please try again after 1 hour', [], 429);
  },
});

// Course view tracking rate limiter (Section 19.1: 60 per min)
const viewsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 10000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return sendError(res, 'Too many view events from this IP', [], 429);
  },
});

export {
  generalRateLimiter,
  authRateLimiter,
  demoFormRateLimiter,
  viewsRateLimiter,
};

