import express from 'express';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { authenticate, optionalAuth } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  createCourseSchema,
  updateCourseSchema,
  updateCourseStatusSchema,
  searchQuerySchema,
} from './course.validation.js';
import {
  getCourses,
  getCourseBySlug,
  search,
  getAdminCourses,
  getAdminCourseById,
  createCourse,
  updateCourse,
  updateCourseStatus,
  duplicateCourse,
  deleteCourse,
} from './course.controller.js';

// Public router mounted at /api/courses
const publicRouter = express.Router();
publicRouter.get('/', optionalAuth, getCourses);
publicRouter.get('/:slug', optionalAuth, getCourseBySlug);

// Search router mounted at /api/search
const searchRouter = express.Router();
searchRouter.get('/', validateQuery(searchQuerySchema), search);

// Admin router mounted at /api/admin/courses
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/', getAdminCourses);
adminRouter.post('/', validateBody(createCourseSchema), createCourse);
adminRouter.get('/:id', getAdminCourseById);
adminRouter.patch('/:id', validateBody(updateCourseSchema), updateCourse);
adminRouter.patch('/:id/status', validateBody(updateCourseStatusSchema), updateCourseStatus);
adminRouter.post('/:id/duplicate', duplicateCourse);
adminRouter.delete('/:id', deleteCourse);

export {
  publicRouter as coursePublicRoutes,
  searchRouter as searchRoutes,
  adminRouter as courseAdminRoutes,
};

export default {
  coursePublicRoutes: publicRouter,
  searchRoutes: searchRouter,
  courseAdminRoutes: adminRouter,
};
