import mysql from 'mysql2/promise';
import { env } from './env.js';
import logger from './logger.js';

let pool = null;
let isMockMode = false;

export const ALLOWED_PRODUCTION_DATABASES = Object.freeze([
  'course_platform_db',
  'softmaxs_course_platform_db',
]);

/**
 * Validates whether a database name is allowed for the specified environment.
 * In production, only explicitly allowlisted databases are permitted.
 * @param {string} dbName
 * @param {string} nodeEnv
 * @returns {boolean}
 */
export function isAllowedDatabase(dbName, nodeEnv = env.NODE_ENV) {
  if (nodeEnv !== 'production') {
    return true;
  }
  return ALLOWED_PRODUCTION_DATABASES.includes(dbName);
}

function getPool() {
  if (isMockMode) {
    return null;
  }

  if (!pool) {
    // Strictly connect to approved databases. Guard against connecting to any other db in production
    if (env.NODE_ENV === 'production' && !ALLOWED_PRODUCTION_DATABASES.includes(env.DB_NAME)) {
      throw new Error(
        `Invalid database target: ${env.DB_NAME}. Must be one of: ${ALLOWED_PRODUCTION_DATABASES.join(', ')}`
      );
    }

    pool = mysql.createPool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      waitForConnections: true,
      connectionLimit: env.DB_CONNECTION_LIMIT,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: '+05:30', // Asia/Kolkata
    });

    logger.info({
      msg: 'MySQL connection pool initialized',
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      connectionLimit: env.DB_CONNECTION_LIMIT,
    });
  }

  return pool;
}

/**
 * Checks database connectivity and health
 * @returns {Promise<{ status: string, latencyMs: number, database: string, mock: boolean }>}
 */
async function checkDbHealth() {
  if (isMockMode) {
    return {
      status: 'up',
      latencyMs: 1,
      database: 'course_platform_db (mock)',
      mock: true,
    };
  }

  const startTime = Date.now();
  try {
    const currentPool = getPool();
    const [rows] = await currentPool.query('SELECT 1 AS health_check, DATABASE() AS current_db');
    const latencyMs = Date.now() - startTime;
    return {
      status: 'up',
      latencyMs,
      database: rows[0]?.current_db || env.DB_NAME,
      mock: false,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.warn({ msg: 'Database ping failed', error: error.message, latencyMs });
    return {
      status: 'down',
      latencyMs,
      database: env.DB_NAME,
      error: error.code || 'CONNECTION_FAILED',
      mock: false,
    };
  }
}

/**
 * Enable mock mode for testing without requiring a live MySQL server
 */
function enableMockMode() {
  isMockMode = true;
}

/**
 * Disable mock mode
 */
function disableMockMode() {
  isMockMode = false;
}

/**
 * Closes the connection pool gracefully
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL connection pool closed');
  }
}

export {
  getPool,
  checkDbHealth,
  enableMockMode,
  disableMockMode,
  closePool,
};

