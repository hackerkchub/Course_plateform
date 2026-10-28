import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import {
  courseIdParamSchema,
  wishlistQuerySchema,
} from './wishlist.validation.js';
import {
  addToWishlist,
  removeFromWishlist,
  getMyWishlist,
} from './wishlist.controller.js';

// 1. Course-level router (mounted under /api/courses)
export const wishlistCourseRoutes = Router({ mergeParams: true });
wishlistCourseRoutes.post(
  '/:id/wishlist',
  authenticate,
  validateParams(courseIdParamSchema),
  addToWishlist
);
wishlistCourseRoutes.delete(
  '/:id/wishlist',
  authenticate,
  validateParams(courseIdParamSchema),
  removeFromWishlist
);

// 2. Student-level router (mounted under /api/me)
export const wishlistStudentRoutes = Router();
wishlistStudentRoutes.get(
  '/wishlist',
  authenticate,
  validateQuery(wishlistQuerySchema),
  getMyWishlist
);

export default {
  wishlistCourseRoutes,
  wishlistStudentRoutes,
};
