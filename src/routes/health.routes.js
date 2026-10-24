import express from 'express';
import { env } from '../config/env.js';
import { checkDbHealth } from '../config/db.js';
import { sendSuccess } from '../utils/response.js';

const router = express.Router();

function getKolkataISOString() {
  const now = new Date();
  const options = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  return now.toLocaleString('sv-SE', options).replace(' ', 'T') + '+05:30';
}

/**
 * Basic server health endpoint
 * GET /api/health
 */
router.get('/', (req, res) => {
  return sendSuccess(res, 'Course Platform API is healthy', {
    status: 'up',
    uptime: Math.floor(process.uptime()),
    timestamp: getKolkataISOString(),
    environment: env.NODE_ENV,
    version: '1.0.0',
  });
});

/**
 * Database connectivity and readiness check
 * GET /api/health/db
 */
router.get('/db', async (req, res) => {
  const dbHealth = await checkDbHealth();

  if (dbHealth.status === 'up') {
    return sendSuccess(res, 'Database connection is healthy', dbHealth, 200);
  }

  // If database is not reachable, return 503 Service Unavailable
  return res.status(503).json({
    success: false,
    message: 'Database is currently unreachable',
    data: dbHealth,
  });
});

export { router };
export default router;

