import { AppError } from '../../middleware/errorHandler.js';
import { generateSlug } from '../../utils/slug.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import { findSubcategoryById } from '../subcategories/subcategory.repository.js';
import { findInstructorById } from '../instructors/instructor.repository.js';
import {
  findPublishedCourses,
  findCourseBySlug,
  findCourseReviews,
  searchCatalog as repoSearchCatalog,
  findCoursesAdmin,
  findCourseByIdAdmin,
  findCourseByCode,
  findCourseBySlugAny,
  createCourse as repoCreateCourse,
  updateCourse as repoUpdateCourse,
  recordSlugChange,
  updateCourseStatus as repoUpdateCourseStatus,
  softDeleteCourse as repoSoftDeleteCourse,
} from './course.repository.js';

export async function getPublishedCourses(filters = {}, userId = null) {
  return findPublishedCourses(filters, userId);
}

export async function getCourseBySlug(slug, userId = null) {
  const result = await findCourseBySlug(slug, userId);
  if (!result) {
    throw new AppError('Course not found or inactive', 404);
  }
  return result;
}

export async function getCourseReviews(courseId, pagination) {
  const course = await findCourseByIdAdmin(courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  return findCourseReviews(courseId, pagination);
}

export async function searchCatalog(query) {
  return repoSearchCatalog(query);
}

export async function getCoursesAdmin(filters) {
  return findCoursesAdmin(filters);
}

export async function getCourseByIdAdmin(id) {
  const course = await findCourseByIdAdmin(id);
  if (!course) {
    throw new AppError('Course not found', 404);
  }
  return course;
}

export async function createCourse(data, actorId = null, ipAddress = null) {
  // 1. Verify subcategory exists
  const subcategory = await findSubcategoryById(data.subcategory_id);
  if (!subcategory) {
    throw new AppError('Subcategory not found', 404);
  }

  // 2. Verify instructor if provided
  if (data.instructor_id) {
    const instructor = await findInstructorById(data.instructor_id);
    if (!instructor) {
      throw new AppError('Instructor not found', 404);
    }
  }

  // 3. Verify course_code uniqueness
  const codeConflict = await findCourseByCode(data.course_code.trim());
  if (codeConflict) {
    throw new AppError('Course code already exists', 409);
  }

  // 4. Slug generation and uniqueness
  const slug = data.slug ? data.slug.toLowerCase().trim() : generateSlug(data.course_name);
  if (!slug) {
    throw new AppError('Could not generate a valid slug from course name', 400);
  }

  const slugConflict = await findCourseBySlugAny(slug);
  if (slugConflict) {
    throw new AppError('Course with this slug already exists', 409);
  }

  // 5. Sanitize HTML description
  const sanitizedDescription = sanitizeHtml(data.description);

  // 6. Free course price normalization
  let price = Number(data.price);
  let offerPrice = data.offer_price !== undefined && data.offer_price !== null ? Number(data.offer_price) : null;
  if (data.is_free) {
    price = 0;
    offerPrice = null;
  }

  const courseData = {
    ...data,
    course_code: data.course_code.trim(),
    course_name: data.course_name.trim(),
    slug,
    description: sanitizedDescription,
    category_id: subcategory.category_id, // Server strictly sets category_id from subcategory
    price,
    offer_price: offerPrice,
    created_by: actorId,
  };

  const courseId = await repoCreateCourse(courseData);
  const createdCourse = await findCourseByIdAdmin(courseId);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'course.create',
    entity_type: 'course',
    entity_id: courseId,
    new_value: createdCourse,
    ip_address: ipAddress,
  });

  return createdCourse;
}

export async function updateCourse(id, data, actorId = null, ipAddress = null) {
  const existing = await findCourseByIdAdmin(id);
  if (!existing) {
    throw new AppError('Course not found', 404);
  }

  const updatePayload = {
    ...data,
    updated_by: actorId,
  };

  // 1. Verify code uniqueness if updating code
  if (data.course_code && data.course_code.trim() !== existing.course_code) {
    const codeConflict = await findCourseByCode(data.course_code.trim(), id);
    if (codeConflict) {
      throw new AppError('Course code already exists', 409);
    }
    updatePayload.course_code = data.course_code.trim();
  }

  // 2. If subcategory changed, verify and update category_id
  if (data.subcategory_id && Number(data.subcategory_id) !== existing.subcategory_id) {
    const subcategory = await findSubcategoryById(data.subcategory_id);
    if (!subcategory) {
      throw new AppError('Target subcategory not found', 404);
    }
    updatePayload.category_id = subcategory.category_id;
  }

  // 3. If instructor changed, verify
  if (data.instructor_id && Number(data.instructor_id) !== existing.instructor_id) {
    const instructor = await findInstructorById(data.instructor_id);
    if (!instructor) {
      throw new AppError('Target instructor not found', 404);
    }
  }

  // 4. If slug changed, verify uniqueness and record slug change history (Section 4.2 / 9.2)
  if (data.slug && data.slug.toLowerCase().trim() !== existing.slug) {
    const newSlug = data.slug.toLowerCase().trim();
    const slugConflict = await findCourseBySlugAny(newSlug, id);
    if (slugConflict) {
      throw new AppError('Course with this slug already exists', 409);
    }
    updatePayload.slug = newSlug;
    await recordSlugChange(id, existing.slug, newSlug);
  }

  // 5. Sanitize HTML description if updated
  if (data.description !== undefined) {
    updatePayload.description = sanitizeHtml(data.description);
  }

  // 6. Free price normalization
  if (data.is_free === true) {
    updatePayload.price = 0;
    updatePayload.offer_price = null;
  }

  await repoUpdateCourse(id, updatePayload);
  const updatedCourse = await findCourseByIdAdmin(id);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'course.update',
    entity_type: 'course',
    entity_id: id,
    old_value: existing,
    new_value: updatedCourse,
    ip_address: ipAddress,
  });

  return updatedCourse;
}

export async function updateCourseStatus(id, status, actorId = null, ipAddress = null) {
  const existing = await findCourseByIdAdmin(id);
  if (!existing) {
    throw new AppError('Course not found', 404);
  }

  await repoUpdateCourseStatus(id, status, actorId);
  const updatedCourse = await findCourseByIdAdmin(id);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: `course.status.${status}`,
    entity_type: 'course',
    entity_id: id,
    old_value: { status: existing.status },
    new_value: { status: updatedCourse.status, published_at: updatedCourse.published_at },
    ip_address: ipAddress,
  });

  return updatedCourse;
}

export async function duplicateCourse(id, actorId = null, ipAddress = null) {
  const existing = await findCourseByIdAdmin(id);
  if (!existing) {
    throw new AppError('Course not found to duplicate', 404);
  }

  const timestamp = Date.now().toString().slice(-6);
  const newCode = `${existing.course_code}-COPY-${timestamp}`.slice(0, 50);
  const newSlug = `${existing.slug}-copy-${timestamp}`.slice(0, 255);
  const newName = `${existing.course_name} (Copy)`;

  const duplicateData = {
    ...existing,
    course_code: newCode,
    course_name: newName,
    slug: newSlug,
    status: 'draft',
    created_by: actorId,
  };

  const newId = await repoCreateCourse(duplicateData);
  const duplicatedCourse = await findCourseByIdAdmin(newId);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'course.duplicate',
    entity_type: 'course',
    entity_id: newId,
    old_value: { source_course_id: id },
    new_value: duplicatedCourse,
    ip_address: ipAddress,
  });

  return duplicatedCourse;
}

export async function deleteCourse(id, actorId = null, ipAddress = null) {
  const existing = await findCourseByIdAdmin(id);
  if (!existing) {
    throw new AppError('Course not found', 404);
  }

  await repoSoftDeleteCourse(id, actorId);

  // Record audit log
  await createAuditLog({
    actor_id: actorId,
    action: 'course.delete',
    entity_type: 'course',
    entity_id: id,
    old_value: existing,
    ip_address: ipAddress,
  });
}

export default {
  getPublishedCourses,
  getCourseBySlug,
  getCourseReviews,
  searchCatalog,
  getCoursesAdmin,
  getCourseByIdAdmin,
  createCourse,
  updateCourse,
  updateCourseStatus,
  duplicateCourse,
  deleteCourse,
};
