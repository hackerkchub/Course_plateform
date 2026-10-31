import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the daily rating resync job at 4:00 AM.
 * Recalculates rating_avg and rating_count for all published courses
 * based on approved course_reviews, repairing any potential drift.
 *
 * @returns {Promise<{ skipped: boolean, resyncedCoursesCount?: number, reason?: string }>}
 */
export async function runRatingResyncJob() {
  return await withJobLock('rating_resync', async (connection) => {
    logger.info('Starting rating_resync cron job execution');

    const [ratingStats] = await connection.query(
      `SELECT 
         c.id AS course_id,
         COALESCE(ROUND(AVG(cr.rating), 2), 0.00) AS calc_avg,
         COUNT(cr.id) AS calc_count
       FROM courses c
       LEFT JOIN course_reviews cr 
         ON cr.course_id = c.id 
        AND cr.moderation_status = 'approved'
       WHERE c.deleted_at IS NULL
       GROUP BY c.id`
    );

    let resyncedCoursesCount = 0;

    for (const stat of ratingStats) {
      await connection.query(
        `UPDATE courses 
         SET rating_avg = ?, rating_count = ? 
         WHERE id = ?`,
        [stat.calc_avg, stat.calc_count, stat.course_id]
      );
      resyncedCoursesCount++;
    }

    logger.info({ resyncedCoursesCount }, 'Completed rating_resync cron job');
    return { resyncedCoursesCount };
  });
}

export default {
  runRatingResyncJob,
};
