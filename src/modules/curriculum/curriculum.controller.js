import { sendSuccess } from '../../utils/response.js';
import * as curriculumService from './curriculum.service.js';

export async function getCurriculum(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const curriculum = await curriculumService.getCurriculum(courseId);
    return sendSuccess(res, 'Curriculum fetched successfully', curriculum);
  } catch (error) {
    next(error);
  }
}

export async function addModule(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const module = await curriculumService.addModule(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Module created successfully', module, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateModule(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const module = await curriculumService.updateModule(moduleId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Module updated successfully', module);
  } catch (error) {
    next(error);
  }
}

export async function deleteModule(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await curriculumService.deleteModule(moduleId, actorId, ipAddress);
    return sendSuccess(res, 'Module deleted successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function addLesson(req, res, next) {
  try {
    const moduleId = Number(req.params.moduleId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const lesson = await curriculumService.addLesson(moduleId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Lesson created successfully', lesson, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateLesson(req, res, next) {
  try {
    const lessonId = Number(req.params.lessonId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const lesson = await curriculumService.updateLesson(lessonId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Lesson updated successfully', lesson);
  } catch (error) {
    next(error);
  }
}

export async function deleteLesson(req, res, next) {
  try {
    const lessonId = Number(req.params.lessonId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await curriculumService.deleteLesson(lessonId, actorId, ipAddress);
    return sendSuccess(res, 'Lesson deleted successfully', result);
  } catch (error) {
    next(error);
  }
}

export async function reorderCurriculum(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const curriculum = await curriculumService.reorderCurriculum(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Curriculum reordered successfully', curriculum);
  } catch (error) {
    next(error);
  }
}
