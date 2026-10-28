import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  getSettings,
  updateSettings,
  createRequest,
  getMyRequests,
  cancelMyRequest,
  listAdminRequests,
  getCourseDemoRequests,
  getDemoRequestDetails,
  patchDemoRequest,
  bulkUpdateRequests,
  addNote,
  convertRequest,
  exportRequests,
  deleteRequest,
} from './demo.controller.js';

// 1. Public course-level demo routes (mounted under /api/courses)
const publicCourseRouter = Router();
publicCourseRouter.get('/:id/demo-settings', getSettings);
publicCourseRouter.post('/:id/demo-requests', authenticate, createRequest);

// 2. Student demo routes (mounted under /api/me)
const studentRouter = Router();
studentRouter.use(authenticate);
studentRouter.get('/demo-requests', getMyRequests);
studentRouter.patch('/demo-requests/:id/cancel', cancelMyRequest);

// 3. Admin course-level demo routes (mounted under /api/admin/courses)
const adminCourseRouter = Router();
adminCourseRouter.get('/:id/demo-settings', authenticate, authorize('admin', 'super_admin'), getSettings);
adminCourseRouter.put('/:id/demo-settings', authenticate, authorize('admin', 'super_admin'), updateSettings);
adminCourseRouter.get('/:id/demo-requests', authenticate, authorize('counsellor', 'admin', 'super_admin'), getCourseDemoRequests);

// 4. Admin / Counsellor leads router (mounted under /api/admin/demo-requests)
const adminLeadsRouter = Router();
adminLeadsRouter.use(authenticate);

// CSV Export (Admin only) - declared before /:id parameter
adminLeadsRouter.get('/export', authorize('admin', 'super_admin'), exportRequests);

// Bulk update (Counsellor, Admin) - declared before /:id parameter
adminLeadsRouter.patch('/bulk', authorize('counsellor', 'admin', 'super_admin'), bulkUpdateRequests);

// List all leads (Counsellor, Admin)
adminLeadsRouter.get('/', authorize('counsellor', 'admin', 'super_admin'), listAdminRequests);

// Single lead detail (Counsellor, Admin)
adminLeadsRouter.get('/:id', authorize('counsellor', 'admin', 'super_admin'), getDemoRequestDetails);

// Single lead update (Counsellor, Admin)
adminLeadsRouter.patch('/:id', authorize('counsellor', 'admin', 'super_admin'), patchDemoRequest);

// Add follow-up note (Counsellor, Admin)
adminLeadsRouter.post('/:id/notes', authorize('counsellor', 'admin', 'super_admin'), addNote);

// Convert lead to enrollment (Admin only)
adminLeadsRouter.post('/:id/convert', authorize('admin', 'super_admin'), convertRequest);

// Soft delete lead (Admin only)
adminLeadsRouter.delete('/:id', authorize('admin', 'super_admin'), deleteRequest);

export const demoPublicCourseRoutes = publicCourseRouter;
export const demoStudentRoutes = studentRouter;
export const demoAdminCourseRoutes = adminCourseRouter;
export const demoAdminLeadsRoutes = adminLeadsRouter;

export default {
  demoPublicCourseRoutes,
  demoStudentRoutes,
  demoAdminCourseRoutes,
  demoAdminLeadsRoutes,
};
