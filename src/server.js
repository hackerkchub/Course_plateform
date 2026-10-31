import app from './app.js';
import { env } from './config/env.js';
import logger from './config/logger.js';
import { closePool } from './config/db.js';
import { initCronJobs, stopCronJobs } from './jobs/scheduler.js';

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info({
    msg: `🚀 Course Platform Backend server running on port ${PORT}`,
    port: PORT,
    environment: env.NODE_ENV,
    url: `http://localhost:${PORT}/api/health`,
  });

  // Start background cron jobs in non-test environments
  if (env.NODE_ENV !== 'test') {
    initCronJobs();
  }
});

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  logger.info({ msg: `Received ${signal}. Shutting down gracefully...` });

  // Stop background cron jobs
  stopCronJobs();

  server.close(async () => {
    logger.info({ msg: 'HTTP server closed.' });
    try {
      await closePool();
      logger.info({ msg: 'Database pool closed cleanly. Process exiting.' });
      process.exit(0);
    } catch (err) {
      logger.error({ msg: 'Error closing database pool during shutdown', error: err.message });
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds timeout
  setTimeout(() => {
    logger.error({ msg: 'Forced shutdown after timeout.' });
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { server };
export default server;

