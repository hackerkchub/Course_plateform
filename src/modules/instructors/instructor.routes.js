import express from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  createInstructorSchema,
  updateInstructorSchema,
} from './instructor.validation.js';
import {
  getInstructors,
  getInstructorById,
  getAdminInstructors,
  createInstructor,
  updateInstructor,
  deleteInstructor,
} from './instructor.controller.js';

// Public routes: /api/instructors
const publicRouter = express.Router();
publicRouter.get('/', getInstructors);
publicRouter.get('/:id', getInstructorById);

// Admin routes: /api/admin/instructors
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/', getAdminInstructors);
adminRouter.post('/', validateBody(createInstructorSchema), createInstructor);
adminRouter.get('/:id', getInstructorById);
adminRouter.patch('/:id', validateBody(updateInstructorSchema), updateInstructor);
adminRouter.delete('/:id', deleteInstructor);

export {
  publicRouter as instructorPublicRoutes,
  adminRouter as instructorAdminRoutes,
};

export default {
  instructorPublicRoutes: publicRouter,
  instructorAdminRoutes: adminRouter,
};
