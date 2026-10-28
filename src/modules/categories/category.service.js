import { AppError } from '../../middleware/errorHandler.js';
import { generateSlug } from '../../utils/slug.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import {
  findActiveCategories,
  findCategoryBySlug,
  findCategoriesAdmin,
  findCategoryById,
  findCategoryBySlugAny,
  createCategory as repoCreateCategory,
  updateCategory as repoUpdateCategory,
  reorderCategories as repoReorderCategories,
  countActiveSubcategoriesByCategoryId,
  softDeleteCategory as repoSoftDeleteCategory,
} from './category.repository.js';

export async function getActiveCategories(includeSubcategories = false) {
  return findActiveCategories(includeSubcategories);
}

export async function getCategoryBySlug(slug) {
  const result = await findCategoryBySlug(slug);
  if (!result) {
    throw new AppError('Category not found', 404);
  }
  return result;
}

export async function getCategoriesAdmin(filters) {
  return findCategoriesAdmin(filters);
}

export async function getCategoryByIdAdmin(id) {
  const category = await findCategoryById(id);
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  return category;
}

export async function createCategory(data, actorId = null, ipAddress = null) {
  const slug = data.slug ? data.slug.toLowerCase().trim() : generateSlug(data.name);

  if (!slug) {
    throw new AppError('Could not generate a valid slug from category name', 400);
  }

  // Check unique slug
  const existing = await findCategoryBySlugAny(slug);
  if (existing) {
    throw new AppError('Category with this slug already exists', 409);
  }

  const categoryData = {
    ...data,
    slug,
    created_by: actorId,
  };

  const newCategory = await repoCreateCategory(categoryData);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'category.create',
    entity_type: 'category',
    entity_id: newCategory.id,
    new_value: newCategory,
    ip_address: ipAddress,
  });

  return newCategory;
}

export async function updateCategory(id, data, actorId = null, ipAddress = null) {
  const existing = await findCategoryById(id);
  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  const updatePayload = { ...data };

  if (updatePayload.name && !updatePayload.slug && !existing.slug) {
    updatePayload.slug = generateSlug(updatePayload.name);
  }

  if (updatePayload.slug) {
    updatePayload.slug = updatePayload.slug.toLowerCase().trim();
    const slugConflict = await findCategoryBySlugAny(updatePayload.slug, id);
    if (slugConflict) {
      throw new AppError('Category with this slug already exists', 409);
    }
  }

  const updatedCategory = await repoUpdateCategory(id, updatePayload);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'category.update',
    entity_type: 'category',
    entity_id: id,
    old_value: existing,
    new_value: updatedCategory,
    ip_address: ipAddress,
  });

  return updatedCategory;
}

export async function reorderCategories(items, actorId = null, ipAddress = null) {
  await repoReorderCategories(items);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'category.reorder',
    entity_type: 'category',
    entity_id: 0,
    new_value: { items },
    ip_address: ipAddress,
  });
}

export async function deleteCategory(id, actorId = null, ipAddress = null) {
  const existing = await findCategoryById(id);
  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  // Business rule (Section 7.2): Delete tabhi chalega jab category me koi active subcategory na ho, warna 409
  const activeSubsCount = await countActiveSubcategoriesByCategoryId(id);
  if (activeSubsCount > 0) {
    throw new AppError('Category has active subcategories and cannot be deleted. Move or delete subcategories first.', 409);
  }

  await repoSoftDeleteCategory(id);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'category.delete',
    entity_type: 'category',
    entity_id: id,
    old_value: existing,
    ip_address: ipAddress,
  });
}

export default {
  getActiveCategories,
  getCategoryBySlug,
  getCategoriesAdmin,
  getCategoryByIdAdmin,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
};
