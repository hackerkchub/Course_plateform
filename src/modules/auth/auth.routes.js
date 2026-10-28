import express from 'express';
import { authRateLimiter } from '../../middleware/rateLimiter.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { googleLoginSchema, updateProfileSchema } from './auth.validation.js';
import {
  googleLogin,
  refreshToken,
  logout,
  logoutAll,
  getMe,
  updateMe,
} from './auth.controller.js';

const router = express.Router();

/**
 * Public authentication routes
 */
router.post('/google', authRateLimiter, validateBody(googleLoginSchema), googleLogin);
router.post('/refresh', refreshToken);

/**
 * Authenticated user routes
 */
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, validateBody(updateProfileSchema), updateMe);

export { router };
export default router;
