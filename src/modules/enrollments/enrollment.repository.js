import { getPool } from '../../config/db.js';

/**
 * Format a Date object or ISO string to MySQL 'YYYY-MM-DD HH:MM:SS'
 */
function formatSqlDatetime(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function findCourseForEnrollment(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      c.id, c.course_name, c.slug, c.status, c.is_free, c.price, c.enrollment_count,
      ces.enrollment_limit, ces.enrollment_start_at, ces.enrollment_end_at,
      cer.eligibility_enabled,
      cb.lifetime_access, cb.access_duration_days
    FROM courses c
    LEFT JOIN course_enrollment_settings ces ON ces.course_id = c.id
    LEFT JOIN course_eligibility_rules cer ON cer.course_id = c.id
    LEFT JOIN course_benefits cb ON cb.course_id = c.id
    WHERE c.id = ? AND c.deleted_at IS NULL`,
    [courseId]
  );
  return rows[0] || null;
}

export async function findBatchForEnrollment(batchId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, course_id, batch_name, total_seats, seats_available, status, enrollment_deadline
     FROM course_batches
     WHERE id = ? AND course_id = ?`,
    [batchId, courseId]
  );
  return rows[0] || null;
}

export async function findExistingEnrollment(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, course_id, batch_id, enrollment_source, enrollment_status, enrolled_at, access_expires_at, completed_at
     FROM course_enrollments
     WHERE user_id = ? AND course_id = ?`,
    [userId, courseId]
  );
  return rows[0] || null;
}

export async function findLatestEligibilityCheck(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, course_id, result, message, checked_at
     FROM eligibility_checks
     WHERE user_id = ? AND course_id = ?
     ORDER BY checked_at DESC, id DESC
     LIMIT 1`,
    [userId, courseId]
  );
  return rows[0] || null;
}

export async function executeEnrollmentTransaction({
  userId,
  courseId,
  batchId = null,
  enrolledBy = null,
  source = 'free',
  status = 'active',
  accessExpiresAt = null,
  notes = null,
}) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock course row
    const [courseRows] = await connection.query(
      `SELECT id, status, is_free, enrollment_count 
       FROM courses 
       WHERE id = ? AND deleted_at IS NULL 
       FOR UPDATE`,
      [courseId]
    );
    if (courseRows.length === 0) {
      const err = new Error('Course not found');
      err.statusCode = 404;
      throw err;
    }
    const course = courseRows[0];
    if (course.status !== 'published') {
      const err = new Error('Course is not currently published');
      err.statusCode = 400;
      throw err;
    }

    // 2. Lock enrollment settings
    const [settingsRows] = await connection.query(
      `SELECT enrollment_limit, enrollment_start_at, enrollment_end_at 
       FROM course_enrollment_settings 
       WHERE course_id = ? 
       FOR UPDATE`,
      [courseId]
    );
    const settings = settingsRows[0] || {};

    if (settings.enrollment_limit && Number(course.enrollment_count) >= Number(settings.enrollment_limit)) {
      const err = new Error('Course enrollment limit reached');
      err.statusCode = 400;
      throw err;
    }

    // 3. Lock batch row if provided
    if (batchId) {
      const [batchRows] = await connection.query(
        `SELECT id, seats_available, status, enrollment_deadline 
         FROM course_batches 
         WHERE id = ? AND course_id = ? 
         FOR UPDATE`,
        [batchId, courseId]
      );
      if (batchRows.length === 0) {
        const err = new Error('Selected batch does not exist for this course');
        err.statusCode = 400;
        throw err;
      }
      const batch = batchRows[0];
      if (batch.status !== 'open') {
        const err = new Error(`Cannot enroll into ${batch.status} batch`);
        err.statusCode = 400;
        throw err;
      }
      if (batch.enrollment_deadline && new Date() > new Date(batch.enrollment_deadline)) {
        const err = new Error('Batch enrollment deadline has passed');
        err.statusCode = 400;
        throw err;
      }
      if (Number(batch.seats_available) <= 0) {
        const err = new Error('Selected batch is fully booked (0 seats available)');
        err.statusCode = 409;
        throw err;
      }

      // Decrement batch seats
      await connection.query(
        `UPDATE course_batches 
         SET seats_available = seats_available - 1, updated_at = NOW() 
         WHERE id = ?`,
        [batchId]
      );
    }

    // 4. Duplicate check under lock
    const [dupRows] = await connection.query(
      `SELECT id FROM course_enrollments 
       WHERE user_id = ? AND course_id = ? 
       FOR UPDATE`,
      [userId, courseId]
    );
    if (dupRows.length > 0) {
      const err = new Error('User is already enrolled in this course');
      err.statusCode = 409;
      throw err;
    }

    // 5. Insert enrollment
    const [insertResult] = await connection.query(
      `INSERT INTO course_enrollments (
        user_id, course_id, batch_id, enrolled_by, enrollment_source,
        enrollment_status, enrolled_at, access_expires_at, notes
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        userId,
        courseId,
        batchId || null,
        enrolledBy || null,
        source,
        status,
        formatSqlDatetime(accessExpiresAt),
        notes || null,
      ]
    );
    const enrollmentId = insertResult.insertId;

    // 6. Increment course enrollment_count
    await connection.query(
      `UPDATE courses 
       SET enrollment_count = enrollment_count + 1, updated_at = NOW() 
       WHERE id = ?`,
      [courseId]
    );

    await connection.commit();
    return enrollmentId;
  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY' && err.message?.includes('uq_enrollments_user_course')) {
      const dupErr = new Error('User is already enrolled in this course');
      dupErr.statusCode = 409;
      throw dupErr;
    }
    throw err;
  } finally {
    connection.release();
  }
}

export async function findStudentEnrollments(userId, { page = 1, limit = 12, status = 'all' }) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const conditions = ['ce.user_id = ?'];
  const params = [userId];

  if (status && status !== 'all') {
    conditions.push('ce.enrollment_status = ?');
    params.push(status);
  }

  const whereClause = conditions.join(' AND ');

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM course_enrollments ce WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT 
      ce.id AS enrollment_id,
      ce.enrollment_status,
      ce.enrolled_at,
      ce.access_expires_at,
      ce.completed_at,
      ce.enrollment_source,
      c.id AS course_id,
      c.course_name,
      c.slug AS course_slug,
      c.thumbnail_url AS course_thumbnail_url,
      cb.id AS batch_id,
      cb.batch_name,
      (
        SELECT COUNT(*) 
        FROM course_lessons cl 
        JOIN course_modules cm ON cm.id = cl.module_id 
        WHERE cm.course_id = c.id AND cl.is_published = 1
      ) AS total_lessons,
      (
        SELECT COUNT(*) 
        FROM lesson_progress lp 
        JOIN course_lessons cl ON cl.id = lp.lesson_id 
        JOIN course_modules cm ON cm.id = cl.module_id 
        WHERE cm.course_id = c.id AND lp.user_id = ce.user_id AND lp.completed = 1
      ) AS completed_lessons,
      (
        SELECT lp.lesson_id 
        FROM lesson_progress lp 
        JOIN course_lessons cl ON cl.id = lp.lesson_id 
        JOIN course_modules cm ON cm.id = cl.module_id 
        WHERE cm.course_id = c.id AND lp.user_id = ce.user_id 
        ORDER BY lp.updated_at DESC 
        LIMIT 1
      ) AS last_lesson_id
    FROM course_enrollments ce
    JOIN courses c ON c.id = ce.course_id
    LEFT JOIN course_batches cb ON cb.id = ce.batch_id
    WHERE ${whereClause}
    ORDER BY ce.enrolled_at DESC, ce.id DESC
    LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const items = rows.map((r) => {
    const totalLessons = Number(r.total_lessons || 0);
    const completedLessons = Number(r.completed_lessons || 0);
    const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    return {
      enrollment_id: Number(r.enrollment_id),
      course: {
        id: Number(r.course_id),
        course_name: r.course_name,
        slug: r.course_slug,
        thumbnail_url: r.course_thumbnail_url,
      },
      batch: r.batch_id ? { id: Number(r.batch_id), name: r.batch_name } : null,
      enrollment_status: r.enrollment_status,
      enrolled_at: r.enrolled_at,
      access_expires_at: r.access_expires_at,
      completed_at: r.completed_at,
      progress_percentage: progressPercentage,
      last_lesson_id: r.last_lesson_id ? Number(r.last_lesson_id) : null,
    };
  });

  return { items, total };
}

export async function findEnrolledCurriculum(userId, courseId) {
  const pool = getPool();

  // 1. Verify enrollment
  const [enrollmentRows] = await pool.query(
    `SELECT id, enrollment_status, access_expires_at
     FROM course_enrollments
     WHERE user_id = ? AND course_id = ?
     LIMIT 1`,
    [userId, courseId]
  );

  if (enrollmentRows.length === 0) {
    return { enrolled: false, reason: 'NOT_ENROLLED' };
  }

  const enrollment = enrollmentRows[0];
  if (enrollment.enrollment_status === 'cancelled') {
    return { enrolled: false, reason: 'CANCELLED' };
  }
  if (enrollment.enrollment_status === 'expired' || (enrollment.access_expires_at && new Date() > new Date(enrollment.access_expires_at))) {
    return { enrolled: false, reason: 'EXPIRED' };
  }

  // 2. Fetch modules
  const [modules] = await pool.query(
    `SELECT id, title, description, display_order
     FROM course_modules
     WHERE course_id = ? AND is_published = 1
     ORDER BY display_order ASC, id ASC`,
    [courseId]
  );

  if (modules.length === 0) {
    return { enrolled: true, enrollment, modules: [] };
  }

  const moduleIds = modules.map((m) => m.id);

  // 3. Fetch lessons with student progress
  const [lessons] = await pool.query(
    `SELECT 
      cl.id, cl.module_id, cl.title, cl.description, cl.lesson_type,
      cl.content_url, cl.duration_seconds, cl.is_preview, cl.display_order,
      lp.completed, lp.last_position_seconds, lp.updated_at AS progress_updated_at
     FROM course_lessons cl
     LEFT JOIN lesson_progress lp ON lp.lesson_id = cl.id AND lp.user_id = ?
     WHERE cl.module_id IN (?) AND cl.is_published = 1
     ORDER BY cl.display_order ASC, cl.id ASC`,
    [userId, moduleIds]
  );

  const lessonsByModule = {};
  for (const l of lessons) {
    if (!lessonsByModule[l.module_id]) {
      lessonsByModule[l.module_id] = [];
    }
    lessonsByModule[l.module_id].push({
      id: Number(l.id),
      title: l.title,
      description: l.description,
      lesson_type: l.lesson_type,
      content_url: l.content_url,
      duration_seconds: Number(l.duration_seconds || 0),
      is_preview: Boolean(l.is_preview),
      display_order: Number(l.display_order || 0),
      progress: {
        completed: Boolean(l.completed),
        last_position_seconds: Number(l.last_position_seconds || 0),
        updated_at: l.progress_updated_at || null,
      },
    });
  }

  const resultModules = modules.map((m) => ({
    id: Number(m.id),
    title: m.title,
    description: m.description,
    display_order: Number(m.display_order || 0),
    lessons: lessonsByModule[m.id] || [],
  }));

  return { enrolled: true, enrollment, modules: resultModules };
}

export async function findLessonAndCourse(lessonId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT cl.id AS lesson_id, cl.title AS lesson_title, cl.is_published,
            cm.id AS module_id, cm.course_id,
            c.course_name, c.status AS course_status
     FROM course_lessons cl
     JOIN course_modules cm ON cm.id = cl.module_id
     JOIN courses c ON c.id = cm.course_id
     WHERE cl.id = ?`,
    [lessonId]
  );
  return rows[0] || null;
}

export async function saveLessonProgress(userId, lessonId, courseId, progressData = {}) {
  const completed = progressData.completed !== undefined ? Boolean(progressData.completed) : true;
  const positionSeconds = Number(
    progressData.last_position_seconds !== undefined
      ? progressData.last_position_seconds
      : (progressData.lastPositionSeconds !== undefined ? progressData.lastPositionSeconds : 0)
  );

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Verify student active/completed enrollment
    const [enrollRows] = await connection.query(
      `SELECT id, enrollment_status, access_expires_at 
       FROM course_enrollments 
       WHERE user_id = ? AND course_id = ?
       LIMIT 1
       FOR UPDATE`,
      [userId, courseId]
    );

    if (enrollRows.length === 0) {
      const err = new Error('You are not enrolled in the course for this lesson');
      err.statusCode = 403;
      throw err;
    }

    const enrollment = enrollRows[0];
    if (enrollment.enrollment_status === 'cancelled') {
      const err = new Error('Your enrollment in this course has been cancelled');
      err.statusCode = 403;
      throw err;
    }
    if (enrollment.enrollment_status === 'expired' || (enrollment.access_expires_at && new Date() > new Date(enrollment.access_expires_at))) {
      const err = new Error('Your access to this course has expired');
      err.statusCode = 403;
      throw err;
    }

    // 2. Upsert lesson_progress
    await connection.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, completed, last_position_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE 
         completed = VALUES(completed),
         last_position_seconds = VALUES(last_position_seconds),
         updated_at = NOW()`,
      [userId, lessonId, completed ? 1 : 0, positionSeconds]
    );

    // 3. Check for course completion:
    // If all published lessons in course are completed, mark enrollment as completed
    let courseCompleted = false;
    if (completed) {
      const [totalRows] = await connection.query(
        `SELECT COUNT(*) AS total 
         FROM course_lessons cl 
         JOIN course_modules cm ON cm.id = cl.module_id 
         WHERE cm.course_id = ? AND cl.is_published = 1`,
        [courseId]
      );
      const totalLessons = Number(totalRows[0]?.total || 0);

      const [completedRows] = await connection.query(
        `SELECT COUNT(*) AS completed 
         FROM lesson_progress lp 
         JOIN course_lessons cl ON cl.id = lp.lesson_id 
         JOIN course_modules cm ON cm.id = cl.module_id 
         WHERE cm.course_id = ? AND lp.user_id = ? AND lp.completed = 1`,
        [courseId, userId]
      );
      const completedLessons = Number(completedRows[0]?.completed || 0);

      if (totalLessons > 0 && completedLessons >= totalLessons) {
        courseCompleted = true;
        if (enrollment.enrollment_status === 'active') {
          await connection.query(
            `UPDATE course_enrollments 
             SET enrollment_status = 'completed', completed_at = NOW(), updated_at = NOW() 
             WHERE id = ?`,
            [enrollment.id]
          );
        }
      }
    }

    await connection.commit();
    return {
      lesson_id: Number(lessonId),
      completed: Boolean(completed),
      last_position_seconds: positionSeconds,
      course_completed: courseCompleted,
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function findAdminEnrollments(filters = {}, { page = 1, limit = 20 } = {}) {
  const pool = getPool();
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (filters.course_id) {
    conditions.push('ce.course_id = ?');
    params.push(filters.course_id);
  }
  if (filters.user_id) {
    conditions.push('ce.user_id = ?');
    params.push(filters.user_id);
  }
  if (filters.status) {
    conditions.push('ce.enrollment_status = ?');
    params.push(filters.status);
  }
  if (filters.source) {
    conditions.push('ce.enrollment_source = ?');
    params.push(filters.source);
  }
  if (filters.from_date) {
    conditions.push('ce.enrolled_at >= ?');
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push('ce.enrolled_at <= ?');
    params.push(filters.to_date);
  }
  if (filters.search) {
    conditions.push('(u.name LIKE ? OR u.email LIKE ? OR c.course_name LIKE ?)');
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total 
     FROM course_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN courses c ON c.id = ce.course_id
     ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT 
      ce.id, ce.user_id, ce.course_id, ce.batch_id, ce.enrolled_by,
      ce.enrollment_source, ce.enrollment_status, ce.enrolled_at,
      ce.access_expires_at, ce.completed_at, ce.notes, ce.created_at, ce.updated_at,
      u.name AS user_name, u.email AS user_email, u.phone AS user_phone,
      c.course_name, c.slug AS course_slug, c.course_code,
      cb.batch_name,
      au.name AS enrolled_by_name
     FROM course_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN courses c ON c.id = ce.course_id
     LEFT JOIN course_batches cb ON cb.id = ce.batch_id
     LEFT JOIN users au ON au.id = ce.enrolled_by
     ${whereClause}
     ORDER BY ce.enrolled_at DESC, ce.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const items = rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    user_name: r.user_name,
    user_email: r.user_email,
    user_phone: r.user_phone,
    course_id: Number(r.course_id),
    course_name: r.course_name,
    course_slug: r.course_slug,
    course_code: r.course_code,
    batch_id: r.batch_id ? Number(r.batch_id) : null,
    batch_name: r.batch_name || null,
    enrolled_by: r.enrolled_by ? Number(r.enrolled_by) : null,
    enrolled_by_name: r.enrolled_by_name || null,
    enrollment_source: r.enrollment_source,
    enrollment_status: r.enrollment_status,
    enrolled_at: r.enrolled_at,
    access_expires_at: r.access_expires_at,
    completed_at: r.completed_at,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return { items, total };
}

export async function findEnrollmentById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      ce.*,
      u.name AS user_name, u.email AS user_email,
      c.course_name, c.slug AS course_slug,
      cb.batch_name
     FROM course_enrollments ce
     JOIN users u ON u.id = ce.user_id
     JOIN courses c ON c.id = ce.course_id
     LEFT JOIN course_batches cb ON cb.id = ce.batch_id
     WHERE ce.id = ?`,
    [id]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    user_name: r.user_name,
    user_email: r.user_email,
    course_id: Number(r.course_id),
    course_name: r.course_name,
    course_slug: r.course_slug,
    batch_id: r.batch_id ? Number(r.batch_id) : null,
    batch_name: r.batch_name || null,
    enrollment_source: r.enrollment_source,
    enrollment_status: r.enrollment_status,
    enrolled_at: r.enrolled_at,
    access_expires_at: r.access_expires_at,
    completed_at: r.completed_at,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function updateAdminEnrollment(id, updates) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [currentRows] = await connection.query(
      `SELECT * FROM course_enrollments WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (currentRows.length === 0) {
      const err = new Error('Enrollment not found');
      err.statusCode = 404;
      throw err;
    }
    const current = currentRows[0];

    // Handle batch change seat decrement / increment
    if (updates.batch_id !== undefined && updates.batch_id !== current.batch_id) {
      // 1. If reassigning to a new batch, lock and validate it FIRST inside the transaction
      if (updates.batch_id) {
        const [newBatchRows] = await connection.query(
          `SELECT id, course_id, seats_available, status 
           FROM course_batches 
           WHERE id = ? 
           FOR UPDATE`,
          [updates.batch_id]
        );
        if (newBatchRows.length === 0 || Number(newBatchRows[0].course_id) !== Number(current.course_id)) {
          const err = new Error('Selected batch does not exist for this course');
          err.statusCode = 400;
          throw err;
        }
        const newBatch = newBatchRows[0];
        if (newBatch.status !== 'open') {
          const err = new Error(`Cannot reassign to ${newBatch.status} batch`);
          err.statusCode = 400;
          throw err;
        }
        if (Number(newBatch.seats_available) <= 0) {
          const err = new Error('New batch is fully booked (0 seats available)');
          err.statusCode = 409;
          throw err;
        }

        // Decrement seat from new batch
        await connection.query(
          `UPDATE course_batches SET seats_available = seats_available - 1, updated_at = NOW() WHERE id = ?`,
          [updates.batch_id]
        );
      }

      // 2. If existing enrollment held a seat in an old batch, lock and restore old batch seat
      if (current.batch_id) {
        await connection.query(
          `SELECT id FROM course_batches WHERE id = ? FOR UPDATE`,
          [current.batch_id]
        );
        await connection.query(
          `UPDATE course_batches SET seats_available = seats_available + 1, updated_at = NOW() WHERE id = ?`,
          [current.batch_id]
        );
      }
    }

    const fields = [];
    const params = [];

    if (updates.enrollment_status !== undefined) {
      fields.push('enrollment_status = ?');
      params.push(updates.enrollment_status);

      if (updates.enrollment_status === 'completed' && !current.completed_at) {
        fields.push('completed_at = NOW()');
      } else if (updates.enrollment_status !== 'completed' && current.completed_at) {
        fields.push('completed_at = NULL');
      }
    }

    if (updates.batch_id !== undefined) {
      fields.push('batch_id = ?');
      params.push(updates.batch_id || null);
    }

    if (updates.access_expires_at !== undefined) {
      fields.push('access_expires_at = ?');
      params.push(formatSqlDatetime(updates.access_expires_at));
    }

    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      params.push(updates.notes || null);
    }

    fields.push('updated_at = NOW()');
    params.push(id);

    await connection.query(
      `UPDATE course_enrollments SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    await connection.commit();
    return findEnrollmentById(id);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
