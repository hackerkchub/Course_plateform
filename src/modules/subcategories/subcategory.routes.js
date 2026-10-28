import express from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authenticate, optionalAuth } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  createSubcategorySchema,
  updateSubcategorySchema,
  reorderSubcategorySchema,
} from './subcategory.validation.js';
import {
  getSubcategoriesByCatSlug,
  getSubcategoryPage,
  getAdminSubcategories,
  getAdminSubcategoryById,
  createSubcategory,
  updateSubcategory,
  reorderSubcategories,
  deleteSubcategory,
} from './subcategory.controller.js';

// Public router for category nested paths: /api/categories/:catSlug/subcategories
const publicRouter = express.Router({ mergeParams: true });
publicRouter.get('/', getSubcategoriesByCatSlug);
publicRouter.get('/:subSlug', optionalAuth, getSubcategoryPage);

// Admin router mounted at /api/admin/subcategories
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/', getAdminSubcategories);
adminRouter.post('/', validateBody(createSubcategorySchema), createSubcategory);
adminRouter.patch('/reorder', validateBody(reorderSubcategorySchema), reorderSubcategories);
adminRouter.get('/:id', getAdminSubcategoryById);
adminRouter.patch('/:id', validateBody(updateSubcategorySchema), updateSubcategory);
adminRouter.delete('/:id', deleteSubcategory);

export {
  publicRouter as subcategoryPublicRoutes,
  adminRouter as subcategoryAdminRoutes,
};

export default {
  subcategoryPublicRoutes: publicRouter,
  subcategoryAdminRoutes: adminRouter,
};
