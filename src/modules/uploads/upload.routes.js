import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { handleSingleUpload, uploadFile, deleteUpload } from './upload.controller.js';

const router = Router();

// All upload endpoints are admin-restricted
router.use(authenticate, authorize('admin', 'super_admin'));

router.post('/', handleSingleUpload, uploadFile);
router.delete('/', deleteUpload);

export const uploadAdminRoutes = router;
export default uploadAdminRoutes;
