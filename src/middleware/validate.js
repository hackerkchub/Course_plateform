/**
 * Generic Zod request validation middleware
 * Aligns with Section 2 (middleware/validate.js) and Section 5 of Course Platform Backend Plan
 */

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      next(error); // Caught by centralized errorHandler which formats Zod errors
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
