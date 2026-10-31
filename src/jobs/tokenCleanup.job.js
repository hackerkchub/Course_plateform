import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the daily token cleanup job at 3:00 AM.
 * Purges expired and revoked refresh tokens from refresh_tokens table.
 *
 * @returns {Promise<{ skipped: boolean, deletedCount?: number, reason?: string }>}
 */
export async function runTokenCleanupJob() {
  return await withJobLock('token_cleanup', async (connection) => {
    logger.info('Starting token_cleanup cron job execution');

    const [result] = await connection.query(
      `DELETE FROM refresh_tokens 
       WHERE revoked_at IS NOT NULL 
          OR expires_at < NOW()`
    );

    const deletedCount = result.affectedRows || 0;
    logger.info({ deletedCount }, 'Completed token_cleanup cron job');
    return { deletedCount };
  });
}

export default {
  runTokenCleanupJob,
};
