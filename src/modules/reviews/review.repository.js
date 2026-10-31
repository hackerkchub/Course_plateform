import { getPool } from '../../config/db.js';

/**
 * Check if student has active or completed enrollment in the course
 */
export async function checkUserEnrollment(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, enrollment_status 
     FROM course_enrollments
     WHERE user_id = ? AND course_id = ? AND enrollment_status IN ('active', 'completed')
     LIMIT 1`,
    [userId, courseId]
  );
  return rows.length > 0;
}

/**
 * Check if student has already submitted a review for this course
 */
export async function findReviewByUserAndCourse(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, course_id, rating, title, text, moderation_status, is_verified_enrollment, created_at
     FROM course_reviews
     WHERE user_id = ? AND course_id = ?`,
    [userId, courseId]
  );
  return rows[0] || null;
}

/**
 * Find single review by ID
 */
export async function findReviewById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, course_id, rating, title, text, moderation_status, is_verified_enrollment, created_at, updated_at
     FROM course_reviews
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Insert a new review in 'pending' moderation status
 */
export async function insertReview({ userId, courseId, rating, title = null, text = null, isVerifiedEnrollment = true }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO course_reviews (user_id, course_id, rating, title, text, moderation_status, is_verified_enrollment, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
    [userId, courseId, rating, title, text, isVerifiedEnrollment]
  );
  return result.insertId;
}

/**
 * Update an existing review and revert its status to 'pending' for re-moderation
 */
export async function updateReview(id, { rating, title, text }) {
  const pool = getPool();
  
  // Build dynamic update set
  const updates = ['moderation_status = "pending"', 'updated_at = NOW()'];
  const values = [];

  if (rating !== undefined) {
    updates.push('rating = ?');
    values.push(rating);
  }
  if (title !== undefined) {
    updates.push('title = ?');
    values.push(title);
  }
  if (text !== undefined) {
    updates.push('text = ?');
    values.push(text);
  }

  values.push(id);
  await pool.query(
    `UPDATE course_reviews SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Delete a review row
 */
export async function deleteReview(id) {
  const pool = getPool();
  await pool.query(`DELETE FROM course_reviews WHERE id = ?`, [id]);
}

/**
 * Atomically update review moderation status and dynamically recalculate
 * courses.rating_avg and courses.rating_count on the same database connection.
 * If either database operation fails, both changes roll back.
 */
export async function moderateReviewAndRecalculateRating(reviewId, courseId, moderationStatus) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Update review moderation status
    const [updateResult] = await connection.query(
      `UPDATE course_reviews 
       SET moderation_status = ?, updated_at = NOW() 
       WHERE id = ?`,
      [moderationStatus, reviewId]
    );

    if (updateResult.affectedRows === 0) {
      throw new Error(`Review ${reviewId} not found for moderation`);
    }

    // 2. Lock the course row to serialize aggregate recalculation
    const [courseCheck] = await connection.query(
      `SELECT id FROM courses WHERE id = ? FOR UPDATE`,
      [courseId]
    );

    if (courseCheck.length === 0) {
      throw new Error(`Course ${courseId} not found during review moderation`);
    }

    // 3. Dynamically recalculate aggregates exclusively from approved reviews
    const [statsRows] = await connection.query(
      `SELECT 
         COALESCE(ROUND(AVG(rating), 2), 0.00) AS avg_rating,
         COUNT(*) AS total_count
       FROM course_reviews
       WHERE course_id = ? AND moderation_status = 'approved'`,
      [courseId]
    );

    const avgRating = Number(statsRows[0]?.avg_rating || 0.00);
    const totalCount = Number(statsRows[0]?.total_count || 0);

    // 4. Update course rating aggregates on the same connection
    await connection.query(
      `UPDATE courses 
       SET rating_avg = ?, rating_count = ? 
       WHERE id = ?`,
      [avgRating, totalCount, courseId]
    );

    await connection.commit();
    return { avgRating, totalCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Update review moderation status
 */
export async function updateReviewModeration(id, moderationStatus) {
  const pool = getPool();
  await pool.query(
    `UPDATE course_reviews 
     SET moderation_status = ?, updated_at = NOW() 
     WHERE id = ?`,
    [moderationStatus, id]
  );
}

/**
 * Dynamically recompute courses.rating_avg and courses.rating_count from approved reviews only.
 * Invariant: Never allows arbitrary client rating values.
 */
export async function recalculateCourseRating(courseId, clientConnection = null) {
  const db = clientConnection || getPool();

  const [statsRows] = await db.query(
    `SELECT 
       COALESCE(ROUND(AVG(rating), 2), 0.00) AS avg_rating,
       COUNT(*) AS total_count
     FROM course_reviews
     WHERE course_id = ? AND moderation_status = 'approved'`,
    [courseId]
  );

  const avgRating = Number(statsRows[0]?.avg_rating || 0.00);
  const totalCount = Number(statsRows[0]?.total_count || 0);

  await db.query(
    `UPDATE courses 
     SET rating_avg = ?, rating_count = ? 
     WHERE id = ?`,
    [avgRating, totalCount, courseId]
  );

  return { avgRating, totalCount };
}

/**
 * Public list of approved reviews for course (email and phone are scrubbed)
 */
export async function findPublicCourseReviews(courseId, { page = 1, limit = 10, sort = 'newest' }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  let orderBy = 'ORDER BY cr.created_at DESC';
  if (sort === 'rating_high') orderBy = 'ORDER BY cr.rating DESC, cr.created_at DESC';
  if (sort === 'rating_low') orderBy = 'ORDER BY cr.rating ASC, cr.created_at DESC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total 
     FROM course_reviews cr
     WHERE cr.course_id = ? AND cr.moderation_status = 'approved'`,
    [courseId]
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT 
       cr.id, cr.rating, cr.title, cr.text, cr.is_verified_enrollment, cr.created_at,
       u.name AS user_name, u.avatar_url
     FROM course_reviews cr
     JOIN users u ON u.id = cr.user_id
     WHERE cr.course_id = ? AND cr.moderation_status = 'approved'
     ${orderBy}
     LIMIT ? OFFSET ?`,
    [courseId, limit, offset]
  );

  return {
    reviews: rows.map(r => ({
      id: Number(r.id),
      user_name: r.user_name,
      avatar_url: r.avatar_url,
      rating: Number(r.rating),
      title: r.title,
      text: r.text,
      is_verified_enrollment: Boolean(r.is_verified_enrollment),
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Administrative listing of reviews with filters
 */
export async function findAdminReviews({ page = 1, limit = 20, moderation_status = 'all', course_id, rating, sort = 'newest' }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const conditions = ['1=1'];
  const params = [];

  if (moderation_status && moderation_status !== 'all') {
    conditions.push('cr.moderation_status = ?');
    params.push(moderation_status);
  }

  if (course_id) {
    conditions.push('cr.course_id = ?');
    params.push(course_id);
  }

  if (rating) {
    conditions.push('cr.rating = ?');
    params.push(rating);
  }

  let orderBy = 'ORDER BY cr.created_at DESC';
  if (sort === 'oldest') orderBy = 'ORDER BY cr.created_at ASC';
  if (sort === 'rating_high') orderBy = 'ORDER BY cr.rating DESC, cr.created_at DESC';
  if (sort === 'rating_low') orderBy = 'ORDER BY cr.rating ASC, cr.created_at DESC';

  const whereClause = conditions.join(' AND ');

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total 
     FROM course_reviews cr
     WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT 
       cr.id, cr.course_id, cr.user_id, cr.rating, cr.title, cr.text, 
       cr.moderation_status, cr.is_verified_enrollment, cr.created_at, cr.updated_at,
       co.course_name, co.slug AS course_slug,
       u.name AS student_name, u.email AS student_email, u.avatar_url AS student_avatar
     FROM course_reviews cr
     JOIN courses co ON co.id = cr.course_id
     JOIN users u ON u.id = cr.user_id
     WHERE ${whereClause}
     ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    reviews: rows.map(r => ({
      id: Number(r.id),
      course: {
        id: Number(r.course_id),
        course_name: r.course_name,
        slug: r.course_slug,
      },
      student: {
        id: Number(r.user_id),
        name: r.student_name,
        email: r.student_email,
        avatar_url: r.student_avatar,
      },
      rating: Number(r.rating),
      title: r.title,
      text: r.text,
      moderation_status: r.moderation_status,
      is_verified_enrollment: Boolean(r.is_verified_enrollment),
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
