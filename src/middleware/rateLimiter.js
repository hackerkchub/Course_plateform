const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');
const { sendError } = require('../utils/response');

const isTest = env.NODE_ENV === 'test';

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

module.exports = {
  generalRateLimiter,
  authRateLimiter,
  demoFormRateLimiter,
  viewsRateLimiter,
};
