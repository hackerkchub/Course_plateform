import healthRoutes from '../src/routes/health.routes.js';
import authRoutes from '../src/modules/auth/auth.routes.js';
import { categoryPublicRoutes, categoryAdminRoutes } from '../src/modules/categories/category.routes.js';
import { subcategoryPublicRoutes, subcategoryAdminRoutes } from '../src/modules/subcategories/subcategory.routes.js';
import { instructorPublicRoutes, instructorAdminRoutes } from '../src/modules/instructors/instructor.routes.js';
import { coursePublicRoutes, courseAdminRoutes, searchRoutes } from '../src/modules/courses/course.routes.js';
import { uploadAdminRoutes } from '../src/modules/uploads/upload.routes.js';
import { courseCurriculumAdminRoutes, moduleAdminRoutes, lessonAdminRoutes } from '../src/modules/curriculum/curriculum.routes.js';
import { batchPublicRoutes, courseBatchAdminRoutes, batchAdminRoutes } from '../src/modules/batches/batch.routes.js';
import { courseContentAdminRoutes } from '../src/modules/course-content/course-content.routes.js';
import { materialPublicRoutes, courseMaterialAdminRoutes, materialAdminRoutes } from '../src/modules/materials/material.routes.js';
import { demoPublicCourseRoutes, demoStudentRoutes, demoAdminLeadsRoutes, demoAdminCourseRoutes } from '../src/modules/demo/demo.routes.js';
import { courseEligibilityRoutes, meEligibilityRoutes, adminCourseEligibilityRoutes } from '../src/modules/eligibility/eligibility.routes.js';
import { enrollmentCourseRoutes, enrollmentStudentRoutes, enrollmentAdminRoutes } from '../src/modules/enrollments/enrollment.routes.js';
import { wishlistCourseRoutes, wishlistStudentRoutes } from '../src/modules/wishlist/wishlist.routes.js';
import { reviewCourseRoutes, reviewStudentRoutes, reviewAdminRoutes } from '../src/modules/reviews/review.routes.js';

const mounts = [
  { prefix: '/api/health', router: healthRoutes, module: 'Health' },
  { prefix: '/api/auth', router: authRoutes, module: 'Auth' },
  { prefix: '/api/categories/:catSlug/subcategories', router: subcategoryPublicRoutes, module: 'Subcategories (Public)' },
  { prefix: '/api/categories', router: categoryPublicRoutes, module: 'Categories (Public)' },
  { prefix: '/api/courses', router: batchPublicRoutes, module: 'Batches (Public)' },
  { prefix: '/api/courses', router: materialPublicRoutes, module: 'Materials (Public)' },
  { prefix: '/api/courses', router: demoPublicCourseRoutes, module: 'Demo (Public)' },
  { prefix: '/api/courses', router: courseEligibilityRoutes, module: 'Eligibility (Public)' },
  { prefix: '/api/courses', router: enrollmentCourseRoutes, module: 'Enrollments (Course)' },
  { prefix: '/api/courses', router: wishlistCourseRoutes, module: 'Wishlist (Course)' },
  { prefix: '/api/courses', router: reviewCourseRoutes, module: 'Reviews (Course)' },
  { prefix: '/api/courses', router: coursePublicRoutes, module: 'Courses (Public)' },
  { prefix: '/api/search', router: searchRoutes, module: 'Search' },
  { prefix: '/api/instructors', router: instructorPublicRoutes, module: 'Instructors (Public)' },
  { prefix: '/api/me', router: demoStudentRoutes, module: 'Demo (Student)' },
  { prefix: '/api/me', router: meEligibilityRoutes, module: 'Eligibility (Student)' },
  { prefix: '/api/me', router: enrollmentStudentRoutes, module: 'Enrollments (Student)' },
  { prefix: '/api/me', router: wishlistStudentRoutes, module: 'Wishlist (Student)' },
  { prefix: '/api/me', router: reviewStudentRoutes, module: 'Reviews (Student)' },
  { prefix: '/api/admin/uploads', router: uploadAdminRoutes, module: 'Uploads (Admin)' },
  { prefix: '/api/admin/enrollments', router: enrollmentAdminRoutes, module: 'Enrollments (Admin)' },
  { prefix: '/api/admin/reviews', router: reviewAdminRoutes, module: 'Reviews (Admin)' },
  { prefix: '/api/admin/demo-requests', router: demoAdminLeadsRoutes, module: 'Demo Leads (Admin)' },
  { prefix: '/api/admin/courses', router: demoAdminCourseRoutes, module: 'Demo Settings (Admin)' },
  { prefix: '/api/admin/courses', router: adminCourseEligibilityRoutes, module: 'Eligibility Rules (Admin)' },
  { prefix: '/api/admin/categories', router: categoryAdminRoutes, module: 'Categories (Admin)' },
  { prefix: '/api/admin/subcategories', router: subcategoryAdminRoutes, module: 'Subcategories (Admin)' },
  { prefix: '/api/admin/courses', router: courseCurriculumAdminRoutes, module: 'Curriculum (Admin)' },
  { prefix: '/api/admin/courses', router: courseBatchAdminRoutes, module: 'Batches (Admin Course)' },
  { prefix: '/api/admin/courses', router: courseContentAdminRoutes, module: 'Course Content (Admin)' },
  { prefix: '/api/admin/courses', router: courseMaterialAdminRoutes, module: 'Materials (Admin Course)' },
  { prefix: '/api/admin/courses', router: courseAdminRoutes, module: 'Courses (Admin)' },
  { prefix: '/api/admin/modules', router: moduleAdminRoutes, module: 'Modules (Admin)' },
  { prefix: '/api/admin/lessons', router: lessonAdminRoutes, module: 'Lessons (Admin)' },
  { prefix: '/api/admin/batches', router: batchAdminRoutes, module: 'Batches (Admin Global)' },
  { prefix: '/api/admin/materials', router: materialAdminRoutes, module: 'Materials (Admin Global)' },
  { prefix: '/api/admin/instructors', router: instructorAdminRoutes, module: 'Instructors (Admin)' }
];

const allEndpoints = [];

mounts.forEach(m => {
  if (!m.router || !m.router.stack) return;
  m.router.stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(k => k.toUpperCase());
      const subPath = layer.route.path === '/' ? '' : layer.route.path;
      const fullPath = (m.prefix + subPath).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      methods.forEach(method => {
        allEndpoints.push({
          module: m.module,
          method,
          path: fullPath
        });
      });
    }
  });
});

// Add root route
allEndpoints.push({
  module: 'Root',
  method: 'GET',
  path: '/api'
});

console.log('Total registered endpoints (module inventory):', allEndpoints.length);

// Check uniqueness
const seen = new Map();
allEndpoints.forEach((ep, idx) => {
  const key = `${ep.method} ${ep.path}`;
  if (seen.has(key)) {
    console.log(`NOTE: Duplicate endpoint definition detected at index ${idx + 1}: ${key} (first seen in ${seen.get(key)})`);
  } else {
    seen.set(key, ep.module);
  }
});

console.log('Total unique HTTP endpoints:', seen.size);

// Print full numbered list
allEndpoints.forEach((ep, i) => {
  console.log(`${String(i + 1).padStart(3, ' ')}. [${ep.method.padEnd(6)}] ${ep.path.padEnd(52)} (${ep.module})`);
});
