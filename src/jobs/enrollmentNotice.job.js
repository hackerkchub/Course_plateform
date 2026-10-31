import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the daily enrollment expiring notice job at 8:00 AM.
 * Queues notifications for students whose course access expires within the next 7 days.
 * Idempotently checked via JSON_EXTRACT on payload.enrollment_id with a 7-day lookback window.
 *
 * @returns {Promise<{ skipped: boolean, queuedCount?: number, reason?: string }>}
 */
export async function runEnrollmentNoticeJob() {
  return await withJobLock('enrollment_expiring_notice', async (connection) => {
    logger.info('Starting enrollment_expiring_notice cron job execution');

    const [expiringEnrollments] = await connection.query(
      `SELECT ce.id AS enrollment_id, ce.user_id, ce.course_id, ce.access_expires_at, u.email
       FROM course_enrollments ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.enrollment_status = 'active'
         AND ce.access_expires_at > NOW()
         AND ce.access_expires_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)`
    );

    let queuedCount = 0;

    for (const item of expiringEnrollments) {
      // 1. Idempotency check: verify notification was not already queued in past 7 days
      const [existing] = await connection.query(
        `SELECT id FROM notifications
         WHERE type = 'enrollment_expiring'
           AND user_id = ?
           AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.enrollment_id')) = ?
           AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
         LIMIT 1`,
        [item.user_id, String(item.enrollment_id)]
      );

      if (existing.length > 0) {
        continue; // Already notified within this expiration window
      }

      // 2. Queue in-app notification
      const payload = JSON.stringify({
        enrollment_id: item.enrollment_id,
        course_id: item.course_id,
        access_expires_at: item.access_expires_at instanceof Date
          ? item.access_expires_at.toISOString()
          : String(item.access_expires_at),
      });

      const recipient = item.email || `user_${item.user_id}`;

      await connection.query(
        `INSERT INTO notifications (user_id, type, channel, recipient, payload, status, created_at, updated_at)
         VALUES (?, 'enrollment_expiring', 'inapp', ?, ?, 'queued', NOW(), NOW())`,
        [item.user_id, recipient, payload]
      );

      queuedCount++;
    }

    logger.info({ queuedCount, scannedCount: expiringEnrollments.length }, 'Completed enrollment_expiring_notice cron job');
    return { queuedCount };
  });
}

export default {
  runEnrollmentNoticeJob,
};
