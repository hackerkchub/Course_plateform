import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the hourly offer expiry job.
 * Disables active offers whose ends_at timestamp has passed.
 * Mutually exclusive across instances via MariaDB advisory lock.
 *
 * @returns {Promise<{ skipped: boolean, updatedCount?: number, reason?: string }>}
 */
export async function runOfferExpiryJob() {
  return await withJobLock('offer_expiry', async (connection) => {
    logger.info('Starting offer_expiry cron job execution');

    const [result] = await connection.query(
      `UPDATE course_offers 
       SET is_active = 0, updated_at = NOW() 
       WHERE is_active = 1 
         AND ends_at IS NOT NULL 
         AND ends_at <= NOW()`
    );

    const updatedCount = result.affectedRows || 0;
    logger.info({ updatedCount }, 'Completed offer_expiry cron job');
    return { updatedCount };
  });
}

export default {
  runOfferExpiryJob,
};
