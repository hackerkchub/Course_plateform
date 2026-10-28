import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './batch.controller.js';
import { createBatchSchema, updateBatchSchema } from './batch.validation.js';

// Public router for /api/courses/:id/batches
const batchPublicRoutes = Router({ mergeParams: true });
batchPublicRoutes.get('/:id/batches', controller.getUpcomingBatches);

// Admin router for /api/admin/courses/:id/batches
const courseBatchAdminRoutes = Router({ mergeParams: true });
courseBatchAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));
courseBatchAdminRoutes.get('/:id/batches', controller.getAllBatchesAdmin);
courseBatchAdminRoutes.post('/:id/batches', validateBody(createBatchSchema), controller.createBatch);

// Admin router for /api/admin/batches/:batchId
const batchAdminRoutes = Router();
batchAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));
batchAdminRoutes.patch('/:batchId', validateBody(updateBatchSchema), controller.updateBatch);
batchAdminRoutes.delete('/:batchId', controller.deleteBatch);

export {
  batchPublicRoutes,
  courseBatchAdminRoutes,
  batchAdminRoutes,
};
