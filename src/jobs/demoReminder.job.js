import { withJobLock } from '../utils/advisoryLock.js';
import logger from '../config/logger.js';

/**
 * Runs the demo reminder cron job every 10 minutes.
 * Queues reminders for upcoming demo sessions starting within the next 60 minutes.
 * Separately and independently queues notifications for student and assigned expert.
 * Idempotently checked via JSON_EXTRACT on payload.demo_request_id per recipient.
 *
 * @returns {Promise<{ skipped: boolean, queuedCount?: number, reason?: string }>}
 */
export async function runDemoReminderJob() {
  return await withJobLock('demo_reminder', async (connection) => {
    logger.info('Starting demo_reminder cron job execution');

    const [upcomingDemos] = await connection.query(
      `SELECT dr.id AS demo_request_id, dr.user_id, dr.course_id, dr.assigned_to AS expert_id, 
              dr.email, dr.scheduled_at, dr.meeting_link,
              u_exp.email AS expert_email
       FROM demo_requests dr
       LEFT JOIN users u_exp ON u_exp.id = dr.assigned_to
       WHERE dr.status = 'scheduled'
         AND dr.scheduled_at > NOW()
         AND dr.scheduled_at <= DATE_ADD(NOW(), INTERVAL 60 MINUTE)`
    );

    let queuedCount = 0;

    for (const demo of upcomingDemos) {
      const scheduledAtStr = demo.scheduled_at instanceof Date 
        ? demo.scheduled_at.toISOString() 
        : String(demo.scheduled_at);

      // 1. Queue Student Reminder
      const studentRecipient = demo.email || (demo.user_id ? `user_${demo.user_id}` : 'guest');
      const [existingStudentNotif] = await connection.query(
        `SELECT id FROM notifications
         WHERE type = 'demo_reminder'
           AND (
             (user_id IS NOT NULL AND user_id = ?)
             OR recipient = ?
           )
           AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.demo_request_id')) = ?
         LIMIT 1`,
        [demo.user_id, studentRecipient, String(demo.demo_request_id)]
      );

      if (existingStudentNotif.length === 0) {
        const studentPayload = JSON.stringify({
          demo_request_id: demo.demo_request_id,
          course_id: demo.course_id,
          scheduled_at: scheduledAtStr,
          meeting_link: demo.meeting_link || null,
          role: 'student',
        });

        await connection.query(
          `INSERT INTO notifications (user_id, type, channel, recipient, payload, status, created_at, updated_at)
           VALUES (?, 'demo_reminder', 'inapp', ?, ?, 'queued', NOW(), NOW())`,
          [demo.user_id, studentRecipient, studentPayload]
        );
        queuedCount++;
      }

      // 2. Queue Expert Reminder (if expert assigned)
      if (demo.expert_id) {
        const expertRecipient = demo.expert_email || `expert_${demo.expert_id}`;
        const [existingExpertNotif] = await connection.query(
          `SELECT id FROM notifications
           WHERE type = 'demo_reminder'
             AND user_id = ?
             AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.demo_request_id')) = ?
           LIMIT 1`,
          [demo.expert_id, String(demo.demo_request_id)]
        );

        if (existingExpertNotif.length === 0) {
          const expertPayload = JSON.stringify({
            demo_request_id: demo.demo_request_id,
            course_id: demo.course_id,
            scheduled_at: scheduledAtStr,
            meeting_link: demo.meeting_link || null,
            role: 'expert',
          });

          await connection.query(
            `INSERT INTO notifications (user_id, type, channel, recipient, payload, status, created_at, updated_at)
             VALUES (?, 'demo_reminder', 'inapp', ?, ?, 'queued', NOW(), NOW())`,
            [demo.expert_id, expertRecipient, expertPayload]
          );
          queuedCount++;
        }
      }
    }

    logger.info({ queuedCount, scannedCount: upcomingDemos.length }, 'Completed demo_reminder cron job');
    return { queuedCount };
  });
}

export default {
  runDemoReminderJob,
};
