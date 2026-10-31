import { withJobLock, withCourseViewLock } from '../utils/advisoryLock.js';
import { getKolkataDateString, getKolkataHalfOpenRange } from '../utils/dateUtils.js';
import logger from '../config/logger.js';

/**
 * Calculates yesterday's date string 'YYYY-MM-DD' in Asia/Kolkata terms.
 * @param {string} dateStr
 * @returns {string}
 */
function getYesterdayDateString(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Runs the nightly analytics aggregation job at 2:00 AM.
 * Aggregates views, unique visitors, demo requests, enrollments, and wishlist adds
 * into course_analytics_daily for yesterday (and backfills any missed unaggregated dates).
 * Strictly preserves live accumulated enquiry counts and protects wishlist add counts.
 * Uses shared course/date advisory lock: course_platform_views_rw_${courseId}_${dateStr}.
 *
 * @param {string} [forcedTargetDate] Optional date override for testing or manual backfills
 * @returns {Promise<{ skipped: boolean, processedDatesCount?: number, aggregatedRecordsCount?: number, reason?: string }>}
 */
export async function runAnalyticsAggregateJob(forcedTargetDate = null) {
  return await withJobLock('analytics_aggregate', async (connection) => {
    logger.info('Starting analytics_aggregate cron job execution');

    const todayStr = getKolkataDateString();
    const { dayStart: todayStart } = getKolkataHalfOpenRange(todayStr);

    let datesToProcess = [];

    if (forcedTargetDate) {
      datesToProcess = [forcedTargetDate];
    } else {
      // 1. Scan for any past dates with raw views
      const [viewDates] = await connection.query(
        `SELECT DISTINCT DATE_FORMAT(viewed_at, '%Y-%m-%d') AS date_str
         FROM course_views
         WHERE viewed_at < ?
         ORDER BY date_str ASC`,
        [todayStart]
      );

      const pastDatesSet = new Set(viewDates.map(r => r.date_str));
      
      // Always include yesterday
      const yesterdayStr = getYesterdayDateString(todayStr);
      pastDatesSet.add(yesterdayStr);

      datesToProcess = Array.from(pastDatesSet).sort();
    }

    let aggregatedRecordsCount = 0;

    for (const dateStr of datesToProcess) {
      // Never process today or future dates
      if (dateStr >= todayStr) continue;

      const { dayStart, nextDayStart } = getKolkataHalfOpenRange(dateStr);

      // Find all courses with activity or records on this date
      const [coursesWithActivity] = await connection.query(
        `SELECT DISTINCT course_id FROM course_views WHERE viewed_at >= ? AND viewed_at < ?
         UNION
         SELECT DISTINCT course_id FROM demo_requests WHERE created_at >= ? AND created_at < ?
         UNION
         SELECT DISTINCT course_id FROM course_enrollments WHERE enrolled_at >= ? AND enrolled_at < ?
         UNION
         SELECT DISTINCT course_id FROM wishlists WHERE created_at >= ? AND created_at < ?
         UNION
         SELECT DISTINCT course_id FROM course_analytics_daily WHERE analytics_date = ?`,
        [dayStart, nextDayStart, dayStart, nextDayStart, dayStart, nextDayStart, dayStart, nextDayStart, dateStr]
      );

      for (const row of coursesWithActivity) {
        const courseId = row.course_id;

        // Acquire shared course/date lock (timeout 2s) to coordinate with view ingestion and retention
        const lockResult = await withCourseViewLock(courseId, dateStr, 2, async (lockedConn) => {
          // Recompute metrics from raw tables using dedicated locked connection
          const [viewStats] = await lockedConn.query(
            `SELECT COUNT(id) AS total_views, COUNT(DISTINCT session_id) AS unique_visitors
             FROM course_views
             WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [demoStats] = await lockedConn.query(
            `SELECT COUNT(id) AS demo_count
             FROM demo_requests
             WHERE course_id = ? AND created_at >= ? AND created_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [enrollStats] = await lockedConn.query(
            `SELECT COUNT(id) AS enroll_count
             FROM course_enrollments
             WHERE course_id = ? AND enrolled_at >= ? AND enrolled_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [wishlistStats] = await lockedConn.query(
            `SELECT COUNT(id) AS wishlist_count
             FROM wishlists
             WHERE course_id = ? AND created_at >= ? AND created_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const totalViews = Number(viewStats[0]?.total_views || 0);
          const uniqueVisitors = Number(viewStats[0]?.unique_visitors || 0);
          const demoCount = Number(demoStats[0]?.demo_count || 0);
          const enrollCount = Number(enrollStats[0]?.enroll_count || 0);
          const wishlistCount = Number(wishlistStats[0]?.wishlist_count || 0);

          // Upsert into course_analytics_daily preserving enquiry_count and existing wishlist_add_count
          await lockedConn.query(
            `INSERT INTO course_analytics_daily 
               (course_id, analytics_date, total_views, unique_visitors, demo_request_count, wishlist_add_count, enrollment_count, enquiry_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               total_views = VALUES(total_views),
               unique_visitors = VALUES(unique_visitors),
               demo_request_count = VALUES(demo_request_count),
               enrollment_count = VALUES(enrollment_count),
               wishlist_add_count = COALESCE(NULLIF(course_analytics_daily.wishlist_add_count, 0), VALUES(wishlist_add_count)),
               enquiry_count = course_analytics_daily.enquiry_count,
               updated_at = NOW()`,
            [courseId, dateStr, totalViews, uniqueVisitors, demoCount, wishlistCount, enrollCount]
          );

          return { aggregated: true };
        });

        if (lockResult.acquired && (lockResult.aggregated || lockResult.result?.aggregated)) {
          aggregatedRecordsCount++;
        } else if (!lockResult.acquired) {
          logger.warn({ courseId, dateStr }, 'Advisory lock busy: aggregation skipped for course/date');
        }
      }
    }

    logger.info({ processedDatesCount: datesToProcess.length, aggregatedRecordsCount }, 'Completed analytics_aggregate cron job');
    return { processedDatesCount: datesToProcess.length, aggregatedRecordsCount };
  });
}

export default {
  runAnalyticsAggregateJob,
};
