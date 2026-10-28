import express from 'express';
import {
  getPublicEligibility,
  submitEligibilityCheck,
  getMyEligibilityResult,
  getAdminEligibilityRules,
  putAdminEligibilityRules,
  getAdminEligibilityChecks,
} from './eligibility.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  updateEligibilityRulesSchema,
  submitEligibilityCheckSchema,
  listEligibilityChecksQuerySchema,
} from './eligibility.validation.js';

// 1. Router for /api/courses (Public & Student)
export const courseEligibilityRoutes = express.Router();
courseEligibilityRoutes.get('/:id/eligibility', getPublicEligibility);
courseEligibilityRoutes.post(
  '/:id/eligibility-checks',
  authenticate,
  validateBody(submitEligibilityCheckSchema),
  submitEligibilityCheck
);

// 2. Router for /api/me (Student personal result)
export const meEligibilityRoutes = express.Router();
meEligibilityRoutes.get(
  '/courses/:id/eligibility-result',
  authenticate,
  getMyEligibilityResult
);

// 3. Router for /api/admin/courses (Admin rules & student check inspection)
export const adminCourseEligibilityRoutes = express.Router();
adminCourseEligibilityRoutes.use(authenticate);

adminCourseEligibilityRoutes.get(
  '/:id/eligibility-rules',
  authorize('admin', 'super_admin'),
  getAdminEligibilityRules
);

adminCourseEligibilityRoutes.put(
  '/:id/eligibility-rules',
  authorize('admin', 'super_admin'),
  validateBody(updateEligibilityRulesSchema),
  putAdminEligibilityRules
);

adminCourseEligibilityRoutes.get(
  '/:id/eligibility-checks',
  authorize('counsellor', 'admin', 'super_admin'),
  validateQuery(listEligibilityChecksQuerySchema),
  getAdminEligibilityChecks
);

export default {
  courseEligibilityRoutes,
  meEligibilityRoutes,
  adminCourseEligibilityRoutes,
};
