import * as contentRepo from './course-content.repository.js';
import * as courseRepo from '../courses/course.repository.js';
import { getPool } from '../../config/db.js';
import { recordAuditLog } from '../../utils/auditLogger.js';

async function ensureCourseExists(courseId) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }
  return course;
}

// ==========================================
// 1. SEO
// ==========================================

export async function getCourseSeo(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseSeo(courseId);
}

export async function updateCourseSeo(courseId, data, actorId, ipAddress) {
  const course = await ensureCourseExists(courseId);
  const oldSeo = await contentRepo.getCourseSeo(courseId);

  // If slug is provided and changed
  if (data.slug && data.slug !== course.slug) {
    const pool = getPool();
    const [conflictRows] = await pool.query(
      'SELECT id FROM courses WHERE slug = ? AND id != ? AND deleted_at IS NULL',
      [data.slug, courseId]
    );

    if (conflictRows.length > 0) {
      const error = new Error('Slug already in use by another course');
      error.statusCode = 409;
      throw error;
    }

    // Record slug history
    await pool.query(
      'INSERT INTO course_slug_history (course_id, old_slug, new_slug) VALUES (?, ?, ?)',
      [courseId, course.slug, data.slug]
    );

    // Update course slug
    await pool.query(
      'UPDATE courses SET slug = ?, updated_at = NOW() WHERE id = ?',
      [data.slug, courseId]
    );
  }

  const updatedSeo = await contentRepo.upsertCourseSeo(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_COURSE_SEO',
    entity_type: 'course_seo',
    entity_id: courseId,
    old_value: oldSeo,
    new_value: updatedSeo,
    ip_address: ipAddress,
  });

  return updatedSeo;
}

// ==========================================
// 2. Pricing & Installments
// ==========================================

export async function getCoursePricing(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCoursePricing(courseId);
}

export async function updateCoursePricing(courseId, data, actorId, ipAddress) {
  const oldPricing = await contentRepo.getCoursePricing(courseId);
  if (!oldPricing) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = await contentRepo.updateCoursePricing(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_COURSE_PRICING',
    entity_type: 'course_pricing',
    entity_id: courseId,
    old_value: oldPricing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return {
    course_id: updated.course_id,
    price: updated.price,
    offer_price: updated.offer_price,
    discount_percentage: updated.discount_percentage,
    currency: updated.currency,
  };
}

export async function getInstallmentPlans(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getInstallmentPlans(courseId);
}

export async function createInstallmentPlan(courseId, data, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const plan = await contentRepo.createInstallmentPlan(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'CREATE_INSTALLMENT_PLAN',
    entity_type: 'course_installment_plan',
    entity_id: plan.id,
    new_value: plan,
    ip_address: ipAddress,
  });

  return plan;
}

export async function updateInstallmentPlan(planId, data, actorId, ipAddress) {
  const existing = await contentRepo.getInstallmentPlanById(planId);
  if (!existing) {
    const error = new Error('Installment plan not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = await contentRepo.updateInstallmentPlan(planId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_INSTALLMENT_PLAN',
    entity_type: 'course_installment_plan',
    entity_id: planId,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteInstallmentPlan(planId, actorId, ipAddress) {
  const existing = await contentRepo.getInstallmentPlanById(planId);
  if (!existing) {
    const error = new Error('Installment plan not found');
    error.statusCode = 404;
    throw error;
  }

  await contentRepo.deleteInstallmentPlan(planId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'DELETE_INSTALLMENT_PLAN',
    entity_type: 'course_installment_plan',
    entity_id: planId,
    old_value: existing,
    ip_address: ipAddress,
  });

  return { id: planId, deleted: true };
}

// ==========================================
// 3. Offers
// ==========================================

export async function getCourseOffers(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseOffers(courseId);
}

export async function createOffer(courseId, data, actorId, ipAddress) {
  await ensureCourseExists(courseId);

  if (data.coupon_code) {
    const existingCoupon = await contentRepo.getOfferByCouponCode(data.coupon_code.toUpperCase());
    if (existingCoupon) {
      const error = new Error('Coupon code already in use');
      error.statusCode = 409;
      throw error;
    }
  }

  const offer = await contentRepo.createOffer(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'CREATE_COURSE_OFFER',
    entity_type: 'course_offer',
    entity_id: offer.id,
    new_value: offer,
    ip_address: ipAddress,
  });

  return offer;
}

export async function updateOffer(offerId, data, actorId, ipAddress) {
  const existing = await contentRepo.getOfferById(offerId);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  if (data.coupon_code) {
    const existingCoupon = await contentRepo.getOfferByCouponCode(data.coupon_code.toUpperCase(), offerId);
    if (existingCoupon) {
      const error = new Error('Coupon code already in use');
      error.statusCode = 409;
      throw error;
    }
  }

  const updated = await contentRepo.updateOffer(offerId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_COURSE_OFFER',
    entity_type: 'course_offer',
    entity_id: offerId,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteOffer(offerId, actorId, ipAddress) {
  const existing = await contentRepo.getOfferById(offerId);
  if (!existing) {
    const error = new Error('Offer not found');
    error.statusCode = 404;
    throw error;
  }

  await contentRepo.deleteOffer(offerId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'DELETE_COURSE_OFFER',
    entity_type: 'course_offer',
    entity_id: offerId,
    old_value: existing,
    ip_address: ipAddress,
  });

  return { id: offerId, deleted: true };
}

// ==========================================
// 4. FAQs
// ==========================================

export async function getCourseFaqs(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseFaqs(courseId);
}

export async function replaceCourseFaqs(courseId, faqs, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const oldFaqs = await contentRepo.getCourseFaqs(courseId);
  const updated = await contentRepo.replaceCourseFaqs(courseId, faqs);

  await recordAuditLog({
    actor_id: actorId,
    action: 'REPLACE_COURSE_FAQS',
    entity_type: 'course_faqs',
    entity_id: courseId,
    old_value: oldFaqs,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

// ==========================================
// 5. Testimonials
// ==========================================

export async function getCourseTestimonials(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseTestimonials(courseId);
}

export async function replaceCourseTestimonials(courseId, testimonials, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const oldTestimonials = await contentRepo.getCourseTestimonials(courseId);
  const updated = await contentRepo.replaceCourseTestimonials(courseId, testimonials);

  await recordAuditLog({
    actor_id: actorId,
    action: 'REPLACE_COURSE_TESTIMONIALS',
    entity_type: 'course_testimonials',
    entity_id: courseId,
    old_value: oldTestimonials,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

// ==========================================
// 6. Benefits
// ==========================================

export async function getCourseBenefits(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseBenefits(courseId);
}

export async function updateCourseBenefits(courseId, data, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const oldBenefits = await contentRepo.getCourseBenefits(courseId);
  const updated = await contentRepo.upsertCourseBenefits(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_COURSE_BENEFITS',
    entity_type: 'course_benefits',
    entity_id: courseId,
    old_value: oldBenefits,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

// ==========================================
// 7. Enrollment Settings
// ==========================================

export async function getCourseEnrollmentSettings(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCourseEnrollmentSettings(courseId);
}

export async function updateCourseEnrollmentSettings(courseId, data, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const oldSettings = await contentRepo.getCourseEnrollmentSettings(courseId);
  const updated = await contentRepo.upsertCourseEnrollmentSettings(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_COURSE_ENROLLMENT_SETTINGS',
    entity_type: 'course_enrollment_settings',
    entity_id: courseId,
    old_value: oldSettings,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

// ==========================================
// 8. Points
// ==========================================

export async function getCoursePoints(courseId) {
  await ensureCourseExists(courseId);
  return contentRepo.getCoursePoints(courseId);
}

export async function replaceCoursePoints(courseId, points, actorId, ipAddress) {
  await ensureCourseExists(courseId);
  const oldPoints = await contentRepo.getCoursePoints(courseId);
  const updated = await contentRepo.replaceCoursePoints(courseId, points);

  await recordAuditLog({
    actor_id: actorId,
    action: 'REPLACE_COURSE_POINTS',
    entity_type: 'course_points',
    entity_id: courseId,
    old_value: oldPoints,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}
