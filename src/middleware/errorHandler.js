import { ZodError } from 'zod';
import logger from '../config/logger.js';
import { sendError } from '../utils/response.js';

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 400, errors = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized error-handling middleware
 */
function errorHandler(err, req, res, next) {
  // If response headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. Zod validation error
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return sendError(res, 'Validation failed', formattedErrors, 400);
  }

  // 2. Body-parser JSON syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return sendError(res, 'Invalid JSON payload in request body', [], 400);
  }

  // 3. Known custom AppError
  if (err instanceof AppError) {
    return sendError(res, err.message, err.errors, err.statusCode);
  }

  // 4. Rate-limit error or CORS error
  if (err.message === 'Blocked by CORS policy') {
    return sendError(res, 'Not allowed by CORS', [], 403);
  }

  // 5. Unhandled internal server error (500)
  // Log complete error details with stack trace internally
  logger.error({
    msg: 'Unhandled internal error',
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // Never leak internal stack trace, SQL errors, or sensitive info to client
  return sendError(res, 'Internal server error', [], 500);
}

export {
  AppError,
  errorHandler,
};
export default errorHandler;

