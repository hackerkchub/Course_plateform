import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import {
  courseIdParamSchema,
  reviewIdParamSchema,
  publicReviewsQuerySchema,
  createReviewSchema,
  updateReviewSchema,
  adminReviewsQuerySchema,
  moderateReviewSchema,
} from './review.validation.js';
import {
  getPublicReviews,
  submitReview,
  editMyReview,
  deleteMyReview,
  getAdminReviews,
  moderateReview,
} from './review.controller.js';

// 1. Course-level public & student reviews router (mounted under /api/courses)
export const reviewCourseRoutes = Router({ mergeParams: true });
reviewCourseRoutes.get(
  '/:id/reviews',
  validateParams(courseIdParamSchema),
  validateQuery(publicReviewsQuerySchema),
  getPublicReviews
);
reviewCourseRoutes.post(
  '/:id/reviews',
  authenticate,
  validateParams(courseIdParamSchema),
  validateBody(createReviewSchema),
  submitReview
);

// 2. Student-level personal reviews router (mounted under /api/me)
export const reviewStudentRoutes = Router();
reviewStudentRoutes.patch(
  '/reviews/:id',
  authenticate,
  validateParams(reviewIdParamSchema),
  validateBody(updateReviewSchema),
  editMyReview
);
reviewStudentRoutes.delete(
  '/reviews/:id',
  authenticate,
  validateParams(reviewIdParamSchema),
  deleteMyReview
);

// 3. Admin-level review moderation router (mounted under /api/admin/reviews)
export const reviewAdminRoutes = Router();
reviewAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));
reviewAdminRoutes.get(
  '/',
  validateQuery(adminReviewsQuerySchema),
  getAdminReviews
);
reviewAdminRoutes.patch(
  '/:id/moderate',
  validateParams(reviewIdParamSchema),
  validateBody(moderateReviewSchema),
  moderateReview
);

export default {
  reviewCourseRoutes,
  reviewStudentRoutes,
  reviewAdminRoutes,
};
