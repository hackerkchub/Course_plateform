import { AppError } from '../../middleware/errorHandler.js';
import {
  findCourseForWishlist,
  addCourseToWishlist,
  removeCourseFromWishlist,
  findUserWishlist,
} from './wishlist.repository.js';

export async function addToWishlistService(userId, courseId) {
  const course = await findCourseForWishlist(courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }

  if (course.status !== 'published') {
    throw new AppError('Course is not available for wishlisting', 400);
  }

  const result = await addCourseToWishlist(userId, courseId);
  return {
    course_id: Number(courseId),
    wishlisted: true,
    already_wishlisted: result.alreadyWishlisted,
  };
}

export async function removeFromWishlistService(userId, courseId) {
  const result = await removeCourseFromWishlist(userId, courseId);
  return {
    course_id: Number(courseId),
    wishlisted: false,
    removed: result.removed,
  };
}

export async function getMyWishlistService(userId, pagination) {
  return findUserWishlist(userId, pagination);
}
