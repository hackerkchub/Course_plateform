import express from 'express';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  createCategorySchema,
  updateCategorySchema,
  reorderCategorySchema,
} from './category.validation.js';
import {
  getCategories,
  getCategoryBySlug,
  getAdminCategories,
  getAdminCategoryById,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
} from './category.controller.js';

// Public router mounted at /api/categories
const publicRouter = express.Router();
publicRouter.get('/', getCategories);
publicRouter.get('/:slug', getCategoryBySlug);

// Admin router mounted at /api/admin/categories
const adminRouter = express.Router();
adminRouter.use(authenticate, authorize('admin', 'super_admin'));

adminRouter.get('/', getAdminCategories);
adminRouter.post('/', validateBody(createCategorySchema), createCategory);
adminRouter.patch('/reorder', validateBody(reorderCategorySchema), reorderCategories);
adminRouter.get('/:id', getAdminCategoryById);
adminRouter.patch('/:id', validateBody(updateCategorySchema), updateCategory);
adminRouter.delete('/:id', deleteCategory);

export {
  publicRouter as categoryPublicRoutes,
  adminRouter as categoryAdminRoutes,
};

export default {
  categoryPublicRoutes: publicRouter,
  categoryAdminRoutes: adminRouter,
};
