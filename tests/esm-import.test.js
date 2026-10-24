import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('ESM Module Import & Resolution Verification', () => {
  it('should successfully import all configuration modules', async () => {
    const envModule = await import('../src/config/env.js');
    assert.ok(envModule.env);
    assert.strictEqual(typeof envModule.validateEnv, 'function');

    const loggerModule = await import('../src/config/logger.js');
    assert.ok(loggerModule.logger || loggerModule.default);

    const dbModule = await import('../src/config/db.js');
    assert.strictEqual(typeof dbModule.getPool, 'function');
    assert.strictEqual(typeof dbModule.checkDbHealth, 'function');
  });

  it('should successfully import all utility modules', async () => {
    const responseModule = await import('../src/utils/response.js');
    assert.strictEqual(typeof responseModule.sendSuccess, 'function');
    assert.strictEqual(typeof responseModule.sendError, 'function');

    const slugModule = await import('../src/utils/slug.js');
    assert.strictEqual(typeof slugModule.generateSlug, 'function');
    assert.strictEqual(typeof slugModule.isValidSlug, 'function');

    const paginationModule = await import('../src/utils/pagination.js');
    assert.strictEqual(typeof paginationModule.parsePagination, 'function');

    const pricingModule = await import('../src/utils/pricing.js');
    assert.strictEqual(typeof pricingModule.calculateDiscountedPrice, 'function');
    assert.strictEqual(typeof pricingModule.isOfferActive, 'function');
  });

  it('should successfully import all middleware modules', async () => {
    const errorModule = await import('../src/middleware/errorHandler.js');
    assert.strictEqual(typeof errorModule.errorHandler, 'function');
    assert.ok(errorModule.AppError);

    const notFoundModule = await import('../src/middleware/notFound.js');
    assert.strictEqual(typeof notFoundModule.notFoundHandler, 'function');

    const securityModule = await import('../src/middleware/security.js');
    assert.strictEqual(typeof securityModule.helmetMiddleware, 'function');
    assert.strictEqual(typeof securityModule.corsMiddleware, 'function');

    const rateLimiterModule = await import('../src/middleware/rateLimiter.js');
    assert.strictEqual(typeof rateLimiterModule.generalRateLimiter, 'function');

    const validateModule = await import('../src/middleware/validate.js');
    assert.strictEqual(typeof validateModule.validateBody, 'function');
  });

  it('should successfully import application and routes modules', async () => {
    const healthModule = await import('../src/routes/health.routes.js');
    assert.strictEqual(typeof (healthModule.router || healthModule.default), 'function');

    const appModule = await import('../src/app.js');
    assert.strictEqual(typeof (appModule.app || appModule.default), 'function');
  });

  it('should successfully import migrations and seed runners', async () => {
    const migrationModule = await import('../migrations/runner.js');
    assert.strictEqual(typeof migrationModule.runMigrations, 'function');

    const seedModule = await import('../seeds/001_super_admin.js');
    assert.strictEqual(typeof seedModule.seedSuperAdmin, 'function');

    const seedRunnerModule = await import('../seeds/seed_runner.js');
    assert.strictEqual(typeof seedRunnerModule.runSeeds, 'function');
  });
});
