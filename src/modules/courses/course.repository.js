import { getPool } from '../../config/db.js';

export async function findPublishedCourses(filters = {}, userId = null) {
  const pool = getPool();

  const conditions = [
    "co.status = 'published'",
    'co.deleted_at IS NULL',
    "c.status = 'active'",
    'c.deleted_at IS NULL',
    "sc.status = 'active'",
    'sc.deleted_at IS NULL',
  ];
  const params = [];

  if (filters.category) {
    conditions.push('c.slug = ?');
    params.push(filters.category);
  }

  if (filters.subcategory) {
    conditions.push('sc.slug = ?');
    params.push(filters.subcategory);
  }

  if (filters.level && filters.level !== 'all') {
    conditions.push('co.course_level = ?');
    params.push(filters.level);
  }

  if (filters.language && filters.language !== 'all') {
    conditions.push('co.language = ?');
    params.push(filters.language);
  }

  if (filters.mode && filters.mode !== 'all') {
    conditions.push('co.mode = ?');
    params.push(filters.mode);
  }

  if (filters.min_price !== undefined && !isNaN(filters.min_price)) {
    conditions.push('COALESCE(co.offer_price, co.price) >= ?');
    params.push(Number(filters.min_price));
  }

  if (filters.max_price !== undefined && !isNaN(filters.max_price)) {
    conditions.push('COALESCE(co.offer_price, co.price) <= ?');
    params.push(Number(filters.max_price));
  }

  if (filters.has_offer === true || filters.has_offer === 'true') {
    conditions.push('co.offer_price IS NOT NULL AND co.offer_price < co.price');
  }

  if (filters.is_featured === true || filters.is_featured === 'true') {
    conditions.push('co.is_featured = TRUE');
  }

  if (filters.instructor_id) {
    conditions.push('co.instructor_id = ?');
    params.push(Number(filters.instructor_id));
  }

  if (filters.rating_min !== undefined && !isNaN(filters.rating_min)) {
    conditions.push('co.rating_avg >= ?');
    params.push(Number(filters.rating_min));
  }

  if (filters.search) {
    conditions.push('(co.course_name LIKE ? OR co.short_description LIKE ? OR co.slug LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  let orderBy = 'ORDER BY co.published_at DESC';
  if (filters.sort === 'popular') orderBy = 'ORDER BY co.total_views DESC, co.enrollment_count DESC';
  if (filters.sort === 'price_asc') orderBy = 'ORDER BY COALESCE(co.offer_price, co.price) ASC';
  if (filters.sort === 'price_desc') orderBy = 'ORDER BY COALESCE(co.offer_price, co.price) DESC';
  if (filters.sort === 'rating') orderBy = 'ORDER BY co.rating_avg DESC, co.rating_count DESC';
  if (filters.sort === 'name') orderBy = 'ORDER BY co.course_name ASC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total 
     FROM courses co
     JOIN categories c ON c.id = co.category_id
     JOIN subcategories sc ON sc.id = co.subcategory_id
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const limit = filters.limit ? Math.min(Math.max(Number(filters.limit), 1), 100) : 12;
  const page = filters.page ? Math.max(Number(filters.page), 1) : 1;
  const offset = (page - 1) * limit;

  const [courseRows] = await pool.query(`
    SELECT 
      co.id, co.course_name, co.slug, co.short_description, co.thumbnail_url, co.alt_text,
      co.course_level, co.language, co.mode, co.duration_hours, co.total_lessons,
      co.price, co.offer_price, co.currency, co.is_featured, co.is_new, co.is_trending,
      co.rating_avg, co.rating_count, co.total_views, co.enrollment_count,
      c.name AS category_name, c.slug AS category_slug,
      sc.name AS subcategory_name, sc.slug AS subcategory_slug,
      ins.id AS instructor_id, ins.name AS instructor_name, ins.photo_url AS instructor_photo_url,
      cds.demo_enabled,
      (SELECT MIN(cb.start_date) FROM course_batches cb WHERE cb.course_id = co.id AND cb.start_date >= CURDATE() AND cb.status = 'open') AS next_batch_start,
      (SELECT SUM(cb.seats_available) FROM course_batches cb WHERE cb.course_id = co.id AND cb.start_date >= CURDATE() AND cb.status = 'open') AS total_seats_available,
      ${userId ? `EXISTS(SELECT 1 FROM wishlists w WHERE w.course_id = co.id AND w.user_id = ${Number(userId)})` : '0'} AS is_wishlisted,
      ${userId ? `EXISTS(SELECT 1 FROM course_enrollments ce WHERE ce.course_id = co.id AND ce.user_id = ${Number(userId)} AND ce.enrollment_status = 'active')` : '0'} AS is_enrolled
    FROM courses co
    JOIN categories c ON c.id = co.category_id
    JOIN subcategories sc ON sc.id = co.subcategory_id
    LEFT JOIN instructors ins ON ins.id = co.instructor_id
    LEFT JOIN course_demo_settings cds ON cds.course_id = co.id
    WHERE ${whereClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const courses = courseRows.map(c => {
    const priceNum = Number(c.price);
    const offerPriceNum = c.offer_price !== null ? Number(c.offer_price) : null;
    const hasOffer = offerPriceNum !== null && offerPriceNum < priceNum;
    const discountPercentage = hasOffer ? Math.round(((priceNum - offerPriceNum) / priceNum) * 100) : 0;

    return {
      id: Number(c.id),
      course_name: c.course_name,
      slug: c.slug,
      url: `/courses/${c.category_slug}/${c.subcategory_slug}/${c.slug}`,
      short_description: c.short_description,
      thumbnail_url: c.thumbnail_url,
      alt_text: c.alt_text,
      course_level: c.course_level,
      language: c.language,
      mode: c.mode,
      duration_hours: Number(c.duration_hours),
      total_lessons: Number(c.total_lessons),
      instructor: c.instructor_id ? {
        id: Number(c.instructor_id),
        name: c.instructor_name,
        photo_url: c.instructor_photo_url,
      } : null,
      pricing: {
        price: priceNum,
        offer_price: offerPriceNum,
        discount_percentage: discountPercentage,
        offer_active: hasOffer,
      },
      rating: {
        average: Number(c.rating_avg || 0),
        count: Number(c.rating_count || 0),
      },
      badges: {
        is_featured: Boolean(c.is_featured),
        is_new: Boolean(c.is_new),
        is_trending: Boolean(c.is_trending),
      },
      demo_enabled: Boolean(c.demo_enabled),
      seats_available: Number(c.total_seats_available || 0),
      next_batch_start: c.next_batch_start || null,
      stats: {
        total_views: Number(c.total_views || 0),
        enrollment_count: Number(c.enrollment_count || 0),
      },
      user_state: {
        wishlisted: Boolean(c.is_wishlisted),
        enrolled: Boolean(c.is_enrolled),
      },
    };
  });

  return {
    courses,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function findCourseBySlug(slug, userId = null) {
  const pool = getPool();

  // 1. Check if slug was modified and exists in slug history (301 redirect check)
  const [historyRows] = await pool.query(`
    SELECT c.slug AS current_slug
    FROM course_slug_history csh
    JOIN courses c ON c.id = csh.course_id
    WHERE (csh.old_slug = ? OR csh.old_slug = ?)
      AND c.deleted_at IS NULL AND c.status = 'published'
    LIMIT 1
  `, [slug, `/courses/${slug}`]);

  if (historyRows.length > 0) {
    return {
      redirected: true,
      newSlug: historyRows[0].current_slug,
    };
  }

  // 2. Fetch main course record with category, subcategory, instructor, seo, demo, eligibility, benefits, enrollment_settings
  const [rows] = await pool.query(`
    SELECT 
      co.id, co.course_code, co.course_name, co.slug, co.short_description, co.description,
      co.category_id, co.subcategory_id, co.instructor_id,
      co.course_level, co.language, co.mode, co.duration_hours, co.duration_days,
      co.total_modules, co.total_lessons, co.thumbnail_url, co.banner_url,
      co.intro_video_url, co.demo_video_url, co.alt_text, co.brochure_url, co.syllabus_url,
      co.gallery_images, co.price, co.offer_price, co.currency, co.tax_inclusive,
      co.gst_percentage, co.is_free, co.refund_policy, co.refund_days,
      co.is_featured, co.is_new, co.is_trending, co.display_order, co.status,
      co.total_views, co.unique_visitors, co.enquiry_count, co.demo_request_count,
      co.wishlist_count, co.share_count, co.enrollment_count, co.rating_avg, co.rating_count,
      co.published_at, co.created_at, co.updated_at,
      c.id AS cat_id, c.name AS cat_name, c.slug AS cat_slug, c.status AS cat_status,
      sc.id AS sub_id, sc.name AS sub_name, sc.slug AS sub_slug, sc.status AS sub_status,
      ins.id AS ins_id, ins.name AS ins_name, ins.designation AS ins_designation,
      ins.experience_years AS ins_experience_years, ins.bio AS ins_bio, ins.photo_url AS ins_photo_url,
      seo.seo_title, seo.seo_description, seo.focus_keyword, seo.canonical_url,
      seo.og_title, seo.og_description, seo.og_image_url, seo.robots_directive,
      seo.schema_type, seo.schema_markup,
      cds.demo_enabled, cds.demo_request_enabled, cds.demo_type, cds.demo_duration_minutes,
      cds.demo_schedule, cds.time_slots, cds.accepting_requests, cds.request_start_at,
      cds.request_end_at, cds.max_requests_per_slot, cds.allowed_demo_types, cds.meeting_platform,
      cds.requires_approval, cds.form_title, cds.submit_button_text, cds.success_message,
      cds.form_fields, cds.custom_questions AS demo_custom_questions, cds.honeypot_enabled,
      cer.eligibility_enabled, cer.minimum_qualification, cer.minimum_percentage,
      cer.eligible_streams, cer.minimum_age, cer.maximum_age, cer.required_skills,
      cer.experience_required, cer.custom_questions AS eligibility_custom_questions, cer.disclaimer,
      cb.certificate_enabled, cb.certificate_type, cb.career_support_enabled, cb.mock_interviews,
      cb.resume_support, cb.placement_assistance, cb.internship_support, cb.project_count,
      cb.lifetime_access, cb.access_duration_days,
      ces.enrollment_limit, ces.enrollment_start_at, ces.enrollment_end_at, ces.drip_content_enabled,
      ${userId ? `EXISTS(SELECT 1 FROM wishlists w WHERE w.course_id = co.id AND w.user_id = ${Number(userId)})` : '0'} AS is_wishlisted,
      ${userId ? `EXISTS(SELECT 1 FROM course_enrollments ce WHERE ce.course_id = co.id AND ce.user_id = ${Number(userId)} AND ce.enrollment_status = 'active')` : '0'} AS is_enrolled,
      ${userId ? `EXISTS(SELECT 1 FROM demo_requests dr WHERE dr.course_id = co.id AND dr.user_id = ${Number(userId)} AND dr.deleted_at IS NULL)` : '0'} AS has_demo_request
    FROM courses co
    JOIN categories c ON c.id = co.category_id
    JOIN subcategories sc ON sc.id = co.subcategory_id
    LEFT JOIN instructors ins ON ins.id = co.instructor_id
    LEFT JOIN course_seo seo ON seo.course_id = co.id
    LEFT JOIN course_demo_settings cds ON cds.course_id = co.id
    LEFT JOIN course_eligibility_rules cer ON cer.course_id = co.id
    LEFT JOIN course_benefits cb ON cb.course_id = co.id
    LEFT JOIN course_enrollment_settings ces ON ces.course_id = co.id
    WHERE co.slug = ?
      AND co.status = 'published' AND co.deleted_at IS NULL
      AND c.status = 'active' AND c.deleted_at IS NULL
      AND sc.status = 'active' AND sc.deleted_at IS NULL
  `, [slug]);

  if (rows.length === 0) {
    return null;
  }

  const course = rows[0];
  const courseId = course.id;

  // 3. Fetch tags
  const [tagsRows] = await pool.query(
    'SELECT tag FROM course_tags WHERE course_id = ?',
    [courseId]
  );
  const tags = tagsRows.map(t => t.tag);

  // 4. Fetch learning points
  const [pointsRows] = await pool.query(
    'SELECT point_type, text FROM course_points WHERE course_id = ? ORDER BY display_order ASC, id ASC',
    [courseId]
  );
  const whatYouWillLearn = pointsRows.filter(p => p.point_type === 'learn').map(p => p.text);
  const toolsCovered = pointsRows.filter(p => p.point_type === 'tool').map(p => p.text);
  const prerequisites = pointsRows.filter(p => p.point_type === 'prerequisite').map(p => p.text);

  // 5. Fetch FAQs
  const [faqsRows] = await pool.query(
    'SELECT id, question, answer, display_order FROM course_faqs WHERE course_id = ? ORDER BY display_order ASC',
    [courseId]
  );

  // 6. Fetch testimonials
  const [testimonialsRows] = await pool.query(
    'SELECT id, name, text, video_url, photo_url FROM course_testimonials WHERE course_id = ? AND is_active = TRUE',
    [courseId]
  );

  // 7. Fetch curriculum (modules and lessons)
  const [modulesRows] = await pool.query(
    'SELECT id, title, description, display_order FROM course_modules WHERE course_id = ? AND is_published = TRUE ORDER BY display_order ASC',
    [courseId]
  );

  let curriculum = [];
  if (modulesRows.length > 0) {
    const modIds = modulesRows.map(m => m.id);
    const modPlaceholders = modIds.map(() => '?').join(',');
    const isEnrolled = Boolean(course.is_enrolled);
    const [lessonsRows] = await pool.query(`
      SELECT id, module_id, title, description, lesson_type, content_url, duration_seconds, is_preview, display_order
      FROM course_lessons
      WHERE module_id IN (${modPlaceholders}) AND is_published = TRUE
      ORDER BY display_order ASC
    `, modIds);

    const lessonsMap = new Map();
    for (const l of lessonsRows) {
      if (!lessonsMap.has(l.module_id)) lessonsMap.set(l.module_id, []);
      const isPreview = Boolean(l.is_preview);
      lessonsMap.get(l.module_id).push({
        lesson_id: Number(l.id),
        title: l.title,
        lesson_type: l.lesson_type,
        duration_seconds: Number(l.duration_seconds || 0),
        is_preview: isPreview,
        content_url: (isPreview || isEnrolled) ? l.content_url : null,
      });
    }

    curriculum = modulesRows.map(m => ({
      module_id: Number(m.id),
      title: m.title,
      display_order: Number(m.display_order),
      lessons: lessonsMap.get(m.id) || [],
    }));
  }

  // 8. Fetch upcoming batches
  const [batchesRows] = await pool.query(`
    SELECT id, batch_name, start_date, class_days, class_timing, seats_available
    FROM course_batches
    WHERE course_id = ? AND start_date >= CURDATE() AND status = 'open'
    ORDER BY start_date ASC
  `, [courseId]);

  // 9. Fetch active offers & installment plans
  const [offerRows] = await pool.query(`
    SELECT id, offer_name, discount_type, discount_value, coupon_code, starts_at, ends_at, is_active
    FROM course_offers
    WHERE course_id = ? AND is_active = 1
      AND starts_at <= NOW() AND ends_at >= NOW()
      AND (usage_limit IS NULL OR usage_count < usage_limit)
    ORDER BY discount_value DESC
    LIMIT 1
  `, [courseId]);
  const activeOffer = offerRows.length > 0 ? offerRows[0] : null;

  const [installmentRows] = await pool.query(`
    SELECT id, plan_name, installment_count, installment_amount, interval_days
    FROM course_installment_plans
    WHERE course_id = ? AND is_active = 1
    ORDER BY installment_count ASC
  `, [courseId]);

  // 10. Pricing calculations
  const priceNum = Number(course.price);
  let finalOfferPrice = course.offer_price !== null ? Number(course.offer_price) : null;

  if (activeOffer) {
    if (activeOffer.discount_type === 'percentage') {
      finalOfferPrice = Math.max(0, Number((priceNum - (priceNum * Number(activeOffer.discount_value) / 100)).toFixed(2)));
    } else if (activeOffer.discount_type === 'fixed') {
      finalOfferPrice = Math.max(0, Number((priceNum - Number(activeOffer.discount_value)).toFixed(2)));
    }
  }

  const hasOffer = finalOfferPrice !== null && finalOfferPrice < priceNum;
  const discountPercentage = hasOffer ? Math.round(((priceNum - finalOfferPrice) / priceNum) * 100) : 0;

  // Format full response adhering to Section 9.2
  return {
    basic: {
      id: Number(course.id),
      course_code: course.course_code,
      course_name: course.course_name,
      slug: course.slug,
      short_description: course.short_description,
      description: course.description,
      category: {
        id: Number(course.cat_id),
        name: course.cat_name,
        slug: course.cat_slug,
      },
      subcategory: {
        id: Number(course.sub_id),
        name: course.sub_name,
        slug: course.sub_slug,
      },
      tags,
      course_level: course.course_level,
      language: course.language,
      mode: course.mode,
      duration_hours: Number(course.duration_hours),
      duration_days: course.duration_days ? Number(course.duration_days) : null,
      total_modules: Number(course.total_modules),
      total_lessons: Number(course.total_lessons),
      status: course.status,
      badges: {
        is_featured: Boolean(course.is_featured),
        is_new: Boolean(course.is_new),
        is_trending: Boolean(course.is_trending),
      },
    },
    url: `/courses/${course.cat_slug}/${course.sub_slug}/${course.slug}`,
    breadcrumbs: [
      { label: 'Home', url: '/' },
      { label: course.cat_name, url: `/courses/${course.cat_slug}` },
      { label: course.sub_name, url: `/courses/${course.cat_slug}/${course.sub_slug}` },
      { label: course.course_name, url: `/courses/${course.cat_slug}/${course.sub_slug}/${course.slug}` },
    ],
    media: {
      thumbnail_url: course.thumbnail_url,
      banner_url: course.banner_url,
      gallery_images: typeof course.gallery_images === 'string' ? JSON.parse(course.gallery_images) : (course.gallery_images || []),
      intro_video_url: course.intro_video_url,
      demo_video_url: course.demo_video_url,
      alt_text: course.alt_text,
    },
    instructor: course.ins_id ? {
      id: Number(course.ins_id),
      name: course.ins_name,
      designation: course.ins_designation,
      experience_years: course.ins_experience_years !== null ? Number(course.ins_experience_years) : null,
      bio: course.ins_bio,
      photo_url: course.ins_photo_url,
    } : null,
    pricing: {
      price: priceNum,
      offer_price: finalOfferPrice,
      discount_percentage: discountPercentage,
      currency: course.currency,
      tax_inclusive: Boolean(course.tax_inclusive),
      gst_percentage: Number(course.gst_percentage),
      is_free: Boolean(course.is_free),
      offer: activeOffer ? {
        offer_name: activeOffer.offer_name,
        discount_type: activeOffer.discount_type,
        discount_value: Number(activeOffer.discount_value),
        coupon_code: activeOffer.coupon_code,
        starts_at: activeOffer.starts_at,
        ends_at: activeOffer.ends_at,
        is_active: Boolean(activeOffer.is_active),
      } : null,
      installment: {
        enabled: installmentRows.length > 0,
        plans: installmentRows.map(p => ({
          plan_name: p.plan_name,
          installment_count: Number(p.installment_count),
          installment_amount: Number(p.installment_amount),
          interval_days: Number(p.interval_days),
        })),
      },
      refund_policy: course.refund_policy,
      refund_days: Number(course.refund_days || 0),
    },
    demo: {
      demo_enabled: Boolean(course.demo_enabled),
      demo_request_enabled: Boolean(course.demo_request_enabled),
      demo_type: course.demo_type || 'live_interactive',
      demo_duration_minutes: Number(course.demo_duration_minutes || 45),
      booking: {
        accepting_requests: Boolean(course.accepting_requests ?? true),
        meeting_platform: course.meeting_platform || 'Google Meet',
        requires_approval: Boolean(course.requires_approval),
      },
      stats: {
        demo_request_count: Number(course.demo_request_count || 0),
      },
    },
    eligibility: {
      eligibility_enabled: Boolean(course.eligibility_enabled),
      minimum_qualification: course.minimum_qualification,
      minimum_percentage: course.minimum_percentage !== null ? Number(course.minimum_percentage) : null,
      experience_required: Boolean(course.experience_required),
      disclaimer: course.disclaimer,
    },
    files: {
      brochure_url: course.brochure_url,
      syllabus_url: course.syllabus_url,
    },
    curriculum,
    learning: {
      what_you_will_learn: whatYouWillLearn,
      tools_covered: toolsCovered,
      prerequisites,
    },
    enrollment: {
      enrollment_limit: course.enrollment_limit ? Number(course.enrollment_limit) : null,
      access_duration_days: course.access_duration_days ? Number(course.access_duration_days) : null,
      lifetime_access: Boolean(course.lifetime_access),
    },
    batches: batchesRows.map(b => ({
      batch_id: Number(b.id),
      batch_name: b.batch_name,
      start_date: b.start_date,
      class_days: b.class_days,
      class_timing: b.class_timing,
      seats_available: Number(b.seats_available),
    })),
    benefits: {
      certificate_enabled: Boolean(course.certificate_enabled),
      certificate_type: course.certificate_type,
      career_support_enabled: Boolean(course.career_support_enabled),
      mock_interviews: Boolean(course.mock_interviews),
      resume_support: Boolean(course.resume_support),
      placement_assistance: Boolean(course.placement_assistance),
      internship_support: Boolean(course.internship_support),
      project_count: Number(course.project_count || 0),
    },
    social_proof: {
      reviews_summary: {
        average_rating: Number(course.rating_avg || 0),
        review_count: Number(course.rating_count || 0),
      },
      faqs: faqsRows.map(f => ({
        id: Number(f.id),
        question: f.question,
        answer: f.answer,
      })),
      testimonials: testimonialsRows.map(t => ({
        id: Number(t.id),
        name: t.name,
        text: t.text,
        video_url: t.video_url,
        photo_url: t.photo_url,
      })),
    },
    stats: {
      total_views: Number(course.total_views || 0),
      unique_visitors: Number(course.unique_visitors || 0),
      enquiry_count: Number(course.enquiry_count || 0),
      demo_request_count: Number(course.demo_request_count || 0),
      wishlist_count: Number(course.wishlist_count || 0),
      share_count: Number(course.share_count || 0),
      enrollment_count: Number(course.enrollment_count || 0),
    },
    seo: {
      seo_title: course.seo_title,
      seo_description: course.seo_description,
      focus_keyword: course.focus_keyword,
      canonical_url: course.canonical_url || `/courses/${course.cat_slug}/${course.sub_slug}/${course.slug}`,
      og_title: course.og_title || course.course_name,
      og_description: course.og_description || course.short_description,
      og_image_url: course.og_image_url || course.thumbnail_url,
      robots_directive: course.robots_directive || 'index, follow',
      schema_type: course.schema_type || 'Course',
    },
    user_state: {
      wishlisted: Boolean(course.is_wishlisted),
      enrolled: Boolean(course.is_enrolled),
      demo_requested: Boolean(course.has_demo_request),
    },
    times: {
      published_at: course.published_at,
      updated_at: course.updated_at,
    },
  };
}

export async function findCourseReviews(courseId, { page = 1, limit = 10, sort = 'newest' }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  let orderBy = 'ORDER BY cr.created_at DESC';
  if (sort === 'rating_high') orderBy = 'ORDER BY cr.rating DESC, cr.created_at DESC';
  if (sort === 'rating_low') orderBy = 'ORDER BY cr.rating ASC, cr.created_at DESC';

  const [countRows] = await pool.query(`
    SELECT COUNT(*) AS total 
    FROM course_reviews cr
    WHERE cr.course_id = ? AND cr.moderation_status = 'approved'
  `, [courseId]);
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT 
      cr.id, cr.rating, cr.title, cr.text, cr.created_at,
      u.name AS user_name, u.avatar_url
    FROM course_reviews cr
    JOIN users u ON u.id = cr.user_id
    WHERE cr.course_id = ? AND cr.moderation_status = 'approved'
    ${orderBy}
    LIMIT ? OFFSET ?
  `, [courseId, limit, offset]);

  return {
    reviews: rows.map(r => ({
      id: Number(r.id),
      user_name: r.user_name,
      avatar_url: r.avatar_url,
      rating: Number(r.rating),
      title: r.title,
      text: r.text,
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function searchCatalog({ q, type = 'all', limit = 10 }) {
  const pool = getPool();
  const searchTerm = `%${q}%`;
  const result = {
    courses: [],
    categories: [],
    subcategories: [],
  };

  // Search courses
  if (type === 'all' || type === 'course') {
    const [courses] = await pool.query(`
      SELECT 
        co.id, co.course_name, co.slug, co.short_description, co.thumbnail_url,
        c.slug AS category_slug, sc.slug AS subcategory_slug
      FROM courses co
      JOIN categories c ON c.id = co.category_id
      JOIN subcategories sc ON sc.id = co.subcategory_id
      WHERE (co.course_name LIKE ? OR co.short_description LIKE ? OR co.slug LIKE ?)
        AND co.status = 'published' AND co.deleted_at IS NULL
        AND c.status = 'active' AND c.deleted_at IS NULL
        AND sc.status = 'active' AND sc.deleted_at IS NULL
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, limit]);

    result.courses = courses.map(c => ({
      id: Number(c.id),
      name: c.course_name,
      slug: c.slug,
      url: `/courses/${c.category_slug}/${c.subcategory_slug}/${c.slug}`,
      thumbnail_url: c.thumbnail_url,
    }));
  }

  // Search categories
  if (type === 'all' || type === 'category') {
    const [categories] = await pool.query(`
      SELECT id, name, slug, icon_url
      FROM categories
      WHERE (name LIKE ? OR description LIKE ? OR slug LIKE ?)
        AND status = 'active' AND deleted_at IS NULL
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, limit]);

    result.categories = categories.map(c => ({
      id: Number(c.id),
      name: c.name,
      slug: c.slug,
      url: `/courses/${c.slug}`,
      icon_url: c.icon_url,
    }));
  }

  // Search subcategories
  if (type === 'all' || type === 'subcategory') {
    const [subcategories] = await pool.query(`
      SELECT sc.id, sc.name, sc.slug, sc.image_url, c.slug AS category_slug
      FROM subcategories sc
      JOIN categories c ON c.id = sc.category_id
      WHERE (sc.name LIKE ? OR sc.description LIKE ? OR sc.slug LIKE ?)
        AND sc.status = 'active' AND sc.deleted_at IS NULL
        AND c.status = 'active' AND c.deleted_at IS NULL
      LIMIT ?
    `, [searchTerm, searchTerm, searchTerm, limit]);

    result.subcategories = subcategories.map(sc => ({
      id: Number(sc.id),
      name: sc.name,
      slug: sc.slug,
      url: `/courses/${sc.category_slug}/${sc.slug}`,
      image_url: sc.image_url,
    }));
  }

  return result;
}

export async function findCoursesAdmin(filters = {}) {
  const pool = getPool();
  const conditions = ['co.deleted_at IS NULL'];
  const params = [];

  if (filters.status) {
    conditions.push('co.status = ?');
    params.push(filters.status);
  }

  if (filters.category_id) {
    conditions.push('co.category_id = ?');
    params.push(Number(filters.category_id));
  }

  if (filters.subcategory_id) {
    conditions.push('co.subcategory_id = ?');
    params.push(Number(filters.subcategory_id));
  }

  if (filters.instructor_id) {
    conditions.push('co.instructor_id = ?');
    params.push(Number(filters.instructor_id));
  }

  if (filters.is_featured !== undefined) {
    conditions.push('co.is_featured = ?');
    params.push(filters.is_featured === 'true' || filters.is_featured === true ? 1 : 0);
  }

  if (filters.created_from) {
    conditions.push('co.created_at >= ?');
    params.push(filters.created_from);
  }

  if (filters.created_to) {
    conditions.push('co.created_at <= ?');
    params.push(filters.created_to);
  }

  if (filters.search) {
    conditions.push('(co.course_name LIKE ? OR co.course_code LIKE ? OR co.slug LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.join(' AND ');

  let orderBy = 'ORDER BY co.created_at DESC';
  if (filters.sort === 'name') orderBy = 'ORDER BY co.course_name ASC';
  if (filters.sort === 'popular') orderBy = 'ORDER BY co.total_views DESC';
  if (filters.sort === 'price_asc') orderBy = 'ORDER BY co.price ASC';
  if (filters.sort === 'price_desc') orderBy = 'ORDER BY co.price DESC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM courses co WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const limit = filters.limit ? Math.min(Math.max(Number(filters.limit), 1), 100) : 20;
  const page = filters.page ? Math.max(Number(filters.page), 1) : 1;
  const offset = (page - 1) * limit;

  const [rows] = await pool.query(`
    SELECT 
      co.id, co.course_code, co.course_name, co.slug, co.status,
      co.price, co.offer_price, co.total_views, co.demo_request_count,
      co.enrollment_count, co.rating_avg, co.updated_at,
      c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
      sc.id AS subcategory_id, sc.name AS subcategory_name, sc.slug AS subcategory_slug
    FROM courses co
    JOIN categories c ON c.id = co.category_id
    JOIN subcategories sc ON sc.id = co.subcategory_id
    WHERE ${whereClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    courses: rows.map(r => ({
      id: Number(r.id),
      course_code: r.course_code,
      course_name: r.course_name,
      slug: r.slug,
      status: r.status,
      category: {
        id: Number(r.category_id),
        name: r.category_name,
        slug: r.category_slug,
      },
      subcategory: {
        id: Number(r.subcategory_id),
        name: r.subcategory_name,
        slug: r.subcategory_slug,
      },
      price: Number(r.price),
      offer_price: r.offer_price !== null ? Number(r.offer_price) : null,
      total_views: Number(r.total_views || 0),
      demo_request_count: Number(r.demo_request_count || 0),
      enrollment_count: Number(r.enrollment_count || 0),
      rating_avg: Number(r.rating_avg || 0),
      updated_at: r.updated_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function findCourseByIdAdmin(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      co.*,
      c.name AS category_name, sc.name AS subcategory_name,
      ins.name AS instructor_name
    FROM courses co
    JOIN categories c ON c.id = co.category_id
    JOIN subcategories sc ON sc.id = co.subcategory_id
    LEFT JOIN instructors ins ON ins.id = co.instructor_id
    WHERE co.id = ? AND co.deleted_at IS NULL
  `, [id]);

  if (rows.length === 0) return null;
  const course = rows[0];

  // Fetch tags
  const [tagsRows] = await pool.query('SELECT tag FROM course_tags WHERE course_id = ?', [id]);
  const tags = tagsRows.map(t => t.tag);

  // Fetch points
  const [pointsRows] = await pool.query('SELECT point_type, text FROM course_points WHERE course_id = ?', [id]);
  const whatYouWillLearn = pointsRows.filter(p => p.point_type === 'learn').map(p => p.text);
  const toolsCovered = pointsRows.filter(p => p.point_type === 'tool').map(p => p.text);
  const prerequisites = pointsRows.filter(p => p.point_type === 'prerequisite').map(p => p.text);

  return {
    ...course,
    id: Number(course.id),
    category_id: Number(course.category_id),
    subcategory_id: Number(course.subcategory_id),
    instructor_id: course.instructor_id ? Number(course.instructor_id) : null,
    price: Number(course.price),
    offer_price: course.offer_price !== null ? Number(course.offer_price) : null,
    duration_hours: Number(course.duration_hours),
    total_modules: Number(course.total_modules),
    total_lessons: Number(course.total_lessons),
    total_views: Number(course.total_views),
    enrollment_count: Number(course.enrollment_count),
    rating_avg: Number(course.rating_avg),
    rating_count: Number(course.rating_count),
    gallery_images: typeof course.gallery_images === 'string' ? JSON.parse(course.gallery_images) : (course.gallery_images || []),
    tags,
    what_you_will_learn: whatYouWillLearn,
    tools_covered: toolsCovered,
    prerequisites,
  };
}

export async function findCourseByCode(courseCode, excludeId = null) {
  const pool = getPool();
  let query = 'SELECT id, course_code FROM courses WHERE course_code = ? AND deleted_at IS NULL';
  const params = [courseCode];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function findCourseBySlugAny(slug, excludeId = null) {
  const pool = getPool();
  let query = 'SELECT id, slug FROM courses WHERE slug = ? AND deleted_at IS NULL';
  const params = [slug];
  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function createCourse(data) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const galleryJson = data.gallery_images ? JSON.stringify(data.gallery_images) : null;

    const [result] = await connection.query(`
      INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, instructor_id, course_level, language,
        mode, duration_hours, duration_days, thumbnail_url, banner_url,
        intro_video_url, demo_video_url, alt_text, brochure_url, syllabus_url,
        gallery_images, price, offer_price, currency, tax_inclusive,
        gst_percentage, is_free, refund_policy, refund_days,
        is_featured, is_new, is_trending, display_order, status,
        created_by, updated_by
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 'draft',
        ?, ?
      )
    `, [
      data.course_code,
      data.course_name,
      data.slug,
      data.short_description,
      data.description,
      data.category_id,
      data.subcategory_id,
      data.instructor_id || null,
      data.course_level,
      data.language,
      data.mode,
      data.duration_hours,
      data.duration_days || null,
      data.thumbnail_url || null,
      data.banner_url || null,
      data.intro_video_url || null,
      data.demo_video_url || null,
      data.alt_text || null,
      data.brochure_url || null,
      data.syllabus_url || null,
      galleryJson,
      data.price,
      data.offer_price !== undefined ? data.offer_price : null,
      data.currency || 'INR',
      data.tax_inclusive ? 1 : 0,
      data.gst_percentage || 0,
      data.is_free ? 1 : 0,
      data.refund_policy || null,
      data.refund_days || 0,
      data.is_featured ? 1 : 0,
      data.is_new ? 1 : 0,
      data.is_trending ? 1 : 0,
      data.display_order || 0,
      data.created_by || null,
      data.created_by || null,
    ]);

    const courseId = result.insertId;

    // Insert tags
    if (Array.isArray(data.tags) && data.tags.length > 0) {
      for (const tag of data.tags) {
        await connection.query('INSERT INTO course_tags (course_id, tag) VALUES (?, ?)', [courseId, tag.trim()]);
      }
    }

    // Insert points
    if (Array.isArray(data.what_you_will_learn)) {
      for (let i = 0; i < data.what_you_will_learn.length; i++) {
        await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "learn", ?, ?)', [courseId, data.what_you_will_learn[i], i]);
      }
    }

    if (Array.isArray(data.tools_covered)) {
      for (let i = 0; i < data.tools_covered.length; i++) {
        await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "tool", ?, ?)', [courseId, data.tools_covered[i], i]);
      }
    }

    if (Array.isArray(data.prerequisites)) {
      for (let i = 0; i < data.prerequisites.length; i++) {
        await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "prerequisite", ?, ?)', [courseId, data.prerequisites[i], i]);
      }
    }

    await connection.commit();
    return courseId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateCourse(id, data) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const fields = [];
    const params = [];

    const allowedCols = [
      'course_code', 'course_name', 'slug', 'short_description', 'description',
      'category_id', 'subcategory_id', 'instructor_id', 'course_level', 'language',
      'mode', 'duration_hours', 'duration_days', 'thumbnail_url', 'banner_url',
      'intro_video_url', 'demo_video_url', 'alt_text', 'brochure_url', 'syllabus_url',
      'price', 'offer_price', 'currency', 'tax_inclusive', 'gst_percentage',
      'is_free', 'refund_policy', 'refund_days', 'is_featured', 'is_new',
      'is_trending', 'display_order', 'updated_by'
    ];

    for (const col of allowedCols) {
      if (data[col] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(data[col]);
      }
    }

    if (data.gallery_images !== undefined) {
      fields.push('gallery_images = ?');
      params.push(data.gallery_images ? JSON.stringify(data.gallery_images) : null);
    }

    if (fields.length > 0) {
      params.push(id);
      await connection.query(
        `UPDATE courses SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
        params
      );
    }

    // Update tags if provided
    if (data.tags !== undefined) {
      await connection.query('DELETE FROM course_tags WHERE course_id = ?', [id]);
      if (Array.isArray(data.tags)) {
        for (const tag of data.tags) {
          await connection.query('INSERT INTO course_tags (course_id, tag) VALUES (?, ?)', [id, tag.trim()]);
        }
      }
    }

    // Update points if provided
    if (data.what_you_will_learn !== undefined || data.tools_covered !== undefined || data.prerequisites !== undefined) {
      if (data.what_you_will_learn !== undefined) {
        await connection.query('DELETE FROM course_points WHERE course_id = ? AND point_type = "learn"', [id]);
        for (let i = 0; i < data.what_you_will_learn.length; i++) {
          await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "learn", ?, ?)', [id, data.what_you_will_learn[i], i]);
        }
      }
      if (data.tools_covered !== undefined) {
        await connection.query('DELETE FROM course_points WHERE course_id = ? AND point_type = "tool"', [id]);
        for (let i = 0; i < data.tools_covered.length; i++) {
          await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "tool", ?, ?)', [id, data.tools_covered[i], i]);
        }
      }
      if (data.prerequisites !== undefined) {
        await connection.query('DELETE FROM course_points WHERE course_id = ? AND point_type = "prerequisite"', [id]);
        for (let i = 0; i < data.prerequisites.length; i++) {
          await connection.query('INSERT INTO course_points (course_id, point_type, text, display_order) VALUES (?, "prerequisite", ?, ?)', [id, data.prerequisites[i], i]);
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function recordSlugChange(courseId, oldSlug, newSlug) {
  const pool = getPool();
  await pool.query(
    'INSERT INTO course_slug_history (course_id, old_slug, new_slug) VALUES (?, ?, ?)',
    [courseId, oldSlug, newSlug]
  );
}

export async function updateCourseStatus(id, status, updatedBy = null) {
  const pool = getPool();
  if (status === 'published') {
    await pool.query(
      `UPDATE courses 
       SET status = ?, 
           published_at = COALESCE(published_at, NOW()), 
           updated_by = ? 
       WHERE id = ? AND deleted_at IS NULL`,
      [status, updatedBy, id]
    );
  } else {
    await pool.query(
      `UPDATE courses SET status = ?, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
      [status, updatedBy, id]
    );
  }
}

export async function softDeleteCourse(id, updatedBy = null) {
  const pool = getPool();
  await pool.query(
    'UPDATE courses SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL',
    [updatedBy, id]
  );
}

export default {
  findPublishedCourses,
  findCourseBySlug,
  findCourseReviews,
  searchCatalog,
  findCoursesAdmin,
  findCourseByIdAdmin,
  findCourseByCode,
  findCourseBySlugAny,
  createCourse,
  updateCourse,
  recordSlugChange,
  updateCourseStatus,
  softDeleteCourse,
};
