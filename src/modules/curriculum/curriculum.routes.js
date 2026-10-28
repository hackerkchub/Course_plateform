import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import * as controller from './curriculum.controller.js';
import {
  createModuleSchema,
  updateModuleSchema,
  createLessonSchema,
  updateLessonSchema,
  reorderCurriculumSchema,
} from './curriculum.validation.js';

// Router for /api/admin/courses/:id/...
const courseCurriculumAdminRoutes = Router({ mergeParams: true });
courseCurriculumAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));

courseCurriculumAdminRoutes.get('/:id/curriculum', controller.getCurriculum);
courseCurriculumAdminRoutes.post('/:id/modules', validateBody(createModuleSchema), controller.addModule);
courseCurriculumAdminRoutes.patch('/:id/curriculum/reorder', validateBody(reorderCurriculumSchema), controller.reorderCurriculum);

// Router for /api/admin/modules/...
const moduleAdminRoutes = Router();
moduleAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));

moduleAdminRoutes.patch('/:moduleId', validateBody(updateModuleSchema), controller.updateModule);
moduleAdminRoutes.delete('/:moduleId', controller.deleteModule);
moduleAdminRoutes.post('/:moduleId/lessons', validateBody(createLessonSchema), controller.addLesson);

// Router for /api/admin/lessons/...
const lessonAdminRoutes = Router();
lessonAdminRoutes.use(authenticate, authorize('admin', 'super_admin'));

lessonAdminRoutes.patch('/:lessonId', validateBody(updateLessonSchema), controller.updateLesson);
lessonAdminRoutes.delete('/:lessonId', controller.deleteLesson);

export {
  courseCurriculumAdminRoutes,
  moduleAdminRoutes,
  lessonAdminRoutes,
};
