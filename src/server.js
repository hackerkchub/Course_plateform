const app = require('./app');
const { env } = require('./config/env');
const logger = require('./config/logger');
const { closePool } = require('./config/db');

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info({
    msg: `🚀 Course Platform Backend server running on port ${PORT}`,
    port: PORT,
    environment: env.NODE_ENV,
    url: `http://localhost:${PORT}/api/health`,
  });
});

// Graceful shutdown handling
async function gracefulShutdown(signal) {
  logger.info({ msg: `Received ${signal}. Shutting down gracefully...` });

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

module.exports = server;
