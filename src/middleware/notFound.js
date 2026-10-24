import { sendError } from '../utils/response.js';

function notFoundHandler(req, res) {
  return sendError(res, `Route not found: ${req.method} ${req.originalUrl}`, [], 404);
}

export { notFoundHandler };
export default notFoundHandler;

