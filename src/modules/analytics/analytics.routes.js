import express from 'express';
import { optionalAuth, authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { viewsRateLimiter } from '../../middleware/rateLimiter.js';
import { validateParams, validateBody, validateQuery } from '../../middleware/validate.js';
import {
  courseIdParamSchema,
  recordViewSchema,
  getCourseAnalyticsQuerySchema,
  getCoursesAnalyticsQuerySchema,
  getAdminDashboardQuerySchema,
} from './analytics.validation.js';
import * as controller from './analytics.controller.js';

// Public track routes mounted on /api/courses
export const analyticsTrackRoutes = express.Router();

analyticsTrackRoutes.post(
  '/:id/views',
  viewsRateLimiter,
  optionalAuth,
  validateParams(courseIdParamSchema),
  validateBody(recordViewSchema),
  controller.recordView
);

analyticsTrackRoutes.post(
  '/:id/share',
  validateParams(courseIdParamSchema),
  controller.recordShare
);

analyticsTrackRoutes.post(
  '/:id/enquiry-click',
  validateParams(courseIdParamSchema),
  controller.recordEnquiry
);

// Admin single-course analytics route mounted on /api/admin/courses
export const analyticsAdminCourseRoutes = express.Router();

analyticsAdminCourseRoutes.get(
  '/:id/analytics',
  authenticate,
  authorize('admin', 'super_admin'),
  validateParams(courseIdParamSchema),
  validateQuery(getCourseAnalyticsQuerySchema),
  controller.getCourseAnalytics
);

// Admin platform analytics & dashboard routes mounted on /api/admin
export const analyticsAdminGeneralRoutes = express.Router();

analyticsAdminGeneralRoutes.get(
  '/analytics/courses',
  authenticate,
  authorize('admin', 'super_admin'),
  validateQuery(getCoursesAnalyticsQuerySchema),
  controller.getCoursesAnalytics
);

analyticsAdminGeneralRoutes.get(
  '/dashboard',
  authenticate,
  authorize('admin', 'super_admin'),
  validateQuery(getAdminDashboardQuerySchema),
  controller.getAdminDashboard
);

export default {
  analyticsTrackRoutes,
  analyticsAdminCourseRoutes,
  analyticsAdminGeneralRoutes,
};
