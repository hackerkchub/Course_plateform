import { AppError } from '../../middleware/errorHandler.js';
import { generateSlug } from '../../utils/slug.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import { findCategoryById } from '../categories/category.repository.js';
import {
  findSubcategoriesByCatSlug,
  findSubcategoryPage,
  findSubcategoriesAdmin,
  findSubcategoryById,
  findSubcategoryBySlugAndCategory,
  createSubcategory as repoCreateSubcategory,
  updateSubcategory as repoUpdateSubcategory,
  moveSubcategoryToCategory,
  reorderSubcategories as repoReorderSubcategories,
  countCoursesBySubcategoryId,
  softDeleteSubcategory as repoSoftDeleteSubcategory,
} from './subcategory.repository.js';

export async function getSubcategoriesByCatSlug(catSlug) {
  return findSubcategoriesByCatSlug(catSlug);
}

export async function getSubcategoryPage(catSlug, subSlug, filters = {}, userId = null) {
  const result = await findSubcategoryPage(catSlug, subSlug, filters, userId);
  if (!result) {
    throw new AppError('Subcategory not found or inactive', 404);
  }
  return result;
}

export async function getSubcategoriesAdmin(filters) {
  return findSubcategoriesAdmin(filters);
}

export async function getSubcategoryByIdAdmin(id) {
  const subcategory = await findSubcategoryById(id);
  if (!subcategory) {
    throw new AppError('Subcategory not found', 404);
  }
  return subcategory;
}

export async function createSubcategory(data, actorId = null, ipAddress = null) {
  // 1. Verify parent category exists and is not deleted
  const parentCategory = await findCategoryById(data.category_id);
  if (!parentCategory) {
    throw new AppError('Parent category not found', 404);
  }

  // 2. Slug generation and uniqueness check within category
  const slug = data.slug ? data.slug.toLowerCase().trim() : generateSlug(data.name);
  if (!slug) {
    throw new AppError('Could not generate a valid slug from subcategory name', 400);
  }

  const existingSlug = await findSubcategoryBySlugAndCategory(data.category_id, slug);
  if (existingSlug) {
    throw new AppError('A subcategory with this slug already exists in this category', 409);
  }

  const subcategoryData = {
    ...data,
    slug,
  };

  const newSubcategory = await repoCreateSubcategory(subcategoryData);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'subcategory.create',
    entity_type: 'subcategory',
    entity_id: newSubcategory.id,
    new_value: newSubcategory,
    ip_address: ipAddress,
  });

  return newSubcategory;
}

export async function updateSubcategory(id, data, actorId = null, ipAddress = null) {
  const existing = await findSubcategoryById(id);
  if (!existing) {
    throw new AppError('Subcategory not found', 404);
  }

  const targetCategoryId = data.category_id ? Number(data.category_id) : existing.category_id;
  let targetSlug = existing.slug;

  if (data.slug) {
    targetSlug = data.slug.toLowerCase().trim();
  } else if (data.name && !existing.slug) {
    targetSlug = generateSlug(data.name);
  }

  // If category changed, verify new parent category exists
  let isMovingCategory = false;
  let newParentCategory = null;
  let oldParentCategory = null;

  if (data.category_id && Number(data.category_id) !== existing.category_id) {
    isMovingCategory = true;
    newParentCategory = await findCategoryById(targetCategoryId);
    if (!newParentCategory) {
      throw new AppError('Target category not found', 404);
    }
    oldParentCategory = await findCategoryById(existing.category_id);
  }

  // Verify slug uniqueness within the target category
  const slugConflict = await findSubcategoryBySlugAndCategory(targetCategoryId, targetSlug, id);
  if (slugConflict) {
    throw new AppError('A subcategory with this slug already exists in the target category', 409);
  }

  const updatePayload = {
    ...data,
    slug: targetSlug,
  };

  // Perform category move if applicable (Section 8.2 rule: update courses category_id & record slug history)
  if (isMovingCategory) {
    await moveSubcategoryToCategory(
      id,
      targetCategoryId,
      oldParentCategory?.slug || 'old-category',
      newParentCategory.slug
    );
  }

  const updatedSubcategory = await repoUpdateSubcategory(id, updatePayload);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: isMovingCategory ? 'subcategory.move' : 'subcategory.update',
    entity_type: 'subcategory',
    entity_id: id,
    old_value: existing,
    new_value: updatedSubcategory,
    ip_address: ipAddress,
  });

  return updatedSubcategory;
}

export async function reorderSubcategories(items, actorId = null, ipAddress = null) {
  await repoReorderSubcategories(items);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'subcategory.reorder',
    entity_type: 'subcategory',
    entity_id: 0,
    new_value: { items },
    ip_address: ipAddress,
  });
}

export async function deleteSubcategory(id, actorId = null, ipAddress = null) {
  const existing = await findSubcategoryById(id);
  if (!existing) {
    throw new AppError('Subcategory not found', 404);
  }

  // Business rule (Section 8.2): Subcategory me courses hon to delete 409 deta hai
  const activeCourseCount = await countCoursesBySubcategoryId(id);
  if (activeCourseCount > 0) {
    throw new AppError('Subcategory has courses; please move or archive courses first.', 409);
  }

  await repoSoftDeleteSubcategory(id);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'subcategory.delete',
    entity_type: 'subcategory',
    entity_id: id,
    old_value: existing,
    ip_address: ipAddress,
  });
}

export default {
  getSubcategoriesByCatSlug,
  getSubcategoryPage,
  getSubcategoriesAdmin,
  getSubcategoryByIdAdmin,
  createSubcategory,
  updateSubcategory,
  reorderSubcategories,
  deleteSubcategory,
};
