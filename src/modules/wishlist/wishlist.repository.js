import { getPool } from '../../config/db.js';

/**
 * Verify course exists and is published
 */
export async function findCourseForWishlist(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, course_name, slug, status, is_free, wishlist_count
     FROM courses
     WHERE id = ? AND deleted_at IS NULL`,
    [courseId]
  );
  return rows[0] || null;
}

/**
 * Add course to user's wishlist atomically and idempotently.
 * Increments courses.wishlist_count only on new insertion.
 */
export async function addCourseToWishlist(userId, courseId) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if already wishlisted
    const [existing] = await connection.query(
      `SELECT id FROM wishlists WHERE user_id = ? AND course_id = ? FOR UPDATE`,
      [userId, courseId]
    );

    if (existing.length > 0) {
      // Idempotent: already wishlisted, commit without modifying counter
      await connection.commit();
      return { alreadyWishlisted: true, wishlistId: existing[0].id };
    }

    // Insert new wishlist entry
    const [result] = await connection.query(
      `INSERT INTO wishlists (user_id, course_id, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [userId, courseId]
    );

    // Atomically increment course wishlist_count
    await connection.query(
      `UPDATE courses SET wishlist_count = wishlist_count + 1 WHERE id = ?`,
      [courseId]
    );

    await connection.commit();
    return { alreadyWishlisted: false, wishlistId: result.insertId };
  } catch (error) {
    await connection.rollback();

    // Handle concurrent duplicate addition gracefully using uq_wishlists_user_course
    if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
      const [rows] = await pool.query(
        `SELECT id FROM wishlists WHERE user_id = ? AND course_id = ?`,
        [userId, courseId]
      );
      if (rows.length > 0) {
        return { alreadyWishlisted: true, wishlistId: rows[0].id };
      }
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Remove course from user's wishlist atomically and idempotently.
 * Decrements courses.wishlist_count only if entry was removed.
 */
export async function removeCourseFromWishlist(userId, courseId) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check if entry exists
    const [existing] = await connection.query(
      `SELECT id FROM wishlists WHERE user_id = ? AND course_id = ? FOR UPDATE`,
      [userId, courseId]
    );

    if (existing.length === 0) {
      // Idempotent: not in wishlist, commit without error
      await connection.commit();
      return { removed: false };
    }

    // Delete wishlist entry
    await connection.query(
      `DELETE FROM wishlists WHERE user_id = ? AND course_id = ?`,
      [userId, courseId]
    );

    // Atomically decrement course wishlist_count, never below 0
    await connection.query(
      `UPDATE courses SET wishlist_count = GREATEST(wishlist_count - 1, 0) WHERE id = ?`,
      [courseId]
    );

    await connection.commit();
    return { removed: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Retrieve paginated wishlisted courses for a specific user
 */
export async function findUserWishlist(userId, { page = 1, limit = 12 }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM wishlists w
     JOIN courses co ON co.id = w.course_id
     WHERE w.user_id = ? AND co.deleted_at IS NULL`,
    [userId]
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT 
       co.id, co.course_name, co.slug, co.thumbnail_url, co.price, co.offer_price,
       co.is_free, co.course_level, co.mode, co.duration_hours, co.rating_avg, co.rating_count,
       c.slug AS category_slug, sc.slug AS subcategory_slug,
       i.id AS instructor_id, i.name AS instructor_name, i.photo_url AS instructor_photo,
       w.created_at AS wishlisted_at
     FROM wishlists w
     JOIN courses co ON co.id = w.course_id
     LEFT JOIN categories c ON c.id = co.category_id
     LEFT JOIN subcategories sc ON sc.id = co.subcategory_id
     LEFT JOIN instructors i ON i.id = co.instructor_id
     WHERE w.user_id = ? AND co.deleted_at IS NULL
     ORDER BY w.created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );

  return {
    courses: rows.map(r => ({
      id: Number(r.id),
      course_name: r.course_name,
      slug: r.slug,
      url: `/courses/${r.category_slug}/${r.subcategory_slug}/${r.slug}`,
      thumbnail_url: r.thumbnail_url,
      price: Number(r.price),
      offer_price: r.offer_price != null ? Number(r.offer_price) : null,
      is_free: Boolean(r.is_free),
      course_level: r.course_level,
      mode: r.mode,
      duration_hours: Number(r.duration_hours || 0),
      rating_avg: Number(r.rating_avg || 0),
      rating_count: Number(r.rating_count || 0),
      wishlisted: true,
      wishlisted_at: r.wishlisted_at,
      instructor: r.instructor_id ? {
        id: Number(r.instructor_id),
        name: r.instructor_name,
        photo_url: r.instructor_photo,
      } : null,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
