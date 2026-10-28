import { Router } from 'express';
import { authenticate, optionalAuth } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  getMaterials,
  downloadMaterial,
  adminListMaterials,
  adminAddMaterial,
  adminPatchMaterial,
  adminRemoveMaterial,
} from './material.controller.js';

// Public router (mounted under /api/courses)
const publicRouter = Router();

publicRouter.get('/:id/materials', optionalAuth, getMaterials);
publicRouter.get('/:id/materials/:materialId/download', optionalAuth, downloadMaterial);

// Admin router for courses (mounted under /api/admin/courses)
const courseAdminRouter = Router();
courseAdminRouter.use(authenticate, authorize('admin', 'super_admin'));
courseAdminRouter.get('/:id/materials', adminListMaterials);
courseAdminRouter.post('/:id/materials', adminAddMaterial);

// Admin router for direct material actions (mounted under /api/admin/materials)
const materialAdminRouter = Router();
materialAdminRouter.use(authenticate, authorize('admin', 'super_admin'));
materialAdminRouter.patch('/:materialId', adminPatchMaterial);
materialAdminRouter.delete('/:materialId', adminRemoveMaterial);

export const materialPublicRoutes = publicRouter;
export const courseMaterialAdminRoutes = courseAdminRouter;
export const materialAdminRoutes = materialAdminRouter;

export default {
  materialPublicRoutes,
  courseMaterialAdminRoutes,
  materialAdminRoutes,
};
