import { verifyAccessToken } from '../utils/token.js';
import { sendError } from '../utils/response.js';

/**
 * Extracts access token from cookie or Authorization Bearer header
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractToken(req) {
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  return null;
}

/**
 * Middleware: Strictly requires authenticated user
 * Verifies JWT access token from cookie or Bearer header
 * Sets req.user = { id, role }
 */
export function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return sendError(res, 'Authentication required', [], 401);
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: Number(payload.id),
      role: payload.role,
    };
    return next();
  } catch (error) {
    return sendError(res, 'Invalid or expired access token', [], 401);
  }
}

/**
 * Middleware: Optional authentication for public endpoints (Section 3 & 9.2)
 * If valid access token is present, sets req.user = { id, role }
 * Otherwise sets req.user = null and continues without error
 */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: Number(payload.id),
      role: payload.role,
    };
  } catch {
    req.user = null;
  }

  return next();
}

export default {
  authenticate,
  optionalAuth,
};
