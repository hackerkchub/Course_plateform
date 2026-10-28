import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  getActiveInstructors,
  getInstructorById as getInstructorByIdService,
  getInstructorsAdmin,
  createInstructor as createInstructorService,
  updateInstructor as updateInstructorService,
  deleteInstructor as deleteInstructorService,
} from './instructor.service.js';

export async function getInstructors(req, res, next) {
  try {
    const instructors = await getActiveInstructors();
    return sendSuccess(res, 'Instructors retrieved successfully', instructors, 200);
  } catch (error) {
    next(error);
  }
}

export async function getInstructorById(req, res, next) {
  try {
    const { id } = req.params;
    const instructor = await getInstructorByIdService(Number(id));
    return sendSuccess(res, 'Instructor details retrieved successfully', instructor, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminInstructors(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { status, search } = req.query;

    const { instructors, total } = await getInstructorsAdmin({
      status,
      search,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return sendPaginated(res, instructors, pagination.page, pagination.limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function createInstructor(req, res, next) {
  try {
    const newInstructor = await createInstructorService(req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor created successfully', newInstructor, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateInstructor(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await updateInstructorService(Number(id), req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor updated successfully', updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function deleteInstructor(req, res, next) {
  try {
    const { id } = req.params;
    await deleteInstructorService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Instructor deactivated successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  getInstructors,
  getInstructorById,
  getAdminInstructors,
  createInstructor,
  updateInstructor,
  deleteInstructor,
};
