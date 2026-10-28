import {
  getPublicCourseEligibility,
  submitStudentEligibilityCheck,
  getStudentLatestEligibilityResult,
  getAdminCourseEligibilityRules,
  saveAdminCourseEligibilityRules,
  getAdminCourseEligibilityChecks,
} from './eligibility.service.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';

/**
 * GET /api/courses/:id/eligibility
 * Public endpoint to fetch active eligibility criteria and questions
 */
export async function getPublicEligibility(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const data = await getPublicCourseEligibility(courseId);
    return sendSuccess(res, 'Eligibility details fetched successfully', data);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * POST /api/courses/:id/eligibility-checks
 * Authenticated student endpoint to submit answers and evaluate eligibility
 */
export async function submitEligibilityCheck(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const userId = req.user.id;
    const { answers } = req.body;

    const data = await submitStudentEligibilityCheck(userId, courseId, answers);
    return sendSuccess(res, data.message, data, 201);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/me/courses/:id/eligibility-result
 * Authenticated student endpoint to get personal latest eligibility result
 */
export async function getMyEligibilityResult(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const userId = req.user.id;

    const data = await getStudentLatestEligibilityResult(userId, courseId);
    return sendSuccess(res, 'Latest eligibility result retrieved', data);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/admin/courses/:id/eligibility-rules
 * Admin endpoint to view full course eligibility rules
 */
export async function getAdminEligibilityRules(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const data = await getAdminCourseEligibilityRules(courseId);
    return sendSuccess(res, 'Course eligibility rules retrieved successfully', data);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * PUT /api/admin/courses/:id/eligibility-rules
 * Admin endpoint to upsert course eligibility rules
 */
export async function putAdminEligibilityRules(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const rulesData = req.body;
    const clientIp = req.ip || req.connection?.remoteAddress;

    const data = await saveAdminCourseEligibilityRules(courseId, rulesData, req.user, clientIp);
    return sendSuccess(res, 'Course eligibility rules updated successfully', data);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/admin/courses/:id/eligibility-checks
 * Admin endpoint to view students' eligibility check attempts with filters and pagination
 */
export async function getAdminEligibilityChecks(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const { page, limit, result } = req.query;

    const data = await getAdminCourseEligibilityChecks(courseId, { page, limit, result });
    return sendPaginated(
      res,
      data.checks,
      data.pagination.page,
      data.pagination.limit,
      data.pagination.total
    );
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

export default {
  getPublicEligibility,
  submitEligibilityCheck,
  getMyEligibilityResult,
  getAdminEligibilityRules,
  putAdminEligibilityRules,
  getAdminEligibilityChecks,
};
