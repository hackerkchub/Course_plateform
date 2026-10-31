import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';
import { getKolkataDateString, getKolkataHalfOpenRange } from '../src/utils/dateUtils.js';
import { withCourseViewLock, withJobLock } from '../src/utils/advisoryLock.js';
import { runOfferExpiryJob } from '../src/jobs/offerExpiry.job.js';
import { runAnalyticsAggregateJob } from '../src/jobs/analyticsAggregate.job.js';
import { runEnrollmentExpiryJob } from '../src/jobs/enrollmentExpiry.job.js';
import { runEnrollmentNoticeJob } from '../src/jobs/enrollmentNotice.job.js';
import { runDemoReminderJob } from '../src/jobs/demoReminder.job.js';
import { runTokenCleanupJob } from '../src/jobs/tokenCleanup.job.js';
import { runViewsRetentionJob } from '../src/jobs/viewsRetention.job.js';
import { runRatingResyncJob } from '../src/jobs/ratingResync.job.js';
import { CRON_SCHEDULES } from '../src/jobs/scheduler.js';
import cron from 'node-cron';

describe('Section 19.4 Step 12: Views, Analytics, Dashboard & Cron Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();

  let adminUser = null;
  let adminToken = null;
  let studentUser = null;
  let studentToken = null;
  let expertUser = null;

  let testCategoryId = null;
  let testSubcategoryId = null;
  let testCourseId = null;
  let draftCourseId = null;

  const createdUserIds = [];
  const createdCourseIds = [];
  const createdCategoryIds = [];
  const createdSubcategoryIds = [];
  const createdViewIds = [];
  const createdOfferIds = [];
  const createdEnrollmentIds = [];
  const createdDemoIds = [];
  const createdTokenIds = [];
  const createdNotificationIds = [];
  const createdDailyAnalyticsKeys = [];

  before(async () => {
    // 1. Verify target database is strictly course_platform_db
    const [dbCheck] = await pool.query('SELECT DATABASE() AS current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');

    // 2. Create Admin Account
    const [adminResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'admin', 'active', TRUE)`,
      [`Admin_S12_${testRunId}`, `admin_s12_${testRunId}@test.com`]
    );
    adminUser = { id: adminResult.insertId, role: 'admin' };
    adminToken = generateAccessToken(adminUser);
    createdUserIds.push(adminUser.id);

    // 3. Create Student Account
    const [studentResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'user', 'active', TRUE)`,
      [`Student_S12_${testRunId}`, `student_s12_${testRunId}@test.com`]
    );
    studentUser = { id: studentResult.insertId, role: 'user' };
    studentToken = generateAccessToken(studentUser);
    createdUserIds.push(studentUser.id);

    // 4. Create Expert/Counsellor Account
    const [expertResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'counsellor', 'active', TRUE)`,
      [`Expert_S12_${testRunId}`, `expert_s12_${testRunId}@test.com`]
    );
    expertUser = { id: expertResult.insertId, role: 'counsellor' };
    createdUserIds.push(expertUser.id);

    // 5. Create Category & Subcategory
    const [catResult] = await pool.query(
      `INSERT INTO categories (name, slug, status, display_order)
       VALUES (?, ?, 'active', 1)`,
      [`Cat_S12_${testRunId}`, `cat-s12-${testRunId}`]
    );
    testCategoryId = catResult.insertId;
    createdCategoryIds.push(testCategoryId);

    const [subResult] = await pool.query(
      `INSERT INTO subcategories (category_id, name, slug, status, display_order)
       VALUES (?, ?, ?, 'active', 1)`,
      [testCategoryId, `Sub_S12_${testRunId}`, `sub-s12-${testRunId}`]
    );
    testSubcategoryId = subResult.insertId;
    createdSubcategoryIds.push(testSubcategoryId);

    // 6. Create Published Course
    const [courseResult] = await pool.query(
      `INSERT INTO courses (
         category_id, subcategory_id, course_code, course_name, slug,
         short_description, description, course_level, language, mode,
         status, is_free, price, total_views, unique_visitors, enquiry_count, wishlist_count, share_count, enrollment_count, published_at
       ) VALUES (
         ?, ?, ?, ?, ?,
         'Step 12 test course', 'Step 12 test course details', 'beginner', 'English', 'online',
         'published', FALSE, 4999.00, 0, 0, 0, 0, 0, 0, NOW()
       )`,
      [testCategoryId, testSubcategoryId, `CRS-S12-${testRunId}`, `Course_S12_${testRunId}`, `course-s12-${testRunId}`]
    );
    testCourseId = courseResult.insertId;
    createdCourseIds.push(testCourseId);

    // 7. Create Draft Course (for unpublished test)
    const [draftResult] = await pool.query(
      `INSERT INTO courses (
         category_id, subcategory_id, course_code, course_name, slug,
         short_description, description, course_level, language, mode,
         status, is_free, price
       ) VALUES (
         ?, ?, ?, ?, ?,
         'Step 12 draft course', 'Step 12 draft details', 'beginner', 'English', 'online',
         'draft', FALSE, 2999.00
       )`,
      [testCategoryId, testSubcategoryId, `DFT-S12-${testRunId}`, `Draft_S12_${testRunId}`, `draft-s12-${testRunId}`]
    );
    draftCourseId = draftResult.insertId;
    createdCourseIds.push(draftCourseId);
  });

  after(async () => {
    try {
      // Clean up created records cleanly
      if (createdNotificationIds.length > 0) {
        await pool.query(`DELETE FROM notifications WHERE id IN (?)`, [createdNotificationIds]);
      }
      if (createdTokenIds.length > 0) {
        await pool.query(`DELETE FROM refresh_tokens WHERE id IN (?)`, [createdTokenIds]);
      }
      if (createdEnrollmentIds.length > 0) {
        await pool.query(`DELETE FROM course_enrollments WHERE id IN (?)`, [createdEnrollmentIds]);
      }
      if (createdDemoIds.length > 0) {
        await pool.query(`DELETE FROM demo_requests WHERE id IN (?)`, [createdDemoIds]);
      }
      if (createdOfferIds.length > 0) {
        await pool.query(`DELETE FROM course_offers WHERE id IN (?)`, [createdOfferIds]);
      }
      if (createdDailyAnalyticsKeys.length > 0) {
        for (const k of createdDailyAnalyticsKeys) {
          await pool.query(`DELETE FROM course_analytics_daily WHERE course_id = ? AND analytics_date = ?`, [k.courseId, k.dateStr]);
        }
      }
      if (createdCourseIds.length > 0) {
        await pool.query(`DELETE FROM course_views WHERE course_id IN (?)`, [createdCourseIds]);
        await pool.query(`DELETE FROM course_reviews WHERE course_id IN (?)`, [createdCourseIds]);
        await pool.query(`DELETE FROM course_analytics_daily WHERE course_id IN (?)`, [createdCourseIds]);
        await pool.query(`DELETE FROM courses WHERE id IN (?)`, [createdCourseIds]);
      }
      if (createdSubcategoryIds.length > 0) {
        await pool.query(`DELETE FROM subcategories WHERE id IN (?)`, [createdSubcategoryIds]);
      }
      if (createdCategoryIds.length > 0) {
        await pool.query(`DELETE FROM categories WHERE id IN (?)`, [createdCategoryIds]);
      }
      if (createdUserIds.length > 0) {
        await pool.query(`DELETE FROM users WHERE id IN (?)`, [createdUserIds]);
      }
    } finally {
      await closePool();
    }
  });

  // ==========================================
  // 1. PUBLIC TRACKING APIS
  // ==========================================
  describe('1. Public Tracking APIs (Section 16.1 & 19.4)', () => {
    it('POST /api/courses/:id/views should record first view and increment total_views and unique_visitors (200)', async () => {
      const sessionId = `sess_${testRunId}_1`;
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .send({
          session_id: sessionId,
          referrer: 'https://google.com',
          source: 'organic',
          device_type: 'desktop',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'View recorded');

      // Verify DB counters
      const [cRows] = await pool.query('SELECT total_views, unique_visitors FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(cRows[0].total_views, 1);
      assert.strictEqual(cRows[0].unique_visitors, 1);
    });

    it('POST /api/courses/:id/views should return 200 on duplicate view same day without incrementing counters', async () => {
      const sessionId = `sess_${testRunId}_1`; // same session as previous test
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .send({
          session_id: sessionId,
          source: 'direct',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'View recorded');

      // Counters must NOT increment again
      const [cRows] = await pool.query('SELECT total_views, unique_visitors FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(cRows[0].total_views, 1);
      assert.strictEqual(cRows[0].unique_visitors, 1);
    });

    it('POST /api/courses/:id/views should increment total_views but NOT unique_visitors for returning session on another day', async () => {
      const returningSession = `sess_${testRunId}_returning`;

      // Seed a historical view from 10 days ago for this session
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 10 DAY), 'direct', 'desktop')`,
        [testCourseId, returningSession]
      );
      // Manually reflect that prior view in courses table
      await pool.query('UPDATE courses SET total_views = total_views + 1, unique_visitors = unique_visitors + 1 WHERE id = ?', [testCourseId]);

      // Initial state: total_views = 2, unique_visitors = 2
      const [beforeRows] = await pool.query('SELECT total_views, unique_visitors FROM courses WHERE id = ?', [testCourseId]);
      const initialViews = beforeRows[0].total_views;
      const initialUnique = beforeRows[0].unique_visitors;

      // Now view today with this returning session
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .send({
          session_id: returningSession,
          source: 'direct',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);

      // total_views + 1, unique_visitors unchanged
      const [afterRows] = await pool.query('SELECT total_views, unique_visitors FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(afterRows[0].total_views, initialViews + 1);
      assert.strictEqual(afterRows[0].unique_visitors, initialUnique);
    });

    it('POST /api/courses/:id/views should ignore bot user-agents without mutating DB counters', async () => {
      const [beforeRows] = await pool.query('SELECT total_views FROM courses WHERE id = ?', [testCourseId]);
      const initialViews = beforeRows[0].total_views;

      const res = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .set('User-Agent', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
        .send({
          session_id: `bot_sess_${testRunId}`,
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);

      // Verify no DB counter change
      const [afterRows] = await pool.query('SELECT total_views FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(afterRows[0].total_views, initialViews);
    });

    it('POST /api/courses/:id/views should return 404 for non-existent or unpublished course', async () => {
      // Non-existent
      await request(app)
        .post('/api/courses/99999999/views')
        .send({ session_id: 'test_sess' })
        .expect(404);

      // Unpublished draft course
      await request(app)
        .post(`/api/courses/${draftCourseId}/views`)
        .send({ session_id: 'test_sess' })
        .expect(404);
    });

    it('POST /api/courses/:id/views should reject invalid payloads with 400 Bad Request', async () => {
      // Empty session_id
      const res1 = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .send({ session_id: '' })
        .expect(400);
      assert.strictEqual(res1.body.success, false);

      // session_id > 64 chars
      const res2 = await request(app)
        .post(`/api/courses/${testCourseId}/views`)
        .send({ session_id: 'a'.repeat(65) })
        .expect(400);
      assert.strictEqual(res2.body.success, false);
    });

    it('POST /api/courses/:id/share should increment share_count (200)', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/share`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Share recorded');

      const [cRows] = await pool.query('SELECT share_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(cRows[0].share_count, 1);
    });

    it('POST /api/courses/:id/enquiry-click should atomically increment courses.enquiry_count and daily summary (200)', async () => {
      const todayStr = getKolkataDateString();

      const res = await request(app)
        .post(`/api/courses/${testCourseId}/enquiry-click`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Enquiry click recorded');

      // Verify course table increment
      const [cRows] = await pool.query('SELECT enquiry_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(cRows[0].enquiry_count, 1);

      // Verify daily summary upsert
      const [dailyRows] = await pool.query(
        'SELECT enquiry_count FROM course_analytics_daily WHERE course_id = ? AND analytics_date = ?',
        [testCourseId, todayStr]
      );
      assert.strictEqual(dailyRows.length, 1);
      assert.strictEqual(dailyRows[0].enquiry_count, 1);

      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: todayStr });
    });
  });

  // ==========================================
  // 2. ADMIN ANALYTICS APIS
  // ==========================================
  describe('2. Admin Analytics APIs (Section 16.2 & 19.4)', () => {
    it('GET /api/admin/courses/:id/analytics should enforce admin authentication guard', async () => {
      // 401 without token
      await request(app)
        .get(`/api/admin/courses/${testCourseId}/analytics`)
        .expect(401);

      // 403 with student token
      await request(app)
        .get(`/api/admin/courses/${testCourseId}/analytics`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('GET /api/admin/courses/:id/analytics should return complete analytics contract for admin (200)', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/analytics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Course analytics retrieved');

      const data = res.body.data;
      assert.strictEqual(data.course_id, testCourseId);
      assert.ok(data.range && data.range.from && data.range.to);
      assert.ok(data.totals);
      assert.ok(typeof data.totals.total_views === 'number');
      assert.ok(typeof data.totals.unique_visitors === 'number');
      assert.ok(typeof data.totals.conversion_rate === 'number');
      assert.ok(Array.isArray(data.daily));
      assert.ok(data.sources && typeof data.sources.organic === 'number');
      assert.ok(data.devices && typeof data.devices.desktop === 'number');
      assert.ok(data.demo_funnel && typeof data.demo_funnel.pending === 'number');
    });

    it('GET /api/admin/analytics/courses should return paginated course comparison list (200)', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/courses?page=1&limit=5&sort_by=total_views&order=desc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 5);
      assert.ok(res.body.pagination.total >= 1);

      const found = res.body.data.find(c => c.id === testCourseId);
      assert.ok(found);
      assert.ok(found.course_name);
      assert.ok(typeof found.conversion_rate === 'number');
    });

    it('GET /api/admin/dashboard should return platform overview statistics (200)', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Admin dashboard summary retrieved');

      const data = res.body.data;
      assert.ok(data.overview);
      assert.ok(typeof data.overview.total_courses === 'number');
      assert.ok(typeof data.overview.total_students === 'number');
      assert.ok(data.today_stats);
      assert.ok(Array.isArray(data.top_courses));
      assert.ok(data.demo_funnel);
      assert.ok(Array.isArray(data.recent_enrollments));
    });
  });

  // ==========================================
  // 3. BACKGROUND CRON JOBS
  // ==========================================
  describe('3. Background Cron Jobs (Section 19.2, 19.4 & 20)', () => {
    it('offer_expiry: should deactivate expired offers while keeping future offers active', async () => {
      // 1. Seed an expired offer
      const [expOffer] = await pool.query(
        `INSERT INTO course_offers (course_id, offer_name, discount_type, discount_value, is_active, starts_at, ends_at)
         VALUES (?, 'Expired Offer', 'percentage', 20.00, TRUE, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
        [testCourseId]
      );
      createdOfferIds.push(expOffer.insertId);

      // 2. Seed an active future offer
      const [futureOffer] = await pool.query(
        `INSERT INTO course_offers (course_id, offer_name, discount_type, discount_value, is_active, starts_at, ends_at)
         VALUES (?, 'Active Offer', 'percentage', 10.00, TRUE, NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY))`,
        [testCourseId]
      );
      createdOfferIds.push(futureOffer.insertId);

      // Run job
      const result = await runOfferExpiryJob();
      assert.strictEqual(result.skipped, false);
      assert.ok(result.updatedCount >= 1);

      // Verify states
      const [o1] = await pool.query('SELECT is_active FROM course_offers WHERE id = ?', [expOffer.insertId]);
      assert.strictEqual(o1[0].is_active, 0); // Deactivated

      const [o2] = await pool.query('SELECT is_active FROM course_offers WHERE id = ?', [futureOffer.insertId]);
      assert.strictEqual(o2[0].is_active, 1); // Remains active
    });

    it('enrollment_expiry: should mark past enrollments as expired', async () => {
      // 1. Seed expired enrollment for studentUser
      const [expEnroll] = await pool.query(
        `INSERT INTO course_enrollments (user_id, course_id, enrollment_source, enrollment_status, access_expires_at, enrolled_at)
         VALUES (?, ?, 'free', 'active', DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 30 DAY))`,
        [studentUser.id, testCourseId]
      );
      createdEnrollmentIds.push(expEnroll.insertId);

      // 2. Seed active future enrollment for expertUser
      const [activeEnroll] = await pool.query(
        `INSERT INTO course_enrollments (user_id, course_id, enrollment_source, enrollment_status, access_expires_at, enrolled_at)
         VALUES (?, ?, 'free', 'active', DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())`,
        [expertUser.id, testCourseId]
      );
      createdEnrollmentIds.push(activeEnroll.insertId);

      // Run job
      const result = await runEnrollmentExpiryJob();
      assert.strictEqual(result.skipped, false);
      assert.ok(result.expiredCount >= 1);

      // Verify states
      const [e1] = await pool.query('SELECT enrollment_status FROM course_enrollments WHERE id = ?', [expEnroll.insertId]);
      assert.strictEqual(e1[0].enrollment_status, 'expired');

      const [e2] = await pool.query('SELECT enrollment_status FROM course_enrollments WHERE id = ?', [activeEnroll.insertId]);
      assert.strictEqual(e2[0].enrollment_status, 'active');
    });

    it('enrollment_expiring_notice: should queue 7-day reminder and be idempotent on multiple runs', async () => {
      // Seed enrollment expiring in 5 days for adminUser on testCourseId
      const [expiringSoon] = await pool.query(
        `INSERT INTO course_enrollments (user_id, course_id, enrollment_source, enrollment_status, access_expires_at, enrolled_at)
         VALUES (?, ?, 'admin_manual', 'active', DATE_ADD(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 25 DAY))`,
        [adminUser.id, testCourseId]
      );
      createdEnrollmentIds.push(expiringSoon.insertId);

      // Run job 1st time
      const res1 = await runEnrollmentNoticeJob();
      assert.strictEqual(res1.skipped, false);
      assert.ok(res1.queuedCount >= 1);

      // Verify notification in DB
      const [nRows1] = await pool.query(
        `SELECT id, status, channel, payload FROM notifications 
         WHERE type = 'enrollment_expiring' AND user_id = ?`,
        [adminUser.id]
      );
      assert.ok(nRows1.length >= 1);
      assert.strictEqual(nRows1[0].status, 'queued');
      assert.strictEqual(nRows1[0].channel, 'inapp');
      for (const n of nRows1) createdNotificationIds.push(n.id);

      const countAfterFirstRun = nRows1.length;

      // Run job 2nd time immediately: must NOT duplicate
      const res2 = await runEnrollmentNoticeJob();
      assert.strictEqual(res2.skipped, false);

      const [nRows2] = await pool.query(
        `SELECT id FROM notifications 
         WHERE type = 'enrollment_expiring' AND user_id = ?`,
        [adminUser.id]
      );
      assert.strictEqual(nRows2.length, countAfterFirstRun);
    });

    it('demo_reminder: should queue reminders 60 min before scheduled session independently for student and expert', async () => {
      // Seed demo scheduled in 40 minutes with assigned expert
      const [demoResult] = await pool.query(
        `INSERT INTO demo_requests (course_id, user_id, assigned_to, student_name, preferred_demo_type, email, phone, status, scheduled_at, meeting_link, reference_no)
         VALUES (?, ?, ?, 'Test Student', 'live_1on1', 'lead@example.com', '9876543210', 'scheduled', DATE_ADD(NOW(), INTERVAL 40 MINUTE), 'https://meet.google.com/xyz', ?)`,
        [testCourseId, studentUser.id, expertUser.id, `REF_${testRunId}`]
      );
      const demoId = demoResult.insertId;
      createdDemoIds.push(demoId);

      // Run job 1st time
      const res1 = await runDemoReminderJob();
      assert.strictEqual(res1.skipped, false);
      assert.ok(res1.queuedCount >= 2); // 1 for student, 1 for expert

      // Verify 2 notifications created
      const [notifs] = await pool.query(
        `SELECT id, user_id, type, channel, status FROM notifications
         WHERE type = 'demo_reminder' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.demo_request_id')) = ?`,
        [String(demoId)]
      );
      assert.strictEqual(notifs.length, 2);
      for (const n of notifs) {
        assert.strictEqual(n.status, 'queued');
        assert.strictEqual(n.channel, 'inapp');
        createdNotificationIds.push(n.id);
      }

      // Run job 2nd time: idempotent skip
      const res2 = await runDemoReminderJob();
      assert.strictEqual(res2.skipped, false);

      const [notifsAfter] = await pool.query(
        `SELECT id FROM notifications
         WHERE type = 'demo_reminder' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.demo_request_id')) = ?`,
        [String(demoId)]
      );
      assert.strictEqual(notifsAfter.length, 2);
    });

    it('token_cleanup: should purge revoked and expired refresh tokens', async () => {
      // 1. Seed revoked token
      const [t1] = await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, revoked_at, expires_at)
         VALUES (?, 'hash_revoked_test', NOW(), DATE_ADD(NOW(), INTERVAL 10 DAY))`,
        [studentUser.id]
      );
      createdTokenIds.push(t1.insertId);

      // 2. Seed expired token
      const [t2] = await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES (?, 'hash_expired_test', DATE_SUB(NOW(), INTERVAL 1 DAY))`,
        [studentUser.id]
      );
      createdTokenIds.push(t2.insertId);

      // 3. Seed valid token
      const [t3] = await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES (?, 'hash_valid_test', DATE_ADD(NOW(), INTERVAL 15 DAY))`,
        [studentUser.id]
      );
      createdTokenIds.push(t3.insertId);

      // Run cleanup
      const res = await runTokenCleanupJob();
      assert.strictEqual(res.skipped, false);
      assert.ok(res.deletedCount >= 2);

      // Verify valid token remains
      const [validRows] = await pool.query('SELECT id FROM refresh_tokens WHERE id = ?', [t3.insertId]);
      assert.strictEqual(validRows.length, 1);
    });

    it('rating_resync: should accurately recalculate rating_avg and rating_count from approved reviews', async () => {
      // Seed approved reviews
      await pool.query(
        `INSERT INTO course_reviews (user_id, course_id, rating, title, text, moderation_status)
         VALUES (?, ?, 5, 'Great', 'Great course', 'approved'),
                (?, ?, 3, 'Average', 'Average course', 'approved')`,
        [studentUser.id, testCourseId, adminUser.id, testCourseId]
      );

      // Intentionally corrupt course rating to test resync repair
      await pool.query('UPDATE courses SET rating_avg = 1.00, rating_count = 99 WHERE id = ?', [testCourseId]);

      // Run resync job
      const res = await runRatingResyncJob();
      assert.strictEqual(res.skipped, false);
      assert.ok(res.resyncedCoursesCount >= 1);

      // Verify dynamically repaired: avg (5 + 3)/2 = 4.00, count = 2
      const [cRows] = await pool.query('SELECT rating_avg, rating_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_avg), 4.00);
      assert.strictEqual(Number(cRows[0].rating_count), 2);
    });

    it('analytics_aggregate: should aggregate daily stats, preserve enquiry_count, and backfill safely', async () => {
      const targetDate = '2026-04-10';
      const { dayStart } = getKolkataHalfOpenRange(targetDate);

      // Seed raw views on targetDate
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, 's_agg_1', DATE_ADD(?, INTERVAL 2 HOUR), 'direct', 'desktop'),
                (?, 's_agg_2', DATE_ADD(?, INTERVAL 4 HOUR), 'organic', 'mobile')`,
        [testCourseId, dayStart, testCourseId, dayStart]
      );

      // Seed existing daily aggregate with an accumulated enquiry_count of 7
      await pool.query(
        `INSERT INTO course_analytics_daily (course_id, analytics_date, total_views, unique_visitors, enquiry_count)
         VALUES (?, ?, 1, 1, 7)
         ON DUPLICATE KEY UPDATE enquiry_count = 7`,
        [testCourseId, targetDate]
      );
      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: targetDate });

      // Run aggregate on target date
      const res = await runAnalyticsAggregateJob(targetDate);
      assert.strictEqual(res.skipped, false);

      // Verify repaired: total_views = 2, unique_visitors = 2, enquiry_count PRESERVED as 7
      const [cadRows] = await pool.query(
        'SELECT total_views, unique_visitors, enquiry_count FROM course_analytics_daily WHERE course_id = ? AND analytics_date = ?',
        [testCourseId, targetDate]
      );
      assert.strictEqual(cadRows.length, 1);
      assert.strictEqual(cadRows[0].total_views, 2);
      assert.strictEqual(cadRows[0].unique_visitors, 2);
      assert.strictEqual(cadRows[0].enquiry_count, 7); // PRESERVED!
    });

    it('views_retention: should recompute, verify, and prune views older than 180 days', async () => {
      const oldDate = '2026-01-15'; // older than 180 days
      const { dayStart } = getKolkataHalfOpenRange(oldDate);

      // Seed 3 raw views for old date
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, 's_ret_1', DATE_ADD(?, INTERVAL 1 HOUR), 'direct', 'desktop'),
                (?, 's_ret_2', DATE_ADD(?, INTERVAL 2 HOUR), 'organic', 'mobile'),
                (?, 's_ret_1', DATE_ADD(?, INTERVAL 3 HOUR), 'direct', 'desktop')`,
        [testCourseId, dayStart, testCourseId, dayStart, testCourseId, dayStart]
      );
      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: oldDate });

      // Run views retention job for old date
      const res = await runViewsRetentionJob(oldDate);
      assert.strictEqual(res.skipped, false);
      assert.strictEqual(res.coursesPruned, 1);
      assert.strictEqual(res.rowsDeleted, 3);

      // Verify daily aggregate was repaired and retained: 3 views, 2 unique visitors
      const [cadRows] = await pool.query(
        'SELECT total_views, unique_visitors FROM course_analytics_daily WHERE course_id = ? AND analytics_date = ?',
        [testCourseId, oldDate]
      );
      assert.strictEqual(cadRows.length, 1);
      assert.strictEqual(cadRows[0].total_views, 3);
      assert.strictEqual(cadRows[0].unique_visitors, 2);

      // Verify raw views were safely deleted
      const { nextDayStart } = getKolkataHalfOpenRange(oldDate);
      const [rawViewsRemaining] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?',
        [testCourseId, dayStart, nextDayStart]
      );
      assert.strictEqual(rawViewsRemaining[0].cnt, 0);
    });

    it('views_retention: should abort and delete zero rows if verification fails or mismatch occurs', async () => {
      const mismatchDate = '2026-02-10';
      const { dayStart, nextDayStart } = getKolkataHalfOpenRange(mismatchDate);

      // Seed 2 raw views
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, 's_mis_1', DATE_ADD(?, INTERVAL 1 HOUR), 'direct', 'desktop'),
                (?, 's_mis_2', DATE_ADD(?, INTERVAL 2 HOUR), 'organic', 'mobile')`,
        [testCourseId, dayStart, testCourseId, dayStart]
      );
      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: mismatchDate });

      // Mock lock contention or simulated lock lock busy
      // Acquire lock on separate connection beforehand
      const conn = await pool.getConnection();
      const lockKey = `course_platform_views_rw_${testCourseId}_${mismatchDate}`;
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKey]);

      try {
        // Run retention while lock is held: must abort with 0 rows deleted
        const res = await runViewsRetentionJob(mismatchDate);
        assert.strictEqual(res.rowsDeleted, 0);

        // Verify raw views are intact
        const [rawAfter] = await pool.query(
          'SELECT COUNT(*) AS cnt FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?',
          [testCourseId, dayStart, nextDayStart]
        );
        assert.strictEqual(rawAfter[0].cnt, 2);
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        conn.release();
      }
    });
  });

  // ==========================================
  // 4. CONCURRENCY, ADVISORY LOCKS & SCHEDULER
  // ==========================================
  describe('4. Concurrency, Advisory Locks & Cron Schedules (Section 15–21)', () => {
    it('withCourseViewLock should acquire dedicated connection and release lock cleanly in finally block', async () => {
      const todayStr = getKolkataDateString();

      const result = await withCourseViewLock(testCourseId, todayStr, 2, async (conn) => {
        // Lock is active
        const [rows] = await conn.query('SELECT IS_USED_LOCK(?) AS user_lock', [`course_platform_views_rw_${testCourseId}_${todayStr}`]);
        assert.ok(rows[0]?.user_lock);
        return 42;
      });

      assert.strictEqual(result.acquired, true);
      assert.strictEqual(result.result, 42);

      // Verify lock was released
      const [check] = await pool.query('SELECT IS_USED_LOCK(?) AS user_lock', [`course_platform_views_rw_${testCourseId}_${todayStr}`]);
      assert.strictEqual(check[0]?.user_lock, null);
    });

    it('withJobLock should prevent concurrent executions of the same job', async () => {
      const conn = await pool.getConnection();
      const lockKey = 'course_platform_cron_test_job';
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKey]);

      try {
        const res = await withJobLock('test_job', async () => {
          return 'should_not_run';
        });

        assert.strictEqual(res.skipped, true);
        assert.strictEqual(res.reason, 'locked');
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        conn.release();
      }
    });

    it('CRON_SCHEDULES: all 8 cron expressions should compile with valid node-cron syntax', () => {
      for (const [key, expr] of Object.entries(CRON_SCHEDULES)) {
        const isValid = cron.validate(expr);
        assert.strictEqual(isValid, true, `Cron expression for ${key} (${expr}) must be valid`);
      }
    });

    it('Half-open intervals should correctly span midnight without omitting fractional seconds', () => {
      const range = getKolkataHalfOpenRange('2026-10-31');
      assert.strictEqual(range.dayStart, '2026-10-31 00:00:00');
      assert.strictEqual(range.nextDayStart, '2026-11-01 00:00:00');

      // Month rollover
      const febLeap = getKolkataHalfOpenRange('2024-02-28');
      assert.strictEqual(febLeap.nextDayStart, '2024-02-29 00:00:00');

      const febEnd = getKolkataHalfOpenRange('2026-02-28');
      assert.strictEqual(febEnd.nextDayStart, '2026-03-01 00:00:00');
    });

    it('analytics_aggregate should acquire course/date advisory lock and skip when lock is held', async () => {
      const targetDate = '2026-03-15';
      const lockKey = `course_platform_views_rw_${testCourseId}_${targetDate}`;
      const { dayStart } = getKolkataHalfOpenRange(targetDate);

      // Seed a view for this course/date
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, 's_lock_agg', DATE_ADD(?, INTERVAL 2 HOUR), 'direct', 'desktop')`,
        [testCourseId, dayStart]
      );
      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: targetDate });

      // Acquire lock on separate connection beforehand
      const conn = await pool.getConnection();
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKey]);

      try {
        // Run aggregation job: must safely skip because lock is busy
        const res = await runAnalyticsAggregateJob(targetDate);
        assert.strictEqual(res.skipped, false);
        assert.strictEqual(res.aggregatedRecordsCount, 0); // 0 aggregated because lock busy
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        conn.release();
      }

      // Now run again after lock released: must succeed
      const resAfter = await runAnalyticsAggregateJob(targetDate);
      assert.strictEqual(resAfter.skipped, false);
      assert.strictEqual(resAfter.aggregatedRecordsCount, 1);
    });

    it('concurrent aggregation and retention for the same course/date cannot execute simultaneously', async () => {
      const oldDate = '2026-01-20';
      const lockKey = `course_platform_views_rw_${testCourseId}_${oldDate}`;
      const { dayStart } = getKolkataHalfOpenRange(oldDate);

      // Seed raw view on oldDate
      await pool.query(
        `INSERT INTO course_views (course_id, session_id, viewed_at, source, device_type)
         VALUES (?, 's_coexist_1', DATE_ADD(?, INTERVAL 1 HOUR), 'direct', 'desktop')`,
        [testCourseId, dayStart]
      );
      createdDailyAnalyticsKeys.push({ courseId: testCourseId, dateStr: oldDate });

      // Hold lock on dedicated connection
      const conn = await pool.getConnection();
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKey]);

      try {
        // Both aggregation and retention must safely skip/abort while lock is held
        const aggRes = await runAnalyticsAggregateJob(oldDate);
        assert.strictEqual(aggRes.aggregatedRecordsCount, 0);

        const retRes = await runViewsRetentionJob(oldDate);
        assert.strictEqual(retRes.rowsDeleted, 0);
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        conn.release();
      }
    });

    it('advisory lock on one course or date does not block a different course or date', async () => {
      const dateA = '2026-03-01';
      const dateB = '2026-03-02';
      const lockKeyA = `course_platform_views_rw_${testCourseId}_${dateA}`;

      // Hold lock for Course testCourseId on dateA
      const conn = await pool.getConnection();
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKeyA]);

      try {
        // Different course (draftCourseId) on same dateA: must acquire immediately
        const diffCourseResult = await withCourseViewLock(draftCourseId, dateA, 1, async () => {
          return 'ok_diff_course';
        });
        assert.strictEqual(diffCourseResult.acquired, true);
        assert.strictEqual(diffCourseResult.result, 'ok_diff_course');

        // Same course (testCourseId) on different date (dateB): must acquire immediately
        const diffDateResult = await withCourseViewLock(testCourseId, dateB, 1, async () => {
          return 'ok_diff_date';
        });
        assert.strictEqual(diffDateResult.acquired, true);
        assert.strictEqual(diffDateResult.result, 'ok_diff_date');
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKeyA]);
        conn.release();
      }
    });

    it('POST /api/courses/:id/views should return 503 Service Unavailable when course/date advisory lock is held', async () => {
      const todayStr = getKolkataDateString();
      const lockKey = `course_platform_views_rw_${testCourseId}_${todayStr}`;

      // Hold lock on separate connection
      const conn = await pool.getConnection();
      await conn.query('SELECT GET_LOCK(?, 0)', [lockKey]);

      try {
        const res = await request(app)
          .post(`/api/courses/${testCourseId}/views`)
          .send({
            session_id: `sess_locked_test_${Date.now()}`,
            source: 'direct',
          })
          .expect(503);

        assert.strictEqual(res.body.success, false);
        assert.ok(res.body.message.includes('Server busy'));
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockKey]);
        conn.release();
      }
    });
  });
});
