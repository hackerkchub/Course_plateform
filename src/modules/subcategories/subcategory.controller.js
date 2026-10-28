import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { parsePagination } from '../../utils/pagination.js';
import {
  getSubcategoriesByCatSlug as getSubcategoriesByCatSlugService,
  getSubcategoryPage as getSubcategoryPageService,
  getSubcategoriesAdmin,
  getSubcategoryByIdAdmin,
  createSubcategory as createSubcategoryService,
  updateSubcategory as updateSubcategoryService,
  reorderSubcategories as reorderSubcategoriesService,
  deleteSubcategory as deleteSubcategoryService,
} from './subcategory.service.js';

export async function getSubcategoriesByCatSlug(req, res, next) {
  try {
    const { catSlug } = req.params;
    const subcategories = await getSubcategoriesByCatSlugService(catSlug);
    return sendSuccess(res, 'Subcategories retrieved successfully', subcategories, 200);
  } catch (error) {
    next(error);
  }
}

export async function getSubcategoryPage(req, res, next) {
  try {
    const { catSlug, subSlug } = req.params;
    const pagination = parsePagination(req.query, 12);
    const filters = {
      ...req.query,
      page: pagination.page,
      limit: pagination.limit,
      sort: pagination.sort,
    };

    const pageData = await getSubcategoryPageService(catSlug, subSlug, filters, req.user?.id);
    return res.status(200).json({
      success: true,
      data: {
        category: pageData.category,
        subcategory: pageData.subcategory,
        breadcrumbs: pageData.breadcrumbs,
        filters_available: pageData.filters_available,
        courses: pageData.courses,
      },
      pagination: pageData.pagination,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdminSubcategories(req, res, next) {
  try {
    const pagination = parsePagination(req.query, 20);
    const { category_id, status, search } = req.query;

    const { subcategories, total } = await getSubcategoriesAdmin({
      category_id: category_id ? Number(category_id) : undefined,
      status,
      search,
      limit: pagination.limit,
      offset: pagination.offset,
      sort: pagination.sort,
    });

    return sendPaginated(res, subcategories, pagination.page, pagination.limit, total, 200);
  } catch (error) {
    next(error);
  }
}

export async function getAdminSubcategoryById(req, res, next) {
  try {
    const { id } = req.params;
    const subcategory = await getSubcategoryByIdAdmin(Number(id));
    return sendSuccess(res, 'Subcategory retrieved successfully', subcategory, 200);
  } catch (error) {
    next(error);
  }
}

export async function createSubcategory(req, res, next) {
  try {
    const newSubcategory = await createSubcategoryService(req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Subcategory created successfully', newSubcategory, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateSubcategory(req, res, next) {
  try {
    const { id } = req.params;
    const updated = await updateSubcategoryService(Number(id), req.body, req.user?.id, req.ip);
    return sendSuccess(res, 'Subcategory updated successfully', updated, 200);
  } catch (error) {
    next(error);
  }
}

export async function reorderSubcategories(req, res, next) {
  try {
    await reorderSubcategoriesService(req.body.items, req.user?.id, req.ip);
    return sendSuccess(res, 'Subcategories reordered successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export async function deleteSubcategory(req, res, next) {
  try {
    const { id } = req.params;
    await deleteSubcategoryService(Number(id), req.user?.id, req.ip);
    return sendSuccess(res, 'Subcategory deleted successfully', {}, 200);
  } catch (error) {
    next(error);
  }
}

export default {
  getSubcategoriesByCatSlug,
  getSubcategoryPage,
  getAdminSubcategories,
  getAdminSubcategoryById,
  createSubcategory,
  updateSubcategory,
  reorderSubcategories,
  deleteSubcategory,
};
