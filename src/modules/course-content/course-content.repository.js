import { getPool } from '../../config/db.js';

// ==========================================
// 1. SEO & Tags
// ==========================================

export async function getCourseSeo(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      seo.id, seo.course_id, seo.seo_title, seo.seo_description, seo.focus_keyword,
      seo.canonical_url, seo.og_title, seo.og_description, seo.og_image_url,
      seo.robots_directive, seo.schema_type, seo.schema_markup,
      c.slug
    FROM courses c
    LEFT JOIN course_seo seo ON seo.course_id = c.id
    WHERE c.id = ?
  `, [courseId]);

  if (rows.length === 0) return null;
  const item = rows[0];

  const [tagRows] = await pool.query(`
    SELECT tag FROM course_tags WHERE course_id = ? ORDER BY id ASC
  `, [courseId]);

  let schemaMarkup = item.schema_markup;
  if (typeof schemaMarkup === 'string') {
    try {
      schemaMarkup = JSON.parse(schemaMarkup);
    } catch {
      // keep raw string if not valid JSON
    }
  }

  return {
    course_id: Number(courseId),
    slug: item.slug,
    seo_title: item.seo_title || null,
    seo_description: item.seo_description || null,
    focus_keyword: item.focus_keyword || null,
    seo_tags: tagRows.map(t => t.tag),
    canonical_url: item.canonical_url || null,
    og_title: item.og_title || null,
    og_description: item.og_description || null,
    og_image_url: item.og_image_url || null,
    robots_directive: item.robots_directive || 'index,follow',
    schema_type: item.schema_type || 'Course',
    schema_markup: schemaMarkup,
  };
}

export async function upsertCourseSeo(courseId, data) {
  const pool = getPool();
  const schemaMarkupStr = data.schema_markup
    ? (typeof data.schema_markup === 'object' ? JSON.stringify(data.schema_markup) : data.schema_markup)
    : null;

  await pool.query(`
    INSERT INTO course_seo (
      course_id, seo_title, seo_description, focus_keyword, canonical_url,
      og_title, og_description, og_image_url, robots_directive, schema_type, schema_markup
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      seo_title = VALUES(seo_title),
      seo_description = VALUES(seo_description),
      focus_keyword = VALUES(focus_keyword),
      canonical_url = VALUES(canonical_url),
      og_title = VALUES(og_title),
      og_description = VALUES(og_description),
      og_image_url = VALUES(og_image_url),
      robots_directive = VALUES(robots_directive),
      schema_type = VALUES(schema_type),
      schema_markup = VALUES(schema_markup),
      updated_at = NOW()
  `, [
    courseId,
    data.seo_title,
    data.seo_description,
    data.focus_keyword || null,
    data.canonical_url || null,
    data.og_title || null,
    data.og_description || null,
    data.og_image_url || null,
    data.robots_directive || 'index,follow',
    data.schema_type || 'Course',
    schemaMarkupStr,
  ]);

  if (Array.isArray(data.seo_tags)) {
    await pool.query('DELETE FROM course_tags WHERE course_id = ?', [courseId]);
    for (const tag of data.seo_tags) {
      await pool.query('INSERT INTO course_tags (course_id, tag) VALUES (?, ?)', [courseId, tag]);
    }
  }

  return getCourseSeo(courseId);
}

// ==========================================
// 2. Pricing & Installments
// ==========================================

export async function getCoursePricing(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id AS course_id, price, offer_price, currency, tax_inclusive,
      gst_percentage, is_free, refund_policy, refund_days
    FROM courses
    WHERE id = ?
  `, [courseId]);

  if (rows.length === 0) return null;
  const c = rows[0];
  const priceNum = Number(c.price);
  const offerPriceNum = c.offer_price !== null ? Number(c.offer_price) : null;
  const hasOffer = offerPriceNum !== null && offerPriceNum < priceNum;
  const discountPercentage = hasOffer ? Math.round(((priceNum - offerPriceNum) / priceNum) * 100) : 0;

  return {
    course_id: Number(c.course_id),
    price: priceNum,
    offer_price: offerPriceNum,
    discount_percentage: discountPercentage,
    currency: c.currency,
    tax_inclusive: Boolean(c.tax_inclusive),
    gst_percentage: Number(c.gst_percentage),
    is_free: Boolean(c.is_free),
    refund_policy: c.refund_policy,
    refund_days: Number(c.refund_days || 0),
  };
}

export async function updateCoursePricing(courseId, data) {
  const pool = getPool();
  const price = data.is_free ? 0 : data.price;
  const offerPrice = data.is_free ? null : (data.offer_price !== undefined ? data.offer_price : null);

  await pool.query(`
    UPDATE courses
    SET 
      price = ?,
      offer_price = ?,
      currency = ?,
      tax_inclusive = ?,
      gst_percentage = ?,
      is_free = ?,
      refund_policy = ?,
      refund_days = ?,
      updated_at = NOW()
    WHERE id = ?
  `, [
    price,
    offerPrice,
    data.currency || 'INR',
    data.tax_inclusive ? 1 : 0,
    data.gst_percentage ?? 0,
    data.is_free ? 1 : 0,
    data.refund_policy || null,
    data.refund_days ?? 0,
    courseId,
  ]);

  return getCoursePricing(courseId);
}

export async function getInstallmentPlans(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, course_id, plan_name, installment_count, installment_amount, interval_days, is_active, created_at, updated_at
    FROM course_installment_plans
    WHERE course_id = ?
    ORDER BY installment_count ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    plan_name: r.plan_name,
    installment_count: Number(r.installment_count),
    installment_amount: Number(r.installment_amount),
    interval_days: Number(r.interval_days),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getInstallmentPlanById(planId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, course_id, plan_name, installment_count, installment_amount, interval_days, is_active, created_at, updated_at
    FROM course_installment_plans
    WHERE id = ?
  `, [planId]);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    plan_name: r.plan_name,
    installment_count: Number(r.installment_count),
    installment_amount: Number(r.installment_amount),
    interval_days: Number(r.interval_days),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function createInstallmentPlan(courseId, data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO course_installment_plans (
      course_id, plan_name, installment_count, installment_amount, interval_days, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    courseId,
    data.plan_name,
    data.installment_count,
    data.installment_amount,
    data.interval_days,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
  ]);

  return getInstallmentPlanById(result.insertId);
}

export async function updateInstallmentPlan(planId, data) {
  const pool = getPool();
  const current = await getInstallmentPlanById(planId);
  if (!current) return null;

  const fields = [];
  const params = [];

  if (data.plan_name !== undefined) {
    fields.push('plan_name = ?');
    params.push(data.plan_name);
  }
  if (data.installment_count !== undefined) {
    fields.push('installment_count = ?');
    params.push(data.installment_count);
  }
  if (data.installment_amount !== undefined) {
    fields.push('installment_amount = ?');
    params.push(data.installment_amount);
  }
  if (data.interval_days !== undefined) {
    fields.push('interval_days = ?');
    params.push(data.interval_days);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    params.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) return current;

  fields.push('updated_at = NOW()');
  params.push(planId);

  await pool.query(`
    UPDATE course_installment_plans
    SET ${fields.join(', ')}
    WHERE id = ?
  `, params);

  return getInstallmentPlanById(planId);
}

export async function deleteInstallmentPlan(planId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM course_installment_plans WHERE id = ?', [planId]);
  return result.affectedRows > 0;
}

// ==========================================
// 3. Offers
// ==========================================

export async function getCourseOffers(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, offer_name, discount_type, discount_value, coupon_code,
      starts_at, ends_at, usage_limit, usage_count, per_user_limit, is_active,
      created_at, updated_at
    FROM course_offers
    WHERE course_id = ?
    ORDER BY created_at DESC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    offer_name: r.offer_name,
    discount_type: r.discount_type,
    discount_value: Number(r.discount_value),
    coupon_code: r.coupon_code,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    usage_limit: r.usage_limit !== null ? Number(r.usage_limit) : null,
    usage_count: Number(r.usage_count || 0),
    per_user_limit: Number(r.per_user_limit || 1),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getOfferById(offerId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, offer_name, discount_type, discount_value, coupon_code,
      starts_at, ends_at, usage_limit, usage_count, per_user_limit, is_active,
      created_at, updated_at
    FROM course_offers
    WHERE id = ?
  `, [offerId]);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    offer_name: r.offer_name,
    discount_type: r.discount_type,
    discount_value: Number(r.discount_value),
    coupon_code: r.coupon_code,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    usage_limit: r.usage_limit !== null ? Number(r.usage_limit) : null,
    usage_count: Number(r.usage_count || 0),
    per_user_limit: Number(r.per_user_limit || 1),
    is_active: Boolean(r.is_active),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function getOfferByCouponCode(couponCode, excludeId = null) {
  const pool = getPool();
  let query = 'SELECT id, coupon_code FROM course_offers WHERE coupon_code = ?';
  const params = [couponCode];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function createOffer(courseId, data) {
  const pool = getPool();
  const couponCode = data.coupon_code ? data.coupon_code.toUpperCase() : null;

  const [result] = await pool.query(`
    INSERT INTO course_offers (
      course_id, offer_name, discount_type, discount_value, coupon_code,
      starts_at, ends_at, usage_limit, usage_count, per_user_limit, is_active
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `, [
    courseId,
    data.offer_name,
    data.discount_type,
    data.discount_value,
    couponCode,
    data.starts_at,
    data.ends_at,
    data.usage_limit || null,
    data.per_user_limit || 1,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
  ]);

  return getOfferById(result.insertId);
}

export async function updateOffer(offerId, data) {
  const pool = getPool();
  const current = await getOfferById(offerId);
  if (!current) return null;

  const fields = [];
  const params = [];

  if (data.offer_name !== undefined) {
    fields.push('offer_name = ?');
    params.push(data.offer_name);
  }
  if (data.discount_type !== undefined) {
    fields.push('discount_type = ?');
    params.push(data.discount_type);
  }
  if (data.discount_value !== undefined) {
    fields.push('discount_value = ?');
    params.push(data.discount_value);
  }
  if (data.coupon_code !== undefined) {
    fields.push('coupon_code = ?');
    params.push(data.coupon_code ? data.coupon_code.toUpperCase() : null);
  }
  if (data.starts_at !== undefined) {
    fields.push('starts_at = ?');
    params.push(data.starts_at);
  }
  if (data.ends_at !== undefined) {
    fields.push('ends_at = ?');
    params.push(data.ends_at);
  }
  if (data.usage_limit !== undefined) {
    fields.push('usage_limit = ?');
    params.push(data.usage_limit);
  }
  if (data.per_user_limit !== undefined) {
    fields.push('per_user_limit = ?');
    params.push(data.per_user_limit);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    params.push(data.is_active ? 1 : 0);
  }

  if (fields.length === 0) return current;

  fields.push('updated_at = NOW()');
  params.push(offerId);

  await pool.query(`
    UPDATE course_offers
    SET ${fields.join(', ')}
    WHERE id = ?
  `, params);

  return getOfferById(offerId);
}

export async function deleteOffer(offerId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM course_offers WHERE id = ?', [offerId]);
  return result.affectedRows > 0;
}

// ==========================================
// 4. FAQs
// ==========================================

export async function getCourseFaqs(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, question, answer, display_order
    FROM course_faqs
    WHERE course_id = ?
    ORDER BY display_order ASC, id ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    question: r.question,
    answer: r.answer,
    display_order: Number(r.display_order || 0),
  }));
}

export async function replaceCourseFaqs(courseId, faqs) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM course_faqs WHERE course_id = ?', [courseId]);

    for (const faq of faqs) {
      await conn.query(`
        INSERT INTO course_faqs (course_id, question, answer, display_order)
        VALUES (?, ?, ?, ?)
      `, [courseId, faq.question, faq.answer, faq.display_order || 0]);
    }

    await conn.commit();
    return getCourseFaqs(courseId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ==========================================
// 5. Testimonials
// ==========================================

export async function getCourseTestimonials(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, name, text, video_url, photo_url, is_active
    FROM course_testimonials
    WHERE course_id = ?
    ORDER BY id ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    name: r.name,
    text: r.text,
    video_url: r.video_url,
    photo_url: r.photo_url,
    is_active: Boolean(r.is_active),
  }));
}

export async function replaceCourseTestimonials(courseId, testimonials) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM course_testimonials WHERE course_id = ?', [courseId]);

    for (const item of testimonials) {
      await conn.query(`
        INSERT INTO course_testimonials (course_id, name, text, video_url, photo_url, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        courseId,
        item.name,
        item.text,
        item.video_url || null,
        item.photo_url || null,
        item.is_active !== undefined ? (item.is_active ? 1 : 0) : 1,
      ]);
    }

    await conn.commit();
    return getCourseTestimonials(courseId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// ==========================================
// 6. Benefits
// ==========================================

export async function getCourseBenefits(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, certificate_enabled, certificate_type, career_support_enabled,
      mock_interviews, resume_support, placement_assistance, internship_support,
      project_count, lifetime_access, access_duration_days
    FROM course_benefits
    WHERE course_id = ?
  `, [courseId]);

  if (rows.length === 0) {
    return {
      course_id: Number(courseId),
      certificate_enabled: false,
      certificate_type: null,
      career_support_enabled: false,
      mock_interviews: false,
      resume_support: false,
      placement_assistance: false,
      internship_support: false,
      project_count: 0,
      lifetime_access: false,
      access_duration_days: 0,
    };
  }

  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    certificate_enabled: Boolean(r.certificate_enabled),
    certificate_type: r.certificate_type,
    career_support_enabled: Boolean(r.career_support_enabled),
    mock_interviews: Boolean(r.mock_interviews),
    resume_support: Boolean(r.resume_support),
    placement_assistance: Boolean(r.placement_assistance),
    internship_support: Boolean(r.internship_support),
    project_count: Number(r.project_count || 0),
    lifetime_access: Boolean(r.lifetime_access),
    access_duration_days: Number(r.access_duration_days || 0),
  };
}

export async function upsertCourseBenefits(courseId, data) {
  const pool = getPool();
  await pool.query(`
    INSERT INTO course_benefits (
      course_id, certificate_enabled, certificate_type, career_support_enabled,
      mock_interviews, resume_support, placement_assistance, internship_support,
      project_count, lifetime_access, access_duration_days
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      certificate_enabled = VALUES(certificate_enabled),
      certificate_type = VALUES(certificate_type),
      career_support_enabled = VALUES(career_support_enabled),
      mock_interviews = VALUES(mock_interviews),
      resume_support = VALUES(resume_support),
      placement_assistance = VALUES(placement_assistance),
      internship_support = VALUES(internship_support),
      project_count = VALUES(project_count),
      lifetime_access = VALUES(lifetime_access),
      access_duration_days = VALUES(access_duration_days),
      updated_at = NOW()
  `, [
    courseId,
    data.certificate_enabled ? 1 : 0,
    data.certificate_type || null,
    data.career_support_enabled ? 1 : 0,
    data.mock_interviews ? 1 : 0,
    data.resume_support ? 1 : 0,
    data.placement_assistance ? 1 : 0,
    data.internship_support ? 1 : 0,
    data.project_count ?? 0,
    data.lifetime_access ? 1 : 0,
    data.access_duration_days ?? 0,
  ]);

  return getCourseBenefits(courseId);
}

// ==========================================
// 7. Enrollment Settings
// ==========================================

export async function getCourseEnrollmentSettings(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, course_id, enrollment_limit, enrollment_start_at, enrollment_end_at, drip_content_enabled
    FROM course_enrollment_settings
    WHERE course_id = ?
  `, [courseId]);

  if (rows.length === 0) {
    return {
      course_id: Number(courseId),
      enrollment_limit: null,
      enrollment_start_at: null,
      enrollment_end_at: null,
      drip_content_enabled: false,
    };
  }

  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    enrollment_limit: r.enrollment_limit !== null ? Number(r.enrollment_limit) : null,
    enrollment_start_at: r.enrollment_start_at,
    enrollment_end_at: r.enrollment_end_at,
    drip_content_enabled: Boolean(r.drip_content_enabled),
  };
}

export async function upsertCourseEnrollmentSettings(courseId, data) {
  const pool = getPool();
  await pool.query(`
    INSERT INTO course_enrollment_settings (
      course_id, enrollment_limit, enrollment_start_at, enrollment_end_at, drip_content_enabled
    )
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      enrollment_limit = VALUES(enrollment_limit),
      enrollment_start_at = VALUES(enrollment_start_at),
      enrollment_end_at = VALUES(enrollment_end_at),
      drip_content_enabled = VALUES(drip_content_enabled),
      updated_at = NOW()
  `, [
    courseId,
    data.enrollment_limit || null,
    data.enrollment_start_at || null,
    data.enrollment_end_at || null,
    data.drip_content_enabled ? 1 : 0,
  ]);

  return getCourseEnrollmentSettings(courseId);
}

// ==========================================
// 8. Points (Learn, Tool, Prerequisite, Required Skill)
// ==========================================

export async function getCoursePoints(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, point_type, text, display_order
    FROM course_points
    WHERE course_id = ?
    ORDER BY display_order ASC, id ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    point_type: r.point_type,
    text: r.text,
    display_order: Number(r.display_order || 0),
  }));
}

export async function replaceCoursePoints(courseId, points) {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM course_points WHERE course_id = ?', [courseId]);

    for (const p of points) {
      await conn.query(`
        INSERT INTO course_points (course_id, point_type, text, display_order)
        VALUES (?, ?, ?, ?)
      `, [courseId, p.point_type, p.text, p.display_order || 0]);
    }

    await conn.commit();
    return getCoursePoints(courseId);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
