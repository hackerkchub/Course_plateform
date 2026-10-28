import * as curriculumRepo from './curriculum.repository.js';
import * as courseRepo from '../courses/course.repository.js';
import { recordAuditLog } from '../../utils/auditLogger.js';

export async function getCurriculum(courseId) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const curriculum = await curriculumRepo.findCurriculumByCourseId(courseId);
  return curriculum;
}

export async function addModule(courseId, data, actorId, ipAddress) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const module = await curriculumRepo.createModule(courseId, data);
  await curriculumRepo.syncCourseCurriculumCounters(courseId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'CREATE_MODULE',
    entity_type: 'course_module',
    entity_id: module.id,
    new_value: module,
    ip_address: ipAddress,
  });

  return module;
}

export async function updateModule(moduleId, data, actorId, ipAddress) {
  const existing = await curriculumRepo.findModuleById(moduleId);
  if (!existing) {
    const error = new Error('Module not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = await curriculumRepo.updateModule(moduleId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_MODULE',
    entity_type: 'course_module',
    entity_id: moduleId,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteModule(moduleId, actorId, ipAddress) {
  const existing = await curriculumRepo.findModuleById(moduleId);
  if (!existing) {
    const error = new Error('Module not found');
    error.statusCode = 404;
    throw error;
  }

  const courseId = existing.course_id;
  await curriculumRepo.deleteModule(moduleId);
  await curriculumRepo.syncCourseCurriculumCounters(courseId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'DELETE_MODULE',
    entity_type: 'course_module',
    entity_id: moduleId,
    old_value: existing,
    ip_address: ipAddress,
  });

  return { id: moduleId, deleted: true };
}

export async function addLesson(moduleId, data, actorId, ipAddress) {
  const module = await curriculumRepo.findModuleById(moduleId);
  if (!module) {
    const error = new Error('Module not found');
    error.statusCode = 404;
    throw error;
  }

  const lesson = await curriculumRepo.createLesson(moduleId, data);
  await curriculumRepo.syncCourseCurriculumCounters(module.course_id);

  await recordAuditLog({
    actor_id: actorId,
    action: 'CREATE_LESSON',
    entity_type: 'course_lesson',
    entity_id: lesson.id,
    new_value: lesson,
    ip_address: ipAddress,
  });

  return lesson;
}

export async function updateLesson(lessonId, data, actorId, ipAddress) {
  const existing = await curriculumRepo.findLessonById(lessonId);
  if (!existing) {
    const error = new Error('Lesson not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = await curriculumRepo.updateLesson(lessonId, data);
  if (data.duration_seconds !== undefined) {
    await curriculumRepo.syncCourseCurriculumCounters(existing.course_id);
  }

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_LESSON',
    entity_type: 'course_lesson',
    entity_id: lessonId,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteLesson(lessonId, actorId, ipAddress) {
  const existing = await curriculumRepo.findLessonById(lessonId);
  if (!existing) {
    const error = new Error('Lesson not found');
    error.statusCode = 404;
    throw error;
  }

  const courseId = existing.course_id;
  await curriculumRepo.deleteLesson(lessonId);
  await curriculumRepo.syncCourseCurriculumCounters(courseId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'DELETE_LESSON',
    entity_type: 'course_lesson',
    entity_id: lessonId,
    old_value: existing,
    ip_address: ipAddress,
  });

  return { id: lessonId, deleted: true };
}

export async function reorderCurriculum(courseId, data, actorId, ipAddress) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  await curriculumRepo.reorderCurriculum(courseId, data.modules);

  await recordAuditLog({
    actor_id: actorId,
    action: 'REORDER_CURRICULUM',
    entity_type: 'course_curriculum',
    entity_id: courseId,
    new_value: data,
    ip_address: ipAddress,
  });

  const updatedCurriculum = await curriculumRepo.findCurriculumByCourseId(courseId);
  return updatedCurriculum;
}
