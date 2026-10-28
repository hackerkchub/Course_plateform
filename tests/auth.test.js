import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import {
  setGoogleTokenVerifierForTesting,
  resetGoogleTokenVerifierForTesting,
} from '../src/config/google.js';
import { generateAccessToken } from '../src/utils/token.js';
import { authorize } from '../src/middleware/authorize.js';
import { authenticate } from '../src/middleware/authenticate.js';

describe('Phase 4: Google Authentication, Token Rotation & Authorization Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();
  const syntheticUsers = [];

  // Helper to extract cookie value by name from set-cookie headers
  function getCookieValue(res, name) {
    const cookies = res.headers['set-cookie'];
    if (!cookies) return null;
    for (const cookie of cookies) {
      if (cookie.startsWith(`${name}=`)) {
        return cookie.split(';')[0].split('=')[1];
      }
    }
    return null;
  }

  before(async () => {
    // Verify connected database is strictly course_platform_db
    const [dbCheck] = await pool.query('SELECT DATABASE() as current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');
  });

  after(async () => {
    resetGoogleTokenVerifierForTesting();

    // Clean up all synthetic test users created during this run
    if (syntheticUsers.length > 0) {
      const placeholders = syntheticUsers.map(() => '?').join(',');
      await pool.query(`DELETE FROM users WHERE email IN (${placeholders})`, syntheticUsers);
    }

    await closePool();
  });

  beforeEach(() => {
    resetGoogleTokenVerifierForTesting();
  });

  describe('1. Google Login & Token Issuance (POST /api/auth/google)', () => {
    it('should successfully register and login a new user with valid Google claims', async () => {
      const email = `newuser_${testRunId}@test.com`;
      const googleId = `gid_${testRunId}_1`;
      syntheticUsers.push(email);

      setGoogleTokenVerifierForTesting((token) => {
        if (token === 'valid_token_1') {
          return {
            google_id: googleId,
            email,
            name: 'Test New User',
            avatar_url: 'https://lh3.googleusercontent.com/test1',
            email_verified: true,
          };
        }
        throw new Error('Invalid token');
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'valid_token_1' })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Login successful');
      assert.strictEqual(res.body.data.user.email, email);
      assert.strictEqual(res.body.data.user.role, 'user');
      assert.strictEqual(res.body.data.user.name, 'Test New User');

      // Verify HTTP-only cookies
      const accessTokenCookie = getCookieValue(res, 'access_token');
      const refreshTokenCookie = getCookieValue(res, 'refresh_token');
      assert.ok(accessTokenCookie, 'access_token cookie must be set');
      assert.ok(refreshTokenCookie, 'refresh_token cookie must be set');

      // Verify database record
      const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].google_id, googleId);
      assert.strictEqual(rows[0].role, 'user');
      assert.strictEqual(rows[0].status, 'active');
    });

    it('should reject login if id_token is missing or empty (400)', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({})
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Validation failed');
    });

    it('should reject login if Google token is invalid or fails verification (400)', async () => {
      setGoogleTokenVerifierForTesting(() => {
        throw new Error('Invalid Google ID token');
      });

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'bad_token' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Invalid'));
    });

    it('should reject login if Google email is not verified (400)', async () => {
      setGoogleTokenVerifierForTesting(() => ({
        google_id: 'gid_unverified',
        email: 'unverified@test.com',
        name: 'Unverified',
        avatar_url: null,
        email_verified: false,
      }));

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'unverified_token' })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('not verified'));
    });

    it('should safely link pre-provisioned user by email and PRESERVE assigned role', async () => {
      const email = `counsellor_${testRunId}@test.com`;
      const googleId = `gid_counsellor_${testRunId}`;
      syntheticUsers.push(email);

      // Pre-provision user in DB with role 'counsellor' and google_id = NULL
      await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified, google_id) VALUES (?, ?, 'counsellor', 'active', TRUE, NULL)",
        ['Staff Member', email]
      );

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Staff Member From Google',
        avatar_url: 'https://lh3.googleusercontent.com/avatar',
        email_verified: true,
      }));

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'counsellor_token' })
        .expect(200);

      assert.strictEqual(res.body.data.user.role, 'counsellor', 'Role must remain counsellor, not reset to user');

      // Verify database updated with google_id while retaining role
      const [rows] = await pool.query('SELECT role, google_id FROM users WHERE email = ?', [email]);
      assert.strictEqual(rows[0].role, 'counsellor');
      assert.strictEqual(rows[0].google_id, googleId);
    });

    it('should reject login if email already linked to a different google_id (409)', async () => {
      const email = `existing_${testRunId}@test.com`;
      syntheticUsers.push(email);

      // Pre-insert user with google_id 'existing_gid'
      await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified, google_id) VALUES (?, ?, 'user', 'active', TRUE, 'existing_gid')",
        ['Existing User', email]
      );

      // Attempt to login with different google_id
      setGoogleTokenVerifierForTesting(() => ({
        google_id: 'different_new_gid',
        email,
        name: 'Attacker Impersonator',
        avatar_url: null,
        email_verified: true,
      }));

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'different_token' })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already associated with a different Google account'));
    });

    it('should reject login if user account is blocked (403)', async () => {
      const email = `blocked_${testRunId}@test.com`;
      const googleId = `gid_blocked_${testRunId}`;
      syntheticUsers.push(email);

      // Pre-insert blocked user
      await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified, google_id) VALUES (?, ?, 'user', 'blocked', TRUE, ?)",
        ['Blocked User', email, googleId]
      );

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Blocked User',
        avatar_url: null,
        email_verified: true,
      }));

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'blocked_token' })
        .expect(403);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('blocked'));
    });
  });

  describe('2. Refresh Token Rotation & Replay Attack Defense (POST /api/auth/refresh)', () => {
    it('should successfully rotate refresh token and issue new access token', async () => {
      const email = `refresh_test_${testRunId}@test.com`;
      const googleId = `gid_refresh_${testRunId}`;
      syntheticUsers.push(email);

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Refresh Tester',
        avatar_url: null,
        email_verified: true,
      }));

      // Initial login
      const loginRes = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'test_token' })
        .expect(200);

      const initialRefreshToken = getCookieValue(loginRes, 'refresh_token');
      assert.ok(initialRefreshToken);

      // Call refresh endpoint with cookie
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${initialRefreshToken}`])
        .expect(200);

      assert.strictEqual(refreshRes.body.success, true);
      assert.strictEqual(refreshRes.body.message, 'Token refreshed');

      const newRefreshToken = getCookieValue(refreshRes, 'refresh_token');
      const newAccessToken = getCookieValue(refreshRes, 'access_token');
      assert.ok(newRefreshToken);
      assert.ok(newAccessToken);
      assert.notStrictEqual(newRefreshToken, initialRefreshToken, 'Old refresh token must be rotated');

      // Attempting to use the OLD (already rotated/revoked) token must trigger replay attack detection!
      const replayRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${initialRefreshToken}`])
        .expect(401);

      assert.strictEqual(replayRes.body.success, false);
      assert.ok(replayRes.body.message.includes('Token reuse detected'));

      // The new refresh token should ALSO now be invalidated because all user sessions were revoked upon replay!
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${newRefreshToken}`])
        .expect(401);
    });

    it('should return 401 if refresh cookie is missing', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Refresh token required');
    });

    it('should return 401 if refresh token is not found in database', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refresh_token=nonexistent_token_string_value'])
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid refresh token');
    });
  });

  describe('3. User Profile & Profile Update (GET /api/auth/me & PATCH /api/auth/me)', () => {
    let authCookie = null;
    let testUserId = null;

    before(async () => {
      const email = `profile_user_${testRunId}@test.com`;
      const googleId = `gid_profile_${testRunId}`;
      syntheticUsers.push(email);

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Profile Tester',
        avatar_url: null,
        email_verified: true,
      }));

      const res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'login_token' })
        .expect(200);

      authCookie = `access_token=${getCookieValue(res, 'access_token')}`;
      testUserId = res.body.data.user.id;
    });

    it('GET /api/auth/me should return current user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [authCookie])
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.id, testUserId);
      assert.strictEqual(res.body.data.name, 'Profile Tester');
      assert.strictEqual(res.body.data.role, 'user');
      assert.strictEqual(res.body.data.status, 'active');
      assert.strictEqual(res.body.data.phone_verified, false);
    });

    it('GET /api/auth/me should return 401 if access token cookie is missing', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Authentication required');
    });

    it('PATCH /api/auth/me should update name and phone with regex validation', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Cookie', [authCookie])
        .send({
          name: 'Updated Name',
          phone: '9876543210',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.name, 'Updated Name');
      assert.strictEqual(res.body.data.phone, '9876543210');
      assert.strictEqual(res.body.data.phone_verified, false, 'phone_verified must be false upon phone update');
    });

    it('PATCH /api/auth/me should reject invalid phone format (400)', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Cookie', [authCookie])
        .send({
          phone: '12345', // Invalid
        })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Validation failed');
    });

    it('PATCH /api/auth/me must not allow altering role or email', async () => {
      const res = await request(app)
        .patch('/api/auth/me')
        .set('Cookie', [authCookie])
        .send({
          name: 'Privilege Escalation Attempt',
          role: 'super_admin', // Should be ignored by schema/service
          email: 'hacked@test.com',
        })
        .expect(200);

      assert.strictEqual(res.body.data.role, 'user', 'Role must remain user');

      const [rows] = await pool.query('SELECT role, email FROM users WHERE id = ?', [testUserId]);
      assert.strictEqual(rows[0].role, 'user');
      assert.notStrictEqual(rows[0].email, 'hacked@test.com');
    });
  });

  describe('4. Logout & Logout-All (POST /api/auth/logout & POST /api/auth/logout-all)', () => {
    it('POST /api/auth/logout should revoke refresh token and clear cookies', async () => {
      const email = `logout_user_${testRunId}@test.com`;
      const googleId = `gid_logout_${testRunId}`;
      syntheticUsers.push(email);

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Logout User',
        avatar_url: null,
        email_verified: true,
      }));

      const loginRes = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'token' })
        .expect(200);

      const accessCookie = `access_token=${getCookieValue(loginRes, 'access_token')}`;
      const refreshCookie = `refresh_token=${getCookieValue(loginRes, 'refresh_token')}`;

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [accessCookie, refreshCookie])
        .expect(200);

      assert.strictEqual(logoutRes.body.success, true);
      assert.strictEqual(logoutRes.body.message, 'Logged out successfully');

      // Check cookies cleared (max-age 0 or expired)
      const clearedAccess = logoutRes.headers['set-cookie'].some(c => c.includes('access_token=;') || c.includes('Max-Age=0'));
      assert.ok(clearedAccess, 'access_token cookie must be cleared');

      // Attempting to refresh with the logged-out refresh token must fail
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie])
        .expect(401);
    });

    it('POST /api/auth/logout-all should revoke all sessions across devices', async () => {
      const email = `logoutall_user_${testRunId}@test.com`;
      const googleId = `gid_logoutall_${testRunId}`;
      syntheticUsers.push(email);

      setGoogleTokenVerifierForTesting(() => ({
        google_id: googleId,
        email,
        name: 'Multi Device User',
        avatar_url: null,
        email_verified: true,
      }));

      // Login device 1
      const dev1Res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'token' })
        .expect(200);
      const dev1Refresh = getCookieValue(dev1Res, 'refresh_token');

      // Login device 2
      const dev2Res = await request(app)
        .post('/api/auth/google')
        .send({ id_token: 'token' })
        .expect(200);
      const dev2Access = `access_token=${getCookieValue(dev2Res, 'access_token')}`;
      const dev2Refresh = getCookieValue(dev2Res, 'refresh_token');

      // Logout from all devices via device 2
      await request(app)
        .post('/api/auth/logout-all')
        .set('Cookie', [dev2Access])
        .expect(200);

      // Both refresh tokens must now be rejected
      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${dev1Refresh}`])
        .expect(401);

      await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${dev2Refresh}`])
        .expect(401);
    });
  });

  describe('5. Role-Based Authorization Middleware (authorize)', () => {
    it('should allow user with required role to access protected route', () => {
      const req = { user: { id: 1, role: 'admin' } };
      let nextCalled = false;
      const next = (err) => {
        assert.strictEqual(err, undefined);
        nextCalled = true;
      };

      const guard = authorize('admin', 'super_admin');
      guard(req, {}, next);
      assert.strictEqual(nextCalled, true);
    });

    it('should return 403 Forbidden when user role is not in allowed list', () => {
      const req = { user: { id: 2, role: 'user' } };
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          responseBody = body;
          return this;
        },
      };

      const guard = authorize('counsellor', 'admin', 'super_admin');
      guard(req, res, () => {
        assert.fail('Should not call next when forbidden');
      });

      assert.strictEqual(statusCode, 403);
      assert.strictEqual(responseBody.success, false);
      assert.ok(responseBody.message.includes('Forbidden'));
    });

    it('should return 401 Unauthorized when req.user is missing in authorize guard', () => {
      const req = {};
      let statusCode = null;
      let responseBody = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(body) {
          responseBody = body;
          return this;
        },
      };

      const guard = authorize('admin');
      guard(req, res, () => {
        assert.fail('Should not call next when unauthenticated');
      });

      assert.strictEqual(statusCode, 401);
      assert.strictEqual(responseBody.success, false);
      assert.strictEqual(responseBody.message, 'Authentication required');
    });
  });

  describe('6. Authorization via Authorization: Bearer Header', () => {
    it('should accept valid access token passed via Authorization Bearer header', async () => {
      const email = `bearer_${testRunId}@test.com`;
      syntheticUsers.push(email);

      const [res] = await pool.query(
        "INSERT INTO users (name, email, role, status, email_verified) VALUES ('Bearer Tester', ?, 'user', 'active', TRUE)",
        [email]
      );
      const userId = res.insertId;

      const token = generateAccessToken({ id: userId, role: 'user' });

      const profileRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      assert.strictEqual(profileRes.body.success, true);
      assert.strictEqual(profileRes.body.data.id, userId);
    });

    it('should reject malformed Bearer token with 401', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload')
        .expect(401);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Invalid or expired access token');
    });
  });
});
