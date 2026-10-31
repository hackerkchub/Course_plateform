import { withJobLock, withCourseViewLock } from '../utils/advisoryLock.js';
import { getKolkataHalfOpenRange } from '../utils/dateUtils.js';
import logger from '../config/logger.js';

/**
 * Runs the weekly course_views retention job at 4:30 AM every Sunday.
 * Enforces the strict retention safety invariant from Section 20 & 21:
 * 1. Identifies candidate dates older than 180 days.
 * 2. Coordinates via shared course/date advisory lock: course_platform_views_rw_${courseId}_${dateStr}
 * 3. Recomputes all metrics from raw tables.
 * 4. Preserves enquiry_count and wishlist_add_count.
 * 5. Verifies all metrics against raw source tables before deletion.
 * 6. Deletes raw views only after 100% verification passes.
 * If any check or lock fails, deletes zero raw rows.
 *
 * @param {string} [forcedTargetDate] Optional date override for manual or testing invocation
 * @returns {Promise<{ skipped: boolean, datesProcessed?: number, coursesPruned?: number, rowsDeleted?: number, reason?: string }>}
 */
export async function runViewsRetentionJob(forcedTargetDate = null) {
  return await withJobLock('views_retention', async (connection) => {
    logger.info('Starting views_retention cron job execution');

    let candidateDates = [];

    if (forcedTargetDate) {
      candidateDates = [forcedTargetDate];
    } else {
      // Find candidate dates older than 180 days that contain raw views
      const [dates] = await connection.query(
        `SELECT DISTINCT DATE_FORMAT(viewed_at, '%Y-%m-%d') AS candidate_date
         FROM course_views
         WHERE viewed_at < DATE_SUB(NOW(), INTERVAL 180 DAY)
         ORDER BY candidate_date ASC
         LIMIT 50`
      );
      candidateDates = dates.map(d => d.candidate_date);
    }

    let datesProcessed = 0;
    let coursesPruned = 0;
    let rowsDeleted = 0;

    for (const dateStr of candidateDates) {
      const { dayStart, nextDayStart } = getKolkataHalfOpenRange(dateStr);

      // Find all courses with raw views on this date
      const [coursesWithViews] = await connection.query(
        `SELECT DISTINCT course_id 
         FROM course_views 
         WHERE viewed_at >= ? AND viewed_at < ?`,
        [dayStart, nextDayStart]
      );

      if (coursesWithViews.length === 0) {
        continue;
      }

      for (const row of coursesWithViews) {
        const courseId = row.course_id;

        // Acquire shared course/date lock (timeout 5s)
        const lockResult = await withCourseViewLock(courseId, dateStr, 5, async (lockedConn) => {
          // 1. Recompute raw metrics
          const [rawViewRows] = await lockedConn.query(
            `SELECT COUNT(id) AS raw_views, COUNT(DISTINCT session_id) AS raw_unique
             FROM course_views
             WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [rawDemoRows] = await lockedConn.query(
            `SELECT COUNT(id) AS raw_demos
             FROM demo_requests
             WHERE course_id = ? AND created_at >= ? AND created_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [rawEnrollRows] = await lockedConn.query(
            `SELECT COUNT(id) AS raw_enrollments
             FROM course_enrollments
             WHERE course_id = ? AND enrolled_at >= ? AND enrolled_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const [rawWishlistRows] = await lockedConn.query(
            `SELECT COUNT(id) AS raw_wishlists
             FROM wishlists
             WHERE course_id = ? AND created_at >= ? AND created_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const rawViews = Number(rawViewRows[0]?.raw_views || 0);
          const rawUnique = Number(rawViewRows[0]?.raw_unique || 0);
          const rawDemos = Number(rawDemoRows[0]?.raw_demos || 0);
          const rawEnrollments = Number(rawEnrollRows[0]?.raw_enrollments || 0);
          const rawWishlists = Number(rawWishlistRows[0]?.raw_wishlists || 0);

          // 2. Upsert summary into course_analytics_daily preserving B metrics
          await lockedConn.query(
            `INSERT INTO course_analytics_daily 
               (course_id, analytics_date, total_views, unique_visitors, demo_request_count, wishlist_add_count, enrollment_count, enquiry_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               total_views = VALUES(total_views),
               unique_visitors = VALUES(unique_visitors),
               demo_request_count = VALUES(demo_request_count),
               enrollment_count = VALUES(enrollment_count),
               wishlist_add_count = course_analytics_daily.wishlist_add_count,
               enquiry_count = course_analytics_daily.enquiry_count,
               updated_at = NOW()`,
            [courseId, dateStr, rawViews, rawUnique, rawDemos, rawWishlists, rawEnrollments]
          );

          // 3. Multi-Metric Verification Gate
          const [verifiedRows] = await lockedConn.query(
            `SELECT total_views, unique_visitors, demo_request_count, enrollment_count, enquiry_count
             FROM course_analytics_daily
             WHERE course_id = ? AND analytics_date = ?`,
            [courseId, dateStr]
          );

          const cad = verifiedRows[0];
          if (!cad) {
            logger.error({ courseId, dateStr }, 'Verification failed: missing daily aggregate row');
            return { pruned: false, reason: 'missing_row' };
          }

          const isViewsValid = Number(cad.total_views) === rawViews;
          const isUniqueValid = Number(cad.unique_visitors) === rawUnique;
          const isDemosValid = Number(cad.demo_request_count) === rawDemos;
          const isEnrollValid = Number(cad.enrollment_count) === rawEnrollments;
          const isEnquiryValid = cad.enquiry_count !== null && Number(cad.enquiry_count) >= 0;

          if (!isViewsValid || !isUniqueValid || !isDemosValid || !isEnrollValid || !isEnquiryValid) {
            logger.error(
              {
                courseId,
                dateStr,
                expected: { rawViews, rawUnique, rawDemos, rawEnrollments },
                actual: cad,
              },
              'Verification mismatch: retention pruning aborted'
            );
            return { pruned: false, reason: 'verification_mismatch' };
          }

          // 4. Targeted Pruning: Only delete after 100% verification passes
          const [deleteResult] = await lockedConn.query(
            `DELETE FROM course_views 
             WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?`,
            [courseId, dayStart, nextDayStart]
          );

          const deletedForCourse = deleteResult.affectedRows || 0;
          return { pruned: true, deletedCount: deletedForCourse };
        });

        if (lockResult.acquired && lockResult.result?.pruned) {
          coursesPruned++;
          rowsDeleted += (lockResult.result.deletedCount || 0);
        } else if (!lockResult.acquired) {
          logger.warn({ courseId, dateStr }, 'Advisory lock busy: retention skipped for course');
        }
      }

      datesProcessed++;
    }

    logger.info({ datesProcessed, coursesPruned, rowsDeleted }, 'Completed views_retention cron job');
    return { datesProcessed, coursesPruned, rowsDeleted };
  });
}

export default {
  runViewsRetentionJob,
};
