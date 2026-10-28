import {
  selfEnrollStudent,
  getStudentEnrollments,
  getStudentCurriculum,
  recordStudentProgress,
  getAdminEnrollments,
  createAdminEnrollment,
  updateAdminEnrollment,
} from './enrollment.service.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';

/**
 * POST /api/courses/:id/enroll
 * Self-enrollment for free courses
 */
export async function enrollFreeCourse(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const result = await selfEnrollStudent(courseId, req.body || {}, req.user, ip);
    return sendSuccess(res, 'Enrolled successfully', result, 201);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/me/enrollments
 * List personal enrolled courses
 */
export async function getMyEnrollments(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const status = req.query.status || 'all';

    const { items, total } = await getStudentEnrollments(req.user, { page, limit, status });
    return sendPaginated(res, items, page, limit, total);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/me/courses/:id/curriculum
 * Enrolled student course curriculum with progress tracking
 */
export async function getMyCurriculum(req, res, next) {
  try {
    const courseId = parseInt(req.params.id, 10);
    const data = await getStudentCurriculum(courseId, req.user);
    return sendSuccess(res, 'Curriculum fetched successfully', data);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * POST /api/me/lessons/:lessonId/progress
 * Update lesson position and completion status
 */
export async function saveProgress(req, res, next) {
  try {
    const lessonId = parseInt(req.params.lessonId, 10);
    const data = await recordStudentProgress(lessonId, req.body || {}, req.user);
    return sendSuccess(res, 'Progress saved successfully', data, 200);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * GET /api/admin/enrollments
 * Admin list all enrollments with filters and pagination
 */
export async function listAdminEnrollments(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const filters = {
      course_id: req.query.course_id ? parseInt(req.query.course_id, 10) : undefined,
      user_id: req.query.user_id ? parseInt(req.query.user_id, 10) : undefined,
      status: req.query.status,
      source: req.query.source,
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      search: req.query.search,
    };

    const { items, total } = await getAdminEnrollments(filters, { page, limit });
    return sendPaginated(res, items, page, limit, total);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * POST /api/admin/enrollments
 * Admin manual enrollment creation
 */
export async function createManualEnrollment(req, res, next) {
  try {
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const result = await createAdminEnrollment(req.body, req.user, ip);
    return sendSuccess(res, 'Manual enrollment created successfully', result, 201);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}

/**
 * PATCH /api/admin/enrollments/:id
 * Admin update enrollment access, status, or batch
 */
export async function updateEnrollment(req, res, next) {
  try {
    const enrollmentId = parseInt(req.params.id, 10);
    const ip = req.ip || req.connection?.remoteAddress || '127.0.0.1';
    const result = await updateAdminEnrollment(enrollmentId, req.body, req.user, ip);
    return sendSuccess(res, 'Enrollment updated successfully', result, 200);
  } catch (err) {
    if (err.statusCode) {
      return sendError(res, err.message, [], err.statusCode);
    }
    next(err);
  }
}
