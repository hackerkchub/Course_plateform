import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  getPublishedCourses,
  getCourseBySlug as getCourseBySlugService,
  getCourseReviews as getCourseReviewsService,
  searchCatalog as searchCatalogService,
  getCoursesAdmin,
  getCourseByIdAdmin,
  createCourse as createCourseService,
  updateCourse as updateCourseService,
  updateCourseStatus as updateCourseStatusService,
  duplicateCourse as duplicateCourseService,
  deleteCourse as deleteCourseService,
} from './course.service.js';

export async function getCourses(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 12);
    const filters = {
      ...req.query,
      page: pagination.page,
      limit: pagination.limit,
      sort: pagination.sort,
    };

    const { courses, total, page, limit } = await getPublishedCourses(filters, req.user?.id);
    return sendPaginated(res, courses, page, limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function getCourseBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const result = await getCourseBySlugService(slug, req.user?.id);

    // Section 9.2: "Slug purana ho (course_slug_history me mila) to 301 redirect do"
    if (result.redirected) {
      return res.redirect(301, `/api/courses/${result.newSlug}`);
    }

    return sendSuccess(res, 'Course details retrieved successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function getCourseReviews(req, res, next) {
  try {
    const { id } = req.params;
    const pagination = parsePagination(req.query, 10);
    const reviewsData = await getCourseReviewsService(Number(id), pagination);
    return sendPaginated(res, reviewsData.reviews, reviewsData.page, reviewsData.limit, reviewsData.total, 200);
  } catch (error) {
    next(error);
  }
}

export async function search(req, res, next) {
  try {
    const { q, type, limit } = req.query;
    const results = await searchCatalogService({
      q,
      type: type || 'all',
      limit: limit ? Number(limit) : 10,
    });
    return sendSuccess(res, 'Search completed successfully', results, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminCourses(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const filters = {
      ...req.query,
      limit: pagination.limit,
      offset: pagination.offset,
      sort: pagination.sort,
    };

    const { courses, total, page, limit } = await getCoursesAdmin(filters);
    return sendPaginated(res, courses, page, limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminCourseById(req, res, next) {
  try {
    const { id } = req.params;
    const course = await getCourseByIdAdmin(Number(id));
    return sendSuccess(res, 'Course retrieved successfully', course, 200);
  } catch (error) {
    next(error);
  }
}

export async function createCourse(req, res, next) {
  try {
    const newCourse = await createCourseService(req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Course created successfully', newCourse, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await updateCourseService(Number(id), req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Course updated successfully', updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function updateCourseStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await updateCourseStatusService(Number(id), status, req.user?.id, req.ip);
    return sendSuccess(res, `Course status updated to ${status}`, updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function duplicateCourse(req, res, next) {
  try {
    const { id } = req.params;
    const duplicated = await duplicateCourseService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Course duplicated successfully as draft', duplicated, 201);
  } catch (error) {
    next(error);
  }
}

export async function deleteCourse(req, res, next) {
  try {
    const { id } = req.params;
    await deleteCourseService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Course deleted successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  getCourses,
  getCourseBySlug,
  getCourseReviews,
  search,
  getAdminCourses,
  getAdminCourseById,
  createCourse,
  updateCourse,
  updateCourseStatus,
  duplicateCourse,
  deleteCourse,
};
