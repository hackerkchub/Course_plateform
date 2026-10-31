import { sendSuccess } from '../../utils/response.js';
import * as service from './analytics.service.js';

export async function recordView(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await service.recordCourseViewService({
      courseId,
      userId: req.user ? req.user.id : null,
      sessionId: req.body.session_id,
      referrer: req.body.referrer || null,
      source: req.body.source || 'direct',
      device_type: req.body.device_type || 'desktop',
      userAgent: req.headers['user-agent'] || '',
    });

    return sendSuccess(res, result.message || 'View recorded', {}, 200);
  } catch (error) {
    return next(error);
  }
}

export async function recordShare(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await service.recordCourseShareService(courseId);
    return sendSuccess(res, result.message || 'Share recorded', {}, 200);
  } catch (error) {
    return next(error);
  }
}

export async function recordEnquiry(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await service.recordEnquiryClickService(courseId);
    return sendSuccess(res, result.message || 'Enquiry click recorded', {}, 200);
  } catch (error) {
    return next(error);
  }
}

export async function getCourseAnalytics(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const data = await service.getCourseAnalyticsService(courseId, req.query);
    return sendSuccess(res, 'Course analytics retrieved', data, 200);
  } catch (error) {
    return next(error);
  }
}

export async function getCoursesAnalytics(req, res, next) {
  try {
    const result = await service.getCoursesComparisonService(req.query);
    return res.status(200).json({
      success: true,
      message: 'Courses analytics comparison retrieved',
      data: result.courses,
      pagination: result.pagination,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminDashboard(req, res, next) {
  try {
    const data = await service.getAdminDashboardService(req.query);
    return sendSuccess(res, 'Admin dashboard summary retrieved', data, 200);
  } catch (error) {
    return next(error);
  }
}

export default {
  recordView,
  recordShare,
  recordEnquiry,
  getCourseAnalytics,
  getCoursesAnalytics,
  getAdminDashboard,
};
