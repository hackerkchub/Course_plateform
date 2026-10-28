import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import {
  courseIdParamSchema,
  lessonIdParamSchema,
  enrollmentIdParamSchema,
  selfEnrollSchema,
  studentEnrollmentsQuerySchema,
  lessonProgressSchema,
  adminEnrollmentsQuerySchema,
  adminCreateEnrollmentSchema,
  adminUpdateEnrollmentSchema,
} from './enrollment.validation.js';
import {
  enrollFreeCourse,
  getMyEnrollments,
  getMyCurriculum,
  saveProgress,
  listAdminEnrollments,
  createManualEnrollment,
  updateEnrollment,
} from './enrollment.controller.js';

// Mounted under /api/courses
export const enrollmentCourseRoutes = Router({ mergeParams: true });
enrollmentCourseRoutes.post(
  '/:id/enroll',
  authenticate,
  validateParams(courseIdParamSchema),
  validateBody(selfEnrollSchema),
  enrollFreeCourse
);

// Mounted under /api/me
export const enrollmentStudentRoutes = Router();
enrollmentStudentRoutes.get(
  '/enrollments',
  authenticate,
  validateQuery(studentEnrollmentsQuerySchema),
  getMyEnrollments
);
enrollmentStudentRoutes.get(
  '/courses/:id/curriculum',
  authenticate,
  validateParams(courseIdParamSchema),
  getMyCurriculum
);
enrollmentStudentRoutes.post(
  '/lessons/:lessonId/progress',
  authenticate,
  validateParams(lessonIdParamSchema),
  validateBody(lessonProgressSchema),
  saveProgress
);

// Mounted under /api/admin/enrollments
export const enrollmentAdminRoutes = Router();
enrollmentAdminRoutes.get(
  '/',
  authenticate,
  authorize('admin', 'super_admin'),
  validateQuery(adminEnrollmentsQuerySchema),
  listAdminEnrollments
);
enrollmentAdminRoutes.post(
  '/',
  authenticate,
  authorize('admin', 'super_admin'),
  validateBody(adminCreateEnrollmentSchema),
  createManualEnrollment
);
enrollmentAdminRoutes.patch(
  '/:id',
  authenticate,
  authorize('admin', 'super_admin'),
  validateParams(enrollmentIdParamSchema),
  validateBody(adminUpdateEnrollmentSchema),
  updateEnrollment
);
