import { getPool } from '../../config/db.js';

/**
 * Finds a course by ID ensuring it is not soft-deleted.
 * @param {number|string} courseId
 * @returns {Promise<object|null>}
 */
export async function findCourseById(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, course_name, slug, status, is_free, price, offer_price,
            total_views, unique_visitors, enquiry_count, wishlist_count,
            share_count, enrollment_count, rating_avg, rating_count
     FROM courses
     WHERE id = ? AND deleted_at IS NULL`,
    [courseId]
  );
  return rows[0] || null;
}

/**
 * Checks whether a view record for the given session and course already exists today.
 * Half-open interval: [dayStart, nextDayStart)
 */
export async function checkViewExistsToday(courseId, sessionId, dayStart, nextDayStart, connection = null) {
  const executor = connection || getPool();
  const [rows] = await executor.query(
    `SELECT id 
     FROM course_views 
     WHERE course_id = ? 
       AND session_id = ? 
       AND viewed_at >= ? 
       AND viewed_at < ? 
     LIMIT 1`,
    [courseId, sessionId, dayStart, nextDayStart]
  );
  return rows.length > 0;
}

/**
 * Inserts a new view record and atomically increments total_views and (if novel) unique_visitors.
 * Executed inside a dedicated connection under withCourseViewLock.
 */
export async function recordCourseView({ courseId, userId = null, sessionId, referrer = null, source = 'direct', device_type = 'desktop' }, connection) {
  await connection.beginTransaction();
  try {
    // 1. Insert raw view event
    const [result] = await connection.query(
      `INSERT INTO course_views (course_id, user_id, session_id, viewed_at, referrer, source, device_type)
       VALUES (?, ?, ?, NOW(), ?, ?, ?)`,
      [courseId, userId, sessionId, referrer, source, device_type]
    );

    const newViewId = result.insertId;

    // 2. Check if this session has ever viewed this course previously (rolling window)
    const [priorViews] = await connection.query(
      `SELECT id FROM course_views 
       WHERE course_id = ? AND session_id = ? AND id <> ? 
       LIMIT 1`,
      [courseId, sessionId, newViewId]
    );

    const isNewUnique = priorViews.length === 0;

    // 3. Atomically update monotonic counters on courses table
    if (isNewUnique) {
      await connection.query(
        `UPDATE courses 
         SET total_views = total_views + 1, unique_visitors = unique_visitors + 1 
         WHERE id = ?`,
        [courseId]
      );
    } else {
      await connection.query(
        `UPDATE courses 
         SET total_views = total_views + 1 
         WHERE id = ?`,
        [courseId]
      );
    }

    await connection.commit();
    return { recorded: true, isNewUnique };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

/**
 * Atomically increments share_count on the courses table.
 */
export async function incrementShareCount(courseId) {
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE courses 
     SET share_count = share_count + 1 
     WHERE id = ? AND deleted_at IS NULL`,
    [courseId]
  );
  return result.affectedRows > 0;
}

/**
 * Atomically increments enquiry_count on courses and course_analytics_daily for today.
 * Sourced live from POST /api/courses/:id/enquiry-click.
 */
export async function recordEnquiryClick(courseId, dateStr) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Increment lifetime enquiry_count on course
    const [courseResult] = await connection.query(
      `UPDATE courses 
       SET enquiry_count = enquiry_count + 1 
       WHERE id = ? AND deleted_at IS NULL`,
      [courseId]
    );

    if (courseResult.affectedRows === 0) {
      await connection.rollback();
      return false;
    }

    // 2. Upsert daily enquiry count on course_analytics_daily
    await connection.query(
      `INSERT INTO course_analytics_daily 
         (course_id, analytics_date, enquiry_count, created_at, updated_at)
       VALUES (?, ?, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE 
         enquiry_count = enquiry_count + 1, 
         updated_at = NOW()`,
      [courseId, dateStr]
    );

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Retrieves historical rows from course_analytics_daily where analytics_date < todayStr.
 */
export async function getHistoricalDailyRows(courseId, fromDate, toDateExclusive) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT analytics_date, total_views, unique_visitors, demo_request_count, 
            enrollment_count, enquiry_count, wishlist_add_count
     FROM course_analytics_daily
     WHERE course_id = ? 
       AND analytics_date >= ? 
       AND analytics_date < ?
     ORDER BY analytics_date ASC`,
    [courseId, fromDate, toDateExclusive]
  );

  return rows.map(r => ({
    date: r.analytics_date instanceof Date 
      ? r.analytics_date.toISOString().slice(0, 10) 
      : String(r.analytics_date),
    total_views: Number(r.total_views || 0),
    unique_visitors: Number(r.unique_visitors || 0),
    demo_request_count: Number(r.demo_request_count || 0),
    enrollment_count: Number(r.enrollment_count || 0),
    enquiry_count: Number(r.enquiry_count || 0),
    wishlist_add_count: Number(r.wishlist_add_count || 0),
  }));
}

/**
 * Dynamically synthesizes today's live stats for a single course from raw event tables.
 * Uses half-open interval [dayStart, nextDayStart) in Asia/Kolkata.
 */
export async function getTodayLiveStats(courseId, dateStr, dayStart, nextDayStart) {
  const pool = getPool();

  const [viewStats] = await pool.query(
    `SELECT COUNT(id) AS total_views, COUNT(DISTINCT session_id) AS unique_visitors
     FROM course_views
     WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?`,
    [courseId, dayStart, nextDayStart]
  );

  const [demoStats] = await pool.query(
    `SELECT COUNT(id) AS demo_request_count
     FROM demo_requests
     WHERE course_id = ? AND created_at >= ? AND created_at < ?`,
    [courseId, dayStart, nextDayStart]
  );

  const [enrollStats] = await pool.query(
    `SELECT COUNT(id) AS enrollment_count
     FROM course_enrollments
     WHERE course_id = ? AND enrolled_at >= ? AND enrolled_at < ?`,
    [courseId, dayStart, nextDayStart]
  );

  const [enquiryRows] = await pool.query(
    `SELECT enquiry_count 
     FROM course_analytics_daily 
     WHERE course_id = ? AND analytics_date = ?`,
    [courseId, dateStr]
  );

  return {
    date: dateStr,
    total_views: Number(viewStats[0]?.total_views || 0),
    unique_visitors: Number(viewStats[0]?.unique_visitors || 0),
    demo_request_count: Number(demoStats[0]?.demo_request_count || 0),
    enrollment_count: Number(enrollStats[0]?.enrollment_count || 0),
    enquiry_count: Number(enquiryRows[0]?.enquiry_count || 0),
  };
}

/**
 * Retrieves breakdown distributions (sources, devices, demo_funnel) for a course over a range.
 */
export async function getCourseBreakdown(courseId, startTimestamp, endTimestamp) {
  const pool = getPool();

  const [sourceRows] = await pool.query(
    `SELECT COALESCE(source, 'direct') AS source, COUNT(*) AS count
     FROM course_views
     WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?
     GROUP BY source`,
    [courseId, startTimestamp, endTimestamp]
  );

  const [deviceRows] = await pool.query(
    `SELECT COALESCE(device_type, 'desktop') AS device_type, COUNT(*) AS count
     FROM course_views
     WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?
     GROUP BY device_type`,
    [courseId, startTimestamp, endTimestamp]
  );

  const [funnelRows] = await pool.query(
    `SELECT status, COUNT(*) AS count
     FROM demo_requests
     WHERE course_id = ? AND created_at >= ? AND created_at < ?
     GROUP BY status`,
    [courseId, startTimestamp, endTimestamp]
  );

  const [lastViewedRow] = await pool.query(
    `SELECT MAX(viewed_at) AS last_viewed_at
     FROM course_views
     WHERE course_id = ?`,
    [courseId]
  );

  const sources = { organic: 0, direct: 0, social: 0, campaign: 0 };
  for (const r of sourceRows) {
    if (sources[r.source] !== undefined) {
      sources[r.source] = Number(r.count);
    }
  }

  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  for (const r of deviceRows) {
    if (devices[r.device_type] !== undefined) {
      devices[r.device_type] = Number(r.count);
    }
  }

  const demo_funnel = { pending: 0, contacted: 0, scheduled: 0, completed: 0, cancelled: 0, converted: 0 };
  for (const r of funnelRows) {
    if (demo_funnel[r.status] !== undefined) {
      demo_funnel[r.status] = Number(r.count);
    }
  }

  return {
    sources,
    devices,
    demo_funnel,
    last_viewed_at: lastViewedRow[0]?.last_viewed_at 
      ? new Date(lastViewedRow[0].last_viewed_at).toISOString() 
      : null,
  };
}

/**
 * Returns comparison analytics across all courses with pagination and sorting.
 */
export async function getCoursesComparison({ limit, offset, sortBy = 'total_views', order = 'desc' }) {
  const pool = getPool();

  const allowedSortCols = {
    total_views: 'total_views',
    unique_visitors: 'unique_visitors',
    enrollment_count: 'enrollment_count',
    course_name: 'course_name',
    conversion_rate: 'conversion_rate',
  };

  const sortCol = allowedSortCols[sortBy] || 'total_views';
  const sortDir = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM courses WHERE deleted_at IS NULL`
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(
    `SELECT id, course_name, slug, total_views, unique_visitors, 
            enquiry_count, wishlist_count, share_count, enrollment_count,
            CASE 
              WHEN unique_visitors > 0 THEN ROUND((enrollment_count / unique_visitors) * 100, 2)
              ELSE 0.00
            END AS conversion_rate
     FROM courses
     WHERE deleted_at IS NULL
     ORDER BY ${sortCol} ${sortDir}
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return {
    courses: rows.map(r => ({
      ...r,
      total_views: Number(r.total_views || 0),
      unique_visitors: Number(r.unique_visitors || 0),
      enquiry_count: Number(r.enquiry_count || 0),
      wishlist_count: Number(r.wishlist_count || 0),
      share_count: Number(r.share_count || 0),
      enrollment_count: Number(r.enrollment_count || 0),
      conversion_rate: Number(r.conversion_rate || 0),
    })),
    total,
  };
}

/**
 * Gathers platform-wide overview statistics for admin dashboard.
 */
export async function getAdminDashboardOverview(todayStr, todayStart, nextDayStart) {
  const pool = getPool();

  // 1. Total counts
  const [studentCount] = await pool.query(`SELECT COUNT(*) AS total FROM users WHERE role = 'user' AND deleted_at IS NULL`);
  const [courseCount] = await pool.query(`SELECT COUNT(*) AS total FROM courses WHERE deleted_at IS NULL`);
  const [enrollCount] = await pool.query(`SELECT COUNT(*) AS total FROM course_enrollments`);
  const [viewSum] = await pool.query(`SELECT COALESCE(SUM(total_views), 0) AS total_views, COALESCE(SUM(unique_visitors), 0) AS unique_visitors FROM courses WHERE deleted_at IS NULL`);

  const totalViews = Number(viewSum[0]?.total_views || 0);
  const totalUnique = Number(viewSum[0]?.unique_visitors || 0);
  const totalEnrollments = Number(enrollCount[0]?.total || 0);
  const conversionRate = totalUnique > 0 ? Number(((totalEnrollments / totalUnique) * 100).toFixed(2)) : 0.00;

  // 2. Today's stats
  const [todayViews] = await pool.query(
    `SELECT COUNT(*) AS total FROM course_views WHERE viewed_at >= ? AND viewed_at < ?`,
    [todayStart, nextDayStart]
  );
  const [todayEnrolls] = await pool.query(
    `SELECT COUNT(*) AS total FROM course_enrollments WHERE enrolled_at >= ? AND enrolled_at < ?`,
    [todayStart, nextDayStart]
  );
  const [todayDemos] = await pool.query(
    `SELECT COUNT(*) AS total FROM demo_requests WHERE created_at >= ? AND created_at < ?`,
    [todayStart, nextDayStart]
  );
  const [todayEnquiries] = await pool.query(
    `SELECT COALESCE(SUM(enquiry_count), 0) AS total FROM course_analytics_daily WHERE analytics_date = ?`,
    [todayStr]
  );

  // 3. Top 5 courses by views
  const [topCourses] = await pool.query(
    `SELECT id, course_name, slug, total_views, unique_visitors, enrollment_count
     FROM courses 
     WHERE deleted_at IS NULL 
     ORDER BY total_views DESC 
     LIMIT 5`
  );

  // 4. Demo lead funnel status across platform
  const [demoFunnelRows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM demo_requests GROUP BY status`
  );
  const demo_funnel = { pending: 0, contacted: 0, scheduled: 0, completed: 0, cancelled: 0, converted: 0 };
  for (const r of demoFunnelRows) {
    if (demo_funnel[r.status] !== undefined) {
      demo_funnel[r.status] = Number(r.count);
    }
  }

  // 5. Recent enrollments
  const [recentEnrollments] = await pool.query(
    `SELECT ce.id, ce.course_id, c.course_name, ce.user_id, u.email, ce.enrolled_at, ce.enrollment_status AS status
     FROM course_enrollments ce
     JOIN courses c ON c.id = ce.course_id
     JOIN users u ON u.id = ce.user_id
     ORDER BY ce.enrolled_at DESC
     LIMIT 5`
  );

  return {
    overview: {
      total_students: Number(studentCount[0]?.total || 0),
      total_courses: Number(courseCount[0]?.total || 0),
      total_enrollments: totalEnrollments,
      total_views: totalViews,
      conversion_rate: conversionRate,
    },
    today_stats: {
      views: Number(todayViews[0]?.total || 0),
      enrollments: Number(todayEnrolls[0]?.total || 0),
      demo_requests: Number(todayDemos[0]?.total || 0),
      enquiries: Number(todayEnquiries[0]?.total || 0),
    },
    top_courses: topCourses.map(c => ({
      ...c,
      total_views: Number(c.total_views || 0),
      unique_visitors: Number(c.unique_visitors || 0),
      enrollment_count: Number(c.enrollment_count || 0),
    })),
    demo_funnel,
    recent_enrollments: recentEnrollments.map(e => ({
      id: e.id,
      course_id: e.course_id,
      course_name: e.course_name,
      user_id: e.user_id,
      email: e.email,
      status: e.status,
      enrolled_at: e.enrolled_at instanceof Date ? e.enrolled_at.toISOString() : String(e.enrolled_at),
    })),
  };
}

export default {
  findCourseById,
  checkViewExistsToday,
  recordCourseView,
  incrementShareCount,
  recordEnquiryClick,
  getHistoricalDailyRows,
  getTodayLiveStats,
  getCourseBreakdown,
  getCoursesComparison,
  getAdminDashboardOverview,
};
