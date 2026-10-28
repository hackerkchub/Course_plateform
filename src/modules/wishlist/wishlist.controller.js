import { sendSuccess, sendPaginated } from '../../utils/response.js';
import {
  addToWishlistService,
  removeFromWishlistService,
  getMyWishlistService,
} from './wishlist.service.js';

export async function addToWishlist(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await addToWishlistService(req.user.id, courseId);
    const status = result.already_wishlisted ? 200 : 201;
    const message = result.already_wishlisted
      ? 'Course already in wishlist'
      : 'Course added to wishlist successfully';
    return sendSuccess(res, message, result, status);
  } catch (error) {
    next(error);
  }
}

export async function removeFromWishlist(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const result = await removeFromWishlistService(req.user.id, courseId);
    return sendSuccess(res, 'Course removed from wishlist successfully', result, 200);
  } catch (error) {
    next(error);
  }
}

export async function getMyWishlist(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const result = await getMyWishlistService(req.user.id, { page, limit });
    return sendPaginated(res, result.courses, result.page, result.limit, result.total, 200);
  } catch (error) {
    next(error);
  }
}
