import { sendError } from '../utils/response.js';

/**
 * Middleware: Role-based authorization guard (Section 3)
 * @param  {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 'Authentication required', [], 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendError(res, 'Forbidden: Insufficient permissions to access this resource', [], 403);
    }

    return next();
  };
}

export default authorize;
