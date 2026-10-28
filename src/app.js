import express from 'express';
import {
  helmetMiddleware,
  corsMiddleware,
  cookieParserMiddleware,
  generalRateLimiter,
} from './middleware/security.js';
import { errorHandler } from './middleware/errorHandler.js';
import notFoundHandler from './middleware/notFound.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import { categoryPublicRoutes, categoryAdminRoutes } from './modules/categories/category.routes.js';
import { subcategoryPublicRoutes, subcategoryAdminRoutes } from './modules/subcategories/subcategory.routes.js';
import { coursePublicRoutes, courseAdminRoutes, searchRoutes } from './modules/courses/course.routes.js';
import { instructorPublicRoutes, instructorAdminRoutes } from './modules/instructors/instructor.routes.js';
import {
  courseCurriculumAdminRoutes,
  moduleAdminRoutes,
  lessonAdminRoutes,
} from './modules/curriculum/curriculum.routes.js';
import {
  batchPublicRoutes,
  courseBatchAdminRoutes,
  batchAdminRoutes,
} from './modules/batches/batch.routes.js';
import path from 'node:path';
import env from './config/env.js';
import { courseContentAdminRoutes } from './modules/course-content/course-content.routes.js';
import { uploadAdminRoutes } from './modules/uploads/upload.routes.js';
import {
  materialPublicRoutes,
  courseMaterialAdminRoutes,
  materialAdminRoutes,
} from './modules/materials/material.routes.js';
import {
  demoPublicCourseRoutes,
  demoStudentRoutes,
  demoAdminCourseRoutes,
  demoAdminLeadsRoutes,
} from './modules/demo/demo.routes.js';
import {
  courseEligibilityRoutes,
  meEligibilityRoutes,
  adminCourseEligibilityRoutes,
} from './modules/eligibility/eligibility.routes.js';
import {
  enrollmentCourseRoutes,
  enrollmentStudentRoutes,
  enrollmentAdminRoutes,
} from './modules/enrollments/enrollment.routes.js';
import {
  wishlistCourseRoutes,
  wishlistStudentRoutes,
} from './modules/wishlist/wishlist.routes.js';
import {
  reviewCourseRoutes,
  reviewStudentRoutes,
  reviewAdminRoutes,
} from './modules/reviews/review.routes.js';


const app = express();

// Trust proxy for rate limiting behind reverse proxies
app.set('trust proxy', 1);

// Apply Security Middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParserMiddleware);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Serve public uploads statically under /files (Section 12: uploads/public)
app.use('/files', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR, 'public')));

// Apply rate limiter to /api routes
app.use('/api', generalRateLimiter);

// Mount Health Endpoints under /api/health
app.use('/api/health', healthRoutes);

// Mount Auth Endpoints under /api/auth (Phase 4)
app.use('/api/auth', authRoutes);

// Mount Phase 5, 6 & 7 Catalog Hierarchy, Course Management, Curriculum, Batches, Content & Materials

// Public APIs
app.use('/api/categories/:catSlug/subcategories', subcategoryPublicRoutes);
app.use('/api/categories', categoryPublicRoutes);
app.use('/api/courses', batchPublicRoutes);
app.use('/api/courses', materialPublicRoutes);
app.use('/api/courses', demoPublicCourseRoutes);
app.use('/api/courses', courseEligibilityRoutes);
app.use('/api/courses', enrollmentCourseRoutes);
app.use('/api/courses', wishlistCourseRoutes);
app.use('/api/courses', reviewCourseRoutes);
app.use('/api/courses', coursePublicRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/instructors', instructorPublicRoutes);

// Student Me APIs
app.use('/api/me', demoStudentRoutes);
app.use('/api/me', meEligibilityRoutes);
app.use('/api/me', enrollmentStudentRoutes);
app.use('/api/me', wishlistStudentRoutes);
app.use('/api/me', reviewStudentRoutes);

// Admin APIs
app.use('/api/admin/uploads', uploadAdminRoutes);
app.use('/api/admin/enrollments', enrollmentAdminRoutes);
app.use('/api/admin/reviews', reviewAdminRoutes);
app.use('/api/admin/demo-requests', demoAdminLeadsRoutes);
app.use('/api/admin/courses', demoAdminCourseRoutes);
app.use('/api/admin/courses', adminCourseEligibilityRoutes);
app.use('/api/admin/categories', categoryAdminRoutes);
app.use('/api/admin/subcategories', subcategoryAdminRoutes);
app.use('/api/admin/courses', courseCurriculumAdminRoutes);
app.use('/api/admin/courses', courseBatchAdminRoutes);
app.use('/api/admin/courses', courseContentAdminRoutes);
app.use('/api/admin/courses', courseMaterialAdminRoutes);
app.use('/api/admin/courses', courseAdminRoutes);
app.use('/api/admin/modules', moduleAdminRoutes);
app.use('/api/admin/lessons', lessonAdminRoutes);
app.use('/api/admin/batches', batchAdminRoutes);
app.use('/api/admin/materials', materialAdminRoutes);
app.use('/api/admin/instructors', instructorAdminRoutes);


// Placeholder root API info route
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Course Platform API v1.0',
    documentation: '/api/docs',
  });
});

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export { app };
export default app;

