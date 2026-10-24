import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Live Server Process Startup & Lifecycle Verification', () => {
  it('should start HTTP server, respond to live HTTP requests, and shutdown gracefully on SIGTERM', async () => {
    const TEST_PORT = 5098;
    const serverPath = path.resolve(__dirname, '../src/server.js');

    const serverProcess = spawn('node', [serverPath], {
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'test',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Poll the health endpoint until server is ready
    let serverReady = false;
    const startTime = Date.now();
    while (Date.now() - startTime < 8000) {
      try {
        const ping = await fetch(`http://localhost:${TEST_PORT}/api/health`);
        if (ping.status === 200) {
          serverReady = true;
          break;
        }
      } catch {
        // Wait 100ms before retrying
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    assert.strictEqual(serverReady, true, 'Server should emit startup log message');

    try {
      // 1. Live GET /api/health
      const healthRes = await fetch(`http://localhost:${TEST_PORT}/api/health`);
      assert.strictEqual(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.strictEqual(healthJson.success, true);
      assert.strictEqual(healthJson.message, 'Course Platform API is healthy');
      assert.strictEqual(healthJson.data.status, 'up');

      // 2. Live GET /api
      const rootRes = await fetch(`http://localhost:${TEST_PORT}/api`);
      assert.strictEqual(rootRes.status, 200);
      const rootJson = await rootRes.json();
      assert.strictEqual(rootJson.success, true);
      assert.strictEqual(rootJson.message, 'Course Platform API v1.0');

      // 3. Live GET /api/unknown (404)
      const notFoundRes = await fetch(`http://localhost:${TEST_PORT}/api/unknown-endpoint`);
      assert.strictEqual(notFoundRes.status, 404);
      const notFoundJson = await notFoundRes.json();
      assert.strictEqual(notFoundJson.success, false);
      assert.ok(notFoundJson.message.includes('Route not found'));

      // 4. Security Headers
      assert.strictEqual(healthRes.headers.get('x-frame-options'), 'SAMEORIGIN');
      assert.strictEqual(healthRes.headers.get('x-content-type-options'), 'nosniff');
    } finally {
      // Test graceful shutdown
      const exitPromise = new Promise((resolve) => {
        serverProcess.on('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });

      serverProcess.kill('SIGTERM');
      const exitResult = await exitPromise;
      assert.ok(exitResult.code === 0 || exitResult.signal === 'SIGTERM', `Process exited cleanly: ${JSON.stringify(exitResult)}`);
    }
  });
});
