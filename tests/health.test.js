import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { enableMockMode, disableMockMode } from '../src/config/db.js';
import { validateEnv } from '../src/config/env.js';

describe('Phase 2 Scaffold & Health Automated Tests', () => {
  before(() => {
    // Enable database mock mode for pure unit/scaffold verification
    enableMockMode();
  });

  after(() => {
    disableMockMode();
  });

  it('GET /api/health should return 200 with standard healthy payload', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Course Platform API is healthy');
    assert.ok(res.body.data, 'data property should be present');
    assert.strictEqual(res.body.data.status, 'up');
    assert.ok(typeof res.body.data.uptime === 'number');
    assert.ok(res.body.data.timestamp.includes('+05:30'), 'timestamp should be in Asia/Kolkata timezone (+05:30)');
    assert.strictEqual(res.body.data.version, '1.0.0');
  });

  it('GET /api/health/db should return 200 with database health status in mock mode', async () => {
    const res = await request(app)
      .get('/api/health/db')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.message, 'Database connection is healthy');
    assert.strictEqual(res.body.data.status, 'up');
    assert.strictEqual(res.body.data.mock, true);
  });

  it('GET /api should return 200 with API version info', async () => {
    const res = await request(app)
      .get('/api')
      .expect(200);

    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.message.includes('Course Platform API'));
  });

  it('GET /api/unknown-route should return 404 with standard error format', async () => {
    const res = await request(app)
      .get('/api/unknown-route')
      .expect(404);

    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Route not found'));
  });

  it('should include Helmet security headers in responses', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    // Verify presence of security headers
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-download-options'], 'noopen');
  });

  it('POST with malformed JSON body should return 400 with standard error format', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"malformed": json}')
      .expect(400);

    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.message, 'Invalid JSON payload in request body');
  });

  it('Environment validation should fail if required variables are missing', () => {
    assert.throws(
      () => {
        // Omitting JWT_ACCESS_SECRET
        validateEnv({
          PORT: 5000,
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_USER: 'root',
          DB_NAME: 'course_platform_db',
          JWT_REFRESH_SECRET: 'a'.repeat(32),
          GOOGLE_CLIENT_ID: 'test-client-id',
          SUPER_ADMIN_EMAIL: 'admin@test.com',
        });
      },
      /Environment validation failed/
    );
  });

  it('Environment validation should fail if JWT secret is shorter than 32 characters', () => {
    assert.throws(
      () => {
        validateEnv({
          PORT: 5000,
          NODE_ENV: 'test',
          DB_HOST: 'localhost',
          DB_USER: 'root',
          DB_NAME: 'course_platform_db',
          JWT_ACCESS_SECRET: 'short_secret', // Less than 32 chars
          JWT_REFRESH_SECRET: 'a'.repeat(32),
          GOOGLE_CLIENT_ID: 'test-client-id',
          SUPER_ADMIN_EMAIL: 'admin@test.com',
        });
      },
      /Environment validation failed/
    );
  });
});
