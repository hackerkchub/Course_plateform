import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the daily enrollment expiry job at 1:00 AM.
 * Marks active enrollments as 'expired' when access_expires_at has passed.
 *
 * @returns {Promise<{ skipped: boolean, expiredCount?: number, reason?: string }>}
 */
export async function runEnrollmentExpiryJob() {
  return await withJobLock('enrollment_expiry', async (connection) => {
    logger.info('Starting enrollment_expiry cron job execution');

    const [result] = await connection.query(
      `UPDATE course_enrollments 
       SET enrollment_status = 'expired', updated_at = NOW() 
       WHERE enrollment_status = 'active' 
         AND access_expires_at IS NOT NULL 
         AND access_expires_at <= NOW()`
    );

    const expiredCount = result.affectedRows || 0;
    logger.info({ expiredCount }, 'Completed enrollment_expiry cron job');
    return { expiredCount };
  });
}

export default {
  runEnrollmentExpiryJob,
};
