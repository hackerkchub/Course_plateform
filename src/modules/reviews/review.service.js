import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import { findCourseForWishlist } from '../wishlist/wishlist.repository.js';
import {
  checkUserEnrollment,
  findReviewByUserAndCourse,
  findReviewById,
  insertReview,
  updateReview,
  deleteReview,
  updateReviewModeration,
  recalculateCourseRating,
  findPublicCourseReviews,
  findAdminReviews,
} from './review.repository.js';

export async function submitReviewService(userId, courseId, data) {
  // 1. Verify course exists and is published
  const course = await findCourseForWishlist(courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  if (course.status !== 'published') {
    throw new AppError('Course is not available for reviews', 400);
  }

  // 2. Enforce verified enrollment
  const isEnrolled = await checkUserEnrollment(userId, courseId);
  if (!isEnrolled) {
    throw new AppError('Only enrolled students can review this course', 403);
  }

  // 3. Prevent duplicate reviews (Section 19.3 & 15.3: single review per user per course)
  const existingReview = await findReviewByUserAndCourse(userId, courseId);
  if (existingReview) {
    throw new AppError('You have already reviewed this course', 409);
  }

  // 4. Insert new review in 'pending' moderation status
  const insertId = await insertReview({
    userId,
    courseId,
    rating: data.rating,
    title: data.title || null,
    text: data.text || null,
    isVerifiedEnrollment: true,
  });

  return {
    id: insertId,
    course_id: Number(courseId),
    rating: data.rating,
    moderation_status: 'pending',
  };
}

export async function editMyReviewService(userId, reviewId, data) {
  const review = await findReviewById(reviewId);
  if (!review || Number(review.user_id) !== Number(userId)) {
    throw new AppError('Review not found', 404);
  }

  const wasApproved = review.moderation_status === 'approved';

  // Update review and revert status to 'pending'
  await updateReview(reviewId, data);

  // If the review was previously approved, dynamically recompute rating
  // because pending reviews must not contribute to the public course rating
  if (wasApproved) {
    await recalculateCourseRating(review.course_id);
  }

  return {
    id: Number(reviewId),
    moderation_status: 'pending',
  };
}

export async function deleteMyReviewService(userId, reviewId) {
  const review = await findReviewById(reviewId);
  if (!review || Number(review.user_id) !== Number(userId)) {
    throw new AppError('Review not found', 404);
  }

  const wasApproved = review.moderation_status === 'approved';

  await deleteReview(reviewId);

  // Recompute course rating if the deleted review was approved
  if (wasApproved) {
    await recalculateCourseRating(review.course_id);
  }

  return {
    success: true,
    message: 'Review deleted successfully',
  };
}

export async function getPublicReviewsService(courseId, pagination) {
  const course = await findCourseForWishlist(courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }

  return findPublicCourseReviews(courseId, pagination);
}

export async function getAdminReviewsService(filters) {
  return findAdminReviews(filters);
}

export async function moderateReviewService(reviewId, { moderation_status, reason }, actorId = null, ipAddress = null) {
  const review = await findReviewById(reviewId);
  if (!review) {
    throw new AppError('Review not found', 404);
  }

  const previousStatus = review.moderation_status;

  // Update status in DB
  await updateReviewModeration(reviewId, moderation_status);

  // Dynamically recalculate course rating_avg and rating_count from approved reviews
  const stats = await recalculateCourseRating(review.course_id);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'review.moderate',
    entity_type: 'review',
    entity_id: reviewId,
    old_value: { moderation_status: previousStatus },
    new_value: { moderation_status, reason: reason || null },
    ip_address: ipAddress,
  });

  return {
    id: Number(reviewId),
    moderation_status,
    course_id: Number(review.course_id),
    course_rating_avg: stats.avgRating,
    course_rating_count: stats.totalCount,
  };
}
