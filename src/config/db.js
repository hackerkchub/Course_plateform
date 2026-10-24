const mysql = require('mysql2/promise');
const { env } = require('./env');
const logger = require('./logger');

let pool = null;
let isMockMode = false;

function getPool() {
  if (isMockMode) {
    return null;
  }

  if (!pool) {
    // Strictly connect to course_platform_db. Guard against connecting to any other db
    if (env.DB_NAME !== 'course_platform_db' && env.NODE_ENV === 'production') {
      throw new Error(`Invalid database target: ${env.DB_NAME}. Must be course_platform_db`);
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

module.exports = {
  getPool,
  checkDbHealth,
  enableMockMode,
  disableMockMode,
  closePool,
};
