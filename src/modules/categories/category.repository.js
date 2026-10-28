import { getPool } from '../../config/db.js';

export async function findActiveCategories(includeSubcategories = false) {
  const pool = getPool();

  // 1. Fetch all active categories with published course count
  const [categories] = await pool.query(`
    SELECT 
      c.id, c.name, c.slug, c.description, c.icon_url, c.banner_url, c.display_order,
      COUNT(DISTINCT co.id) AS total_courses
    FROM categories c
    LEFT JOIN subcategories sc 
      ON sc.category_id = c.id AND sc.status = 'active' AND sc.deleted_at IS NULL
    LEFT JOIN courses co 
      ON co.subcategory_id = sc.id AND co.status = 'published' AND co.deleted_at IS NULL
    WHERE c.status = 'active' AND c.deleted_at IS NULL
    GROUP BY c.id
    ORDER BY c.display_order ASC, c.name ASC
  `);

  if (!includeSubcategories || categories.length === 0) {
    return categories.map(cat => ({
      ...cat,
      total_courses: Number(cat.total_courses || 0),
    }));
  }

  // 2. Fetch all active subcategories with published course counts in a single query to avoid N+1
  const categoryIds = categories.map(c => c.id);
  const placeholders = categoryIds.map(() => '?').join(',');

  const [subcategories] = await pool.query(`
    SELECT 
      sc.id, sc.category_id, sc.name, sc.slug, sc.description, sc.image_url, sc.banner_url, sc.display_order,
      COUNT(DISTINCT co.id) AS total_courses
    FROM subcategories sc
    LEFT JOIN courses co 
      ON co.subcategory_id = sc.id AND co.status = 'published' AND co.deleted_at IS NULL
    WHERE sc.category_id IN (${placeholders}) AND sc.status = 'active' AND sc.deleted_at IS NULL
    GROUP BY sc.id
    ORDER BY sc.display_order ASC, sc.name ASC
  `, categoryIds);

  const subMap = new Map();
  for (const sub of subcategories) {
    if (!subMap.has(sub.category_id)) {
      subMap.set(sub.category_id, []);
    }
    subMap.get(sub.category_id).push({
      id: Number(sub.id),
      name: sub.name,
      slug: sub.slug,
      description: sub.description,
      image_url: sub.image_url,
      total_courses: Number(sub.total_courses || 0),
    });
  }

  return categories.map(cat => ({
    id: Number(cat.id),
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    icon_url: cat.icon_url,
    banner_url: cat.banner_url,
    total_courses: Number(cat.total_courses || 0),
    subcategories: subMap.get(cat.id) || [],
  }));
}

export async function findCategoryBySlug(slug) {
  const pool = getPool();

  const [rows] = await pool.query(`
    SELECT 
      c.id, c.name, c.slug, c.description, c.icon_url, c.banner_url,
      c.seo_title, c.seo_description, c.og_image_url, c.status,
      COUNT(DISTINCT co.id) AS total_courses
    FROM categories c
    LEFT JOIN subcategories sc 
      ON sc.category_id = c.id AND sc.status = 'active' AND sc.deleted_at IS NULL
    LEFT JOIN courses co 
      ON co.subcategory_id = sc.id AND co.status = 'published' AND co.deleted_at IS NULL
    WHERE c.slug = ? AND c.status = 'active' AND c.deleted_at IS NULL
    GROUP BY c.id
  `, [slug]);

  if (rows.length === 0) {
    return null;
  }

  const cat = rows[0];

  // Fetch active subcategories under this category
  const [subs] = await pool.query(`
    SELECT 
      sc.id, sc.name, sc.slug, sc.description, sc.image_url,
      COUNT(DISTINCT co.id) AS total_courses
    FROM subcategories sc
    LEFT JOIN courses co 
      ON co.subcategory_id = sc.id AND co.status = 'published' AND co.deleted_at IS NULL
    WHERE sc.category_id = ? AND sc.status = 'active' AND sc.deleted_at IS NULL
    GROUP BY sc.id
    ORDER BY sc.display_order ASC, sc.name ASC
  `, [cat.id]);

  return {
    category: {
      id: Number(cat.id),
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      icon_url: cat.icon_url,
      banner_url: cat.banner_url,
      total_courses: Number(cat.total_courses || 0),
      seo: {
        seo_title: cat.seo_title,
        seo_description: cat.seo_description,
        og_image_url: cat.og_image_url,
        canonical_url: `/courses/${cat.slug}`,
      },
    },
    breadcrumbs: [
      { label: 'Home', url: '/' },
      { label: cat.name, url: `/courses/${cat.slug}` },
    ],
    subcategories: subs.map(s => ({
      id: Number(s.id),
      name: s.name,
      slug: s.slug,
      description: s.description,
      image_url: s.image_url,
      total_courses: Number(s.total_courses || 0),
    })),
  };
}

export async function findCategoriesAdmin({ status, search, limit = 20, offset = 0, sort = 'newest' }) {
  const pool = getPool();
  const conditions = ['c.deleted_at IS NULL'];
  const params = [];

  if (status) {
    conditions.push('c.status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(c.name LIKE ? OR c.slug LIKE ? OR c.description LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.join(' AND ');

  let orderClause = 'ORDER BY c.created_at DESC';
  if (sort === 'name') orderClause = 'ORDER BY c.name ASC';
  if (sort === 'popular') orderClause = 'ORDER BY total_courses DESC, c.display_order ASC';
  if (sort === 'order') orderClause = 'ORDER BY c.display_order ASC, c.name ASC';

  // Count query
  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM categories c WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  // List query with total_subcategories and total_courses
  const [items] = await pool.query(`
    SELECT 
      c.id, c.name, c.slug, c.description, c.icon_url, c.banner_url,
      c.display_order, c.status, c.seo_title, c.seo_description, c.og_image_url,
      c.created_by, c.created_at, c.updated_at,
      COUNT(DISTINCT sc.id) AS total_subcategories,
      COUNT(DISTINCT co.id) AS total_courses
    FROM categories c
    LEFT JOIN subcategories sc ON sc.category_id = c.id AND sc.deleted_at IS NULL
    LEFT JOIN courses co ON co.category_id = c.id AND co.deleted_at IS NULL
    WHERE ${whereClause}
    GROUP BY c.id
    ${orderClause}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    categories: items.map(cat => ({
      ...cat,
      id: Number(cat.id),
      total_subcategories: Number(cat.total_subcategories || 0),
      total_courses: Number(cat.total_courses || 0),
    })),
    total,
  };
}

export async function findCategoryById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, name, slug, description, icon_url, banner_url, display_order,
            status, seo_title, seo_description, og_image_url, created_by,
            created_at, updated_at, deleted_at
     FROM categories 
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

export async function findCategoryBySlugAny(slug, excludeId = null) {
  const pool = getPool();
  let query = 'SELECT id, name, slug FROM categories WHERE slug = ? AND deleted_at IS NULL';
  const params = [slug];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const [rows] = await pool.query(query, params);
  return rows[0] || null;
}

export async function createCategory(data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO categories (
      name, slug, description, icon_url, banner_url, display_order, status,
      seo_title, seo_description, og_image_url, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name,
    data.slug,
    data.description || null,
    data.icon_url || null,
    data.banner_url || null,
    data.display_order ?? 0,
    data.status || 'active',
    data.seo_title || null,
    data.seo_description || null,
    data.og_image_url || null,
    data.created_by || null,
  ]);

  return findCategoryById(result.insertId);
}

export async function updateCategory(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowedCols = [
    'name', 'slug', 'description', 'icon_url', 'banner_url',
    'display_order', 'status', 'seo_title', 'seo_description', 'og_image_url'
  ];

  for (const col of allowedCols) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (fields.length === 0) {
    return findCategoryById(id);
  }

  params.push(id);
  await pool.query(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  return findCategoryById(id);
}

export async function reorderCategories(items) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    for (const item of items) {
      await connection.query(
        'UPDATE categories SET display_order = ? WHERE id = ? AND deleted_at IS NULL',
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

export async function countActiveSubcategoriesByCategoryId(categoryId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) as count FROM subcategories WHERE category_id = ? AND deleted_at IS NULL',
    [categoryId]
  );
  return Number(rows[0]?.count || 0);
}

export async function softDeleteCategory(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE categories SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
}

export default {
  findActiveCategories,
  findCategoryBySlug,
  findCategoriesAdmin,
  findCategoryById,
  findCategoryBySlugAny,
  createCategory,
  updateCategory,
  reorderCategories,
  countActiveSubcategoriesByCategoryId,
  softDeleteCategory,
};
