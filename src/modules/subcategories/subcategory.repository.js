import { getPool } from '../../config/db.js';

export async function findSubcategoriesByCatSlug(catSlug) {
  const pool = getPool();

  const [rows] = await pool.query(`
    SELECT 
      sc.id, sc.category_id, sc.name, sc.slug, sc.description, sc.image_url, sc.banner_url,
      sc.display_order, sc.status,
      c.name AS category_name, c.slug AS category_slug,
      COUNT(DISTINCT co.id) AS total_courses
    FROM subcategories sc
    JOIN categories c ON c.id = sc.category_id
    LEFT JOIN courses co 
      ON co.subcategory_id = sc.id AND co.status = 'published' AND co.deleted_at IS NULL
    WHERE c.slug = ? AND c.status = 'active' AND c.deleted_at IS NULL
      AND sc.status = 'active' AND sc.deleted_at IS NULL
    GROUP BY sc.id
    ORDER BY sc.display_order ASC, sc.name ASC
  `, [catSlug]);

  return rows.map(r => ({
    id: Number(r.id),
    category_id: Number(r.category_id),
    name: r.name,
    slug: r.slug,
    description: r.description,
    image_url: r.image_url,
    banner_url: r.banner_url,
    total_courses: Number(r.total_courses || 0),
  }));
}

export async function findSubcategoryPage(catSlug, subSlug, filters = {}, userId = null) {
  const pool = getPool();

  // 1. Fetch category & subcategory details
  const [headerRows] = await pool.query(`
    SELECT 
      c.id AS category_id, c.name AS category_name, c.slug AS category_slug, c.status AS category_status,
      sc.id AS subcategory_id, sc.name AS subcategory_name, sc.slug AS subcategory_slug,
      sc.description AS subcategory_description, sc.banner_url AS subcategory_banner_url,
      sc.seo_title, sc.seo_description, sc.og_image_url, sc.status AS subcategory_status
    FROM subcategories sc
    JOIN categories c ON c.id = sc.category_id
    WHERE c.slug = ? AND sc.slug = ?
      AND c.deleted_at IS NULL AND sc.deleted_at IS NULL
  `, [catSlug, subSlug]);

  if (headerRows.length === 0) {
    return null;
  }

  const h = headerRows[0];
  if (h.category_status !== 'active' || h.subcategory_status !== 'active') {
    return null; // Public page only accessible if both category and subcategory are active
  }

  const categoryId = Number(h.category_id);
  const subcategoryId = Number(h.subcategory_id);

  // 2. Fetch available filter facets for this subcategory (levels, languages, modes, price range)
  const [facetRows] = await pool.query(`
    SELECT 
      DISTINCT course_level, language, mode, price, offer_price
    FROM courses
    WHERE subcategory_id = ? AND status = 'published' AND deleted_at IS NULL
  `, [subcategoryId]);

  const levelsSet = new Set();
  const languagesSet = new Set();
  const modesSet = new Set();
  let minPrice = facetRows.length > 0 ? Infinity : 0;
  let maxPrice = 0;

  for (const row of facetRows) {
    if (row.course_level) levelsSet.add(row.course_level);
    if (row.language) languagesSet.add(row.language);
    if (row.mode) modesSet.add(row.mode);
    const effective = row.offer_price !== null && Number(row.offer_price) < Number(row.price)
      ? Number(row.offer_price)
      : Number(row.price);
    if (effective < minPrice) minPrice = effective;
    if (effective > maxPrice) maxPrice = effective;
  }

  if (minPrice === Infinity) minPrice = 0;

  // 3. Build dynamic filtering query for courses under this subcategory
  const conditions = [
    'co.subcategory_id = ?',
    "co.status = 'published'",
    'co.deleted_at IS NULL',
  ];
  const params = [subcategoryId];

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

  const whereClause = conditions.join(' AND ');

  // Sort handling
  let orderBy = 'ORDER BY co.published_at DESC';
  if (filters.sort === 'popular') orderBy = 'ORDER BY co.total_views DESC, co.enrollment_count DESC';
  if (filters.sort === 'price_asc') orderBy = 'ORDER BY COALESCE(co.offer_price, co.price) ASC';
  if (filters.sort === 'price_desc') orderBy = 'ORDER BY COALESCE(co.offer_price, co.price) DESC';
  if (filters.sort === 'rating') orderBy = 'ORDER BY co.rating_avg DESC, co.rating_count DESC';
  if (filters.sort === 'name') orderBy = 'ORDER BY co.course_name ASC';

  // Count query
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM courses co WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  // Pagination parameters
  const limit = filters.limit ? Math.min(Math.max(Number(filters.limit), 1), 100) : 12;
  const page = filters.page ? Math.max(Number(filters.page), 1) : 1;
  const offset = (page - 1) * limit;

  // Course list query joined with instructors, next batch, and user state
  const courseParams = [...params, limit, offset];
  const [courseRows] = await pool.query(`
    SELECT 
      co.id, co.course_name, co.slug, co.short_description, co.thumbnail_url, co.alt_text,
      co.course_level, co.language, co.mode, co.duration_hours, co.total_lessons,
      co.price, co.offer_price, co.currency, co.is_featured, co.is_new, co.is_trending,
      co.rating_avg, co.rating_count, co.total_views, co.enrollment_count,
      ins.id AS instructor_id, ins.name AS instructor_name, ins.photo_url AS instructor_photo_url,
      cds.demo_enabled,
      (SELECT MIN(cb.start_date) FROM course_batches cb WHERE cb.course_id = co.id AND cb.start_date >= CURDATE() AND cb.status = 'open') AS next_batch_start,
      (SELECT SUM(cb.seats_available) FROM course_batches cb WHERE cb.course_id = co.id AND cb.start_date >= CURDATE() AND cb.status = 'open') AS total_seats_available,
      ${userId ? `EXISTS(SELECT 1 FROM wishlists w WHERE w.course_id = co.id AND w.user_id = ${Number(userId)})` : '0'} AS is_wishlisted,
      ${userId ? `EXISTS(SELECT 1 FROM course_enrollments ce WHERE ce.course_id = co.id AND ce.user_id = ${Number(userId)} AND ce.enrollment_status = 'active')` : '0'} AS is_enrolled
    FROM courses co
    LEFT JOIN instructors ins ON ins.id = co.instructor_id
    LEFT JOIN course_demo_settings cds ON cds.course_id = co.id
    WHERE ${whereClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `, courseParams);

  // Format course cards matching Section 8 & 9.1
  const courses = courseRows.map(c => {
    const priceNum = Number(c.price);
    const offerPriceNum = c.offer_price !== null ? Number(c.offer_price) : null;
    const hasOffer = offerPriceNum !== null && offerPriceNum < priceNum;
    const discountPercentage = hasOffer ? Math.round(((priceNum - offerPriceNum) / priceNum) * 100) : 0;

    return {
      id: Number(c.id),
      course_name: c.course_name,
      slug: c.slug,
      url: `/courses/${h.category_slug}/${h.subcategory_slug}/${c.slug}`,
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
    category: {
      id: categoryId,
      name: h.category_name,
      slug: h.category_slug,
    },
    subcategory: {
      id: subcategoryId,
      name: h.subcategory_name,
      slug: h.subcategory_slug,
      description: h.subcategory_description,
      banner_url: h.subcategory_banner_url,
      total_courses: total,
      seo: {
        seo_title: h.seo_title,
        seo_description: h.seo_description,
        canonical_url: `/courses/${h.category_slug}/${h.subcategory_slug}`,
        og_image_url: h.og_image_url,
      },
    },
    breadcrumbs: [
      { label: 'Home', url: '/' },
      { label: h.category_name, url: `/courses/${h.category_slug}` },
      { label: h.subcategory_name, url: `/courses/${h.category_slug}/${h.subcategory_slug}` },
    ],
    filters_available: {
      levels: Array.from(levelsSet),
      languages: Array.from(languagesSet),
      modes: Array.from(modesSet),
      price_range: { min: minPrice, max: maxPrice },
    },
    courses,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function findSubcategoriesAdmin({ category_id, status, search, limit = 20, offset = 0, sort = 'newest' }) {
  const pool = getPool();
  const conditions = ['sc.deleted_at IS NULL'];
  const params = [];

  if (category_id) {
    conditions.push('sc.category_id = ?');
    params.push(category_id);
  }

  if (status) {
    conditions.push('sc.status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(sc.name LIKE ? OR sc.slug LIKE ? OR sc.description LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.join(' AND ');

  let orderClause = 'ORDER BY sc.created_at DESC';
  if (sort === 'name') orderClause = 'ORDER BY sc.name ASC';
  if (sort === 'popular') orderClause = 'ORDER BY total_courses DESC, sc.display_order ASC';
  if (sort === 'order') orderClause = 'ORDER BY sc.display_order ASC, sc.name ASC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM subcategories sc WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [items] = await pool.query(`
    SELECT 
      sc.id, sc.category_id, sc.name, sc.slug, sc.description, sc.image_url, sc.banner_url,
      sc.display_order, sc.status, sc.seo_title, sc.seo_description, sc.og_image_url,
      sc.created_at, sc.updated_at,
      c.name AS category_name, c.slug AS category_slug,
      COUNT(DISTINCT co.id) AS total_courses
    FROM subcategories sc
    JOIN categories c ON c.id = sc.category_id
    LEFT JOIN courses co ON co.subcategory_id = sc.id AND co.deleted_at IS NULL
    WHERE ${whereClause}
    GROUP BY sc.id
    ${orderClause}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    subcategories: items.map(sub => ({
      ...sub,
      id: Number(sub.id),
      category_id: Number(sub.category_id),
      total_courses: Number(sub.total_courses || 0),
    })),
    total,
  };
}

export async function findSubcategoryById(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      sc.id, sc.category_id, sc.name, sc.slug, sc.description, sc.image_url, sc.banner_url,
      sc.display_order, sc.status, sc.seo_title, sc.seo_description, sc.og_image_url,
      sc.created_at, sc.updated_at, sc.deleted_at,
      c.name AS category_name, c.slug AS category_slug
    FROM subcategories sc
    JOIN categories c ON c.id = sc.category_id
    WHERE sc.id = ? AND sc.deleted_at IS NULL
  `, [id]);

  return rows[0] ? { ...rows[0], id: Number(rows[0].id), category_id: Number(rows[0].category_id) } : null;
}

export async function findSubcategoryBySlugAndCategory(categoryId, slug, excludeId = null) {
  const pool = getPool();
  let query = 'SELECT id, category_id, name, slug FROM subcategories WHERE category_id = ? AND slug = ? AND deleted_at IS NULL';
  const params = [categoryId, slug];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function createSubcategory(data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO subcategories (
      category_id, name, slug, description, image_url, banner_url, display_order, status,
      seo_title, seo_description, og_image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.category_id,
    data.name,
    data.slug,
    data.description || null,
    data.image_url || null,
    data.banner_url || null,
    data.display_order ?? 0,
    data.status || 'active',
    data.seo_title || null,
    data.seo_description || null,
    data.og_image_url || null,
  ]);

  return findSubcategoryById(result.insertId);
}

export async function updateSubcategory(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowedCols = [
    'category_id', 'name', 'slug', 'description', 'image_url', 'banner_url',
    'display_order', 'status', 'seo_title', 'seo_description', 'og_image_url'
  ];

  for (const col of allowedCols) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (fields.length === 0) {
    return findSubcategoryById(id);
  }

  params.push(id);
  await pool.query(
    `UPDATE subcategories SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  return findSubcategoryById(id);
}

export async function moveSubcategoryToCategory(subcategoryId, newCategoryId, oldCategorySlug, newCategorySlug) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Update subcategory category_id
    await connection.query(
      'UPDATE subcategories SET category_id = ? WHERE id = ? AND deleted_at IS NULL',
      [newCategoryId, subcategoryId]
    );

    // 2. Fetch all courses under this subcategory to update their category_id and record slug history
    const [courses] = await connection.query(
      'SELECT id, slug FROM courses WHERE subcategory_id = ? AND deleted_at IS NULL',
      [subcategoryId]
    );

    // 3. Update category_id across all courses
    await connection.query(
      'UPDATE courses SET category_id = ? WHERE subcategory_id = ? AND deleted_at IS NULL',
      [newCategoryId, subcategoryId]
    );

    // 4. Record old URL/slug mappings in course_slug_history
    for (const c of courses) {
      const oldUrl = `/courses/${oldCategorySlug}/${c.slug}`;
      const newUrl = `/courses/${newCategorySlug}/${c.slug}`;
      await connection.query(
        'INSERT INTO course_slug_history (course_id, old_slug, new_slug) VALUES (?, ?, ?)',
        [c.id, oldUrl, newUrl]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function reorderSubcategories(items) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        'UPDATE subcategories SET display_order = ? WHERE id = ? AND deleted_at IS NULL',
        [item.display_order, item.id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function countCoursesBySubcategoryId(subcategoryId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM courses WHERE subcategory_id = ? AND deleted_at IS NULL',
    [subcategoryId]
  );
  return Number(rows[0]?.count || 0);
}

export async function softDeleteSubcategory(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE subcategories SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
}

export default {
  findSubcategoriesByCatSlug,
  findSubcategoryPage,
  findSubcategoriesAdmin,
  findSubcategoryById,
  findSubcategoryBySlugAndCategory,
  createSubcategory,
  updateSubcategory,
  moveSubcategoryToCategory,
  reorderSubcategories,
  countCoursesBySubcategoryId,
  softDeleteSubcategory,
};
