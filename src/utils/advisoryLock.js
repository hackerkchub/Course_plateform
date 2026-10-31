/**
 * MariaDB Named Advisory Lock Helpers for Course Platform Backend
 * Provides strict connection lifecycle management for distributed multi-instance safety.
 * Guarantees that:
 * 1. Dedicated connection is obtained from pool.
 * 2. GET_LOCK and RELEASE_LOCK execute on the exact same physical connection.
 * 3. Lock is held open throughout the entire transaction / worker execution.
 * 4. Lock is released before connection is returned to the pool.
 */

import { getPool } from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Executes a worker function under a shared course/date advisory lock.
 * Coordinated across view ingestion, analytics aggregation, and views retention.
 * Lock key: course_platform_views_rw_${courseId}_${dateStr}
 *
 * @param {number|string} courseId
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {number} timeoutSec Timeout in seconds
 * @param {Function} workerFn async (connection) => any
 * @returns {Promise<{ acquired: boolean, result?: any, reason?: string }>}
 */
export async function withCourseViewLock(courseId, dateStr, timeoutSec = 2, workerFn) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const lockKey = `course_platform_views_rw_${courseId}_${dateStr}`;
  let lockAcquired = false;

  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [lockKey, timeoutSec]);
    if (!rows || !rows[0] || rows[0].acquired !== 1) {
      logger.warn({ lockKey, timeoutSec }, 'Failed to acquire course view advisory lock');
      return { acquired: false, reason: 'lock_busy' };
    }

    lockAcquired = true;
    const result = await workerFn(connection);
    return {
      acquired: true,
      ...(result && typeof result === 'object' ? result : {}),
      result,
    };
  } catch (error) {
    logger.error({ lockKey, err: error.message }, 'Error during locked course view execution');
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]);
      } catch (releaseErr) {
        logger.warn({ lockKey, err: releaseErr.message }, 'Error releasing course view advisory lock');
      }
    }
    connection.release();
  }
}

/**
 * Executes a background job under a mutually exclusive job advisory lock.
 * Lock key: course_platform_cron_${jobName}
 * Non-blocking: timeout = 0.
 *
 * @param {string} jobName Name of the cron job
 * @param {Function} workerFn async (connection) => any
 * @returns {Promise<{ skipped: boolean, result?: any, reason?: string, [key: string]: any }>}
 */
export async function withJobLock(jobName, workerFn) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const lockKey = `course_platform_cron_${jobName}`;
  let lockAcquired = false;

  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockKey]);
    if (!rows || !rows[0] || rows[0].acquired !== 1) {
      logger.info({ job: jobName }, 'Job lock held by another instance; skipping execution');
      return { skipped: true, reason: 'locked' };
    }

    lockAcquired = true;
    logger.info({ job: jobName }, 'Acquired job advisory lock; running job');
    const result = await workerFn(connection);
    return {
      skipped: false,
      ...(result && typeof result === 'object' ? result : {}),
      result,
    };
  } catch (error) {
    logger.error({ job: jobName, err: error.message }, 'Scheduled job execution failed');
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]);
      } catch (releaseErr) {
        logger.warn({ job: jobName, err: releaseErr.message }, 'Error releasing job advisory lock');
      }
    }
    connection.release();
  }
}

export default {
  withCourseViewLock,
  withJobLock,
};
