import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  getActiveCategories,
  getCategoryBySlug as getCategoryBySlugService,
  getCategoriesAdmin,
  getCategoryByIdAdmin,
  createCategory as createCategoryService,
  updateCategory as updateCategoryService,
  reorderCategories as reorderCategoriesService,
  deleteCategory as deleteCategoryService,
} from './category.service.js';

export async function getCategories(req, res, next) {
  try {
    const includeSubcategories = req.query.include === 'subcategories';
    const categories = await getActiveCategories(includeSubcategories);
    return sendSuccess(res, 'Categories retrieved successfully', categories, 200);
  } catch (error) {
    next(error);
  }
}

export async function getCategoryBySlug(req, res, next) {
  try {
    const { slug } = req.params;
    const categoryData = await getCategoryBySlugService(slug);
    return sendSuccess(res, 'Category details retrieved successfully', categoryData, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminCategories(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { status, search } = req.query;

    const { categories, total } = await getCategoriesAdmin({
      status,
      search,
      limit: pagination.limit,
      offset: pagination.offset,
      sort: pagination.sort,
    });

    return sendPaginated(res, categories, pagination.page, pagination.limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminCategoryById(req, res, next) {
  try {
    const { id } = req.params;
    const category = await getCategoryByIdAdmin(Number(id));
    return sendSuccess(res, 'Category retrieved successfully', category, 200);
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req, res, next) {
  try {
    const newCategory = await createCategoryService(req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Category created successfully', newCategory, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await updateCategoryService(Number(id), req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Category updated successfully', updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function reorderCategories(req, res, next) {
  try {
    await reorderCategoriesService(req.body.items, req.user?.id, req.ip);
    return sendSuccess(res, 'Categories reordered successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const { id } = req.params;
    await deleteCategoryService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Category deleted successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  getCategories,
  getCategoryBySlug,
  getAdminCategories,
  getAdminCategoryById,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
};
