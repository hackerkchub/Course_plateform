/**
 * Standard API Response Utilities
 * Matches the specification in Course_Platform_Backend_Plan.txt (Section 5)
 */

/**
 * Sends a successful JSON response
 * @param {import('express').Response} res
 * @param {string} message
 * @param {object|array} data
 * @param {number} statusCode
 */
function sendSuccess(res, message, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Sends a paginated list response
 * @param {import('express').Response} res
 * @param {array} items
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 * @param {number} statusCode
 */
function sendPaginated(res, items, page, limit, total, statusCode = 200) {
  const totalPages = Math.ceil(total / limit) || 1;
  return res.status(statusCode).json({
    success: true,
    data: items,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: Number(total),
      total_pages: totalPages,
    },
  });
}

/**
 * Sends a standardized error response
 * @param {import('express').Response} res
 * @param {string} message
 * @param {array} errors - Array of { field, message }
 * @param {number} statusCode
 */
function sendError(res, message, errors = [], statusCode = 400) {
  const responseBody = {
    success: false,
    message,
  };

  if (Array.isArray(errors) && errors.length > 0) {
    responseBody.errors = errors;
  }

  return res.status(statusCode).json(responseBody);
}

export {
  sendSuccess,
  sendPaginated,
  sendError,
};

