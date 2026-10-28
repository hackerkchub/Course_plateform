import { sendSuccess, sendPaginated } from '../../utils/response.js';
import {
  submitReviewService,
  editMyReviewService,
  deleteMyReviewService,
  getPublicReviewsService,
  getAdminReviewsService,
  moderateReviewService,
} from './review.service.js';

export async function getPublicReviews(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const pagination = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      sort: req.query.sort || 'newest',
    };
    const result = await getPublicReviewsService(courseId, pagination);
    return sendPaginated(res, result.reviews, result.page, result.limit, result.total, 200);
  } catch (error) {
    next(error);
  }
}

export async function submitReview(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await submitReviewService(req.user.id, courseId, req.body);
    return sendSuccess(res, 'Review submitted successfully and is awaiting moderation', result, 201);
  } catch (error) {
    next(error);
  }
}

export async function editMyReview(req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    const result = await editMyReviewService(req.user.id, reviewId, req.body);
    return sendSuccess(res, 'Review updated and resubmitted for moderation', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function deleteMyReview(req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    const result = await deleteMyReviewService(req.user.id, reviewId);
    return sendSuccess(res, result.message, {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminReviews(req, res, next) {
  try {
    const filters = {
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
      moderation_status: req.query.moderation_status || 'all',
      course_id: req.query.course_id ? Number(req.query.course_id) : undefined,
      rating: req.query.rating ? Number(req.query.rating) : undefined,
      sort: req.query.sort || 'newest',
    };
    const result = await getAdminReviewsService(filters);
    return sendPaginated(res, result.reviews, result.page, result.limit, result.total, 200);
  } catch (error) {
    next(error);
  }
}

export async function moderateReview(req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    const result = await moderateReviewService(reviewId, req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Review moderation status updated successfully', result, 200);
  } catch (error) {
    next(error);
  }
}
