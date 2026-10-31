import cron from 'node-cron';
import logger from '../config/logger.js';
import { runOfferExpiryJob } from './offerExpiry.job.js';
import { runAnalyticsAggregateJob } from './analyticsAggregate.job.js';
import { runEnrollmentExpiryJob } from './enrollmentExpiry.job.js';
import { runEnrollmentNoticeJob } from './enrollmentNotice.job.js';
import { runDemoReminderJob } from './demoReminder.job.js';
import { runTokenCleanupJob } from './tokenCleanup.job.js';
import { runViewsRetentionJob } from './viewsRetention.job.js';
import { runRatingResyncJob } from './ratingResync.job.js';

const KOLKATA_TIMEZONE = 'Asia/Kolkata';

// Cron Schedules matching Section 15.5 staggered load profile
export const CRON_SCHEDULES = {
  OFFER_EXPIRY: '0 * * * *',           // Hourly at :00
  ANALYTICS_AGGREGATE: '0 2 * * *',    // 2:00 AM Daily
  ENROLLMENT_EXPIRY: '0 1 * * *',      // 1:00 AM Daily
  ENROLLMENT_NOTICE: '0 8 * * *',      // 8:00 AM Daily
  DEMO_REMINDER: '*/10 * * * *',       // Every 10 minutes
  TOKEN_CLEANUP: '0 3 * * *',          // 3:00 AM Daily
  VIEWS_RETENTION: '30 4 * * 0',       // 4:30 AM Sunday
  RATING_RESYNC: '0 4 * * *',          // 4:00 AM Daily
};

const activeCronTasks = [];

/**
 * Initializes and starts all 8 background cron jobs with Asia/Kolkata timezone.
 */
export function initCronJobs() {
  logger.info('Initializing Course Platform background cron jobs (Asia/Kolkata)...');

  const jobsToSchedule = [
    { name: 'offer_expiry', cronExp: CRON_SCHEDULES.OFFER_EXPIRY, runner: runOfferExpiryJob },
    { name: 'analytics_aggregate', cronExp: CRON_SCHEDULES.ANALYTICS_AGGREGATE, runner: runAnalyticsAggregateJob },
    { name: 'enrollment_expiry', cronExp: CRON_SCHEDULES.ENROLLMENT_EXPIRY, runner: runEnrollmentExpiryJob },
    { name: 'enrollment_expiring_notice', cronExp: CRON_SCHEDULES.ENROLLMENT_NOTICE, runner: runEnrollmentNoticeJob },
    { name: 'demo_reminder', cronExp: CRON_SCHEDULES.DEMO_REMINDER, runner: runDemoReminderJob },
    { name: 'token_cleanup', cronExp: CRON_SCHEDULES.TOKEN_CLEANUP, runner: runTokenCleanupJob },
    { name: 'views_retention', cronExp: CRON_SCHEDULES.VIEWS_RETENTION, runner: runViewsRetentionJob },
    { name: 'rating_resync', cronExp: CRON_SCHEDULES.RATING_RESYNC, runner: runRatingResyncJob },
  ];

  for (const job of jobsToSchedule) {
    try {
      const task = cron.schedule(
        job.cronExp,
        async () => {
          try {
            logger.info({ job: job.name }, `Triggering scheduled cron job: ${job.name}`);
            await job.runner();
          } catch (err) {
            logger.error({ job: job.name, err: err.message }, `Error in scheduled cron job: ${job.name}`);
          }
        },
        {
          scheduled: true,
          timezone: KOLKATA_TIMEZONE,
        }
      );

      activeCronTasks.push({ name: job.name, task });
      logger.info({ job: job.name, schedule: job.cronExp }, `Scheduled ${job.name}`);
    } catch (scheduleErr) {
      logger.error({ job: job.name, err: scheduleErr.message }, `Failed to schedule cron job: ${job.name}`);
    }
  }

  logger.info({ totalScheduled: activeCronTasks.length }, 'All background cron jobs successfully initialized.');
  return activeCronTasks;
}

/**
 * Stops all scheduled background cron jobs cleanly on server shutdown.
 */
export function stopCronJobs() {
  logger.info({ count: activeCronTasks.length }, 'Stopping active background cron tasks...');
  for (const item of activeCronTasks) {
    try {
      item.task.stop();
    } catch (stopErr) {
      logger.warn({ job: item.name, err: stopErr.message }, 'Warning stopping cron task');
    }
  }
  activeCronTasks.length = 0;
  logger.info('All background cron tasks stopped.');
}

// Re-export all job runner functions for programmatic test access
export {
  runOfferExpiryJob,
  runAnalyticsAggregateJob,
  runEnrollmentExpiryJob,
  runEnrollmentNoticeJob,
  runDemoReminderJob,
  runTokenCleanupJob,
  runViewsRetentionJob,
  runRatingResyncJob,
};

export default {
  initCronJobs,
  stopCronJobs,
  CRON_SCHEDULES,
  runOfferExpiryJob,
  runAnalyticsAggregateJob,
  runEnrollmentExpiryJob,
  runEnrollmentNoticeJob,
  runDemoReminderJob,
  runTokenCleanupJob,
  runViewsRetentionJob,
  runRatingResyncJob,
};
