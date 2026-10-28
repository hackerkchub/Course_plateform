import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Phase 8: Demo Classes & Free Trials Automated Tests', () => {
  let pool;
  let adminToken;
  let counsellorToken;
  let userToken;
  let anotherUserToken;

  let adminCookie;
  let counsellorCookie;
  let userCookie;
  let anotherUserCookie;

  let adminUserId;
  let counsellorUserId;
  let studentUserId;
  let anotherStudentUserId;

  let testCategoryId;
  let testSubcategoryId;
  let testCourseId;
  let testCourseSlug;
  let testBatchId;

  let testDemoRequestId;
  let foreignCourseId;
  let foreignCourseBatchId;
  let extraUser1Id;
  let extraUser2Id;

  const timestamp = Date.now();
  const testCategorySlug = `phase8-cat-${timestamp}`;
  const testSubcategorySlug = `phase8-sub-${timestamp}`;
  const testCourseCode = `P8-${timestamp.toString().slice(-6)}`;
  testCourseSlug = `phase8-course-${timestamp}`;

  before(async () => {
    pool = getPool();

    // 1. Create synthetic admin
    const [adminRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `, [`google_p8_admin_${timestamp}`, `p8_admin_${timestamp}@example.com`, 'Phase 8 Admin']);
    adminUserId = adminRes.insertId;

    // 2. Create synthetic counsellor
    const [counsellorRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'counsellor', 'active')
    `, [`google_p8_counsellor_${timestamp}`, `p8_counsellor_${timestamp}@example.com`, 'Phase 8 Counsellor']);
    counsellorUserId = counsellorRes.insertId;

    // 3. Create synthetic students
    const [studentRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `, [`google_p8_student_${timestamp}`, `p8_student_${timestamp}@example.com`, 'Rahul Verma']);
    studentUserId = studentRes.insertId;

    const [anotherStudentRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `, [`google_p8_student2_${timestamp}`, `p8_student2_${timestamp}@example.com`, 'Pooja Sharma']);
    anotherStudentUserId = anotherStudentRes.insertId;

    adminToken = generateAccessToken({ id: adminUserId, email: `p8_admin_${timestamp}@example.com`, role: 'admin' });
    counsellorToken = generateAccessToken({ id: counsellorUserId, email: `p8_counsellor_${timestamp}@example.com`, role: 'counsellor' });
    userToken = generateAccessToken({ id: studentUserId, email: `p8_student_${timestamp}@example.com`, role: 'user' });
    anotherUserToken = generateAccessToken({ id: anotherStudentUserId, email: `p8_student2_${timestamp}@example.com`, role: 'user' });

    adminCookie = `access_token=${adminToken}`;
    counsellorCookie = `access_token=${counsellorToken}`;
    userCookie = `access_token=${userToken}`;
    anotherUserCookie = `access_token=${anotherUserToken}`;

    // 4. Create synthetic category & subcategory
    const [catRes] = await pool.query(`
      INSERT INTO categories (name, slug, description, status)
      VALUES (?, ?, 'Phase 8 Category', 'active')
    `, [`Phase 8 Category ${timestamp}`, testCategorySlug]);
    testCategoryId = catRes.insertId;

    const [subRes] = await pool.query(`
      INSERT INTO subcategories (category_id, name, slug, description, status)
      VALUES (?, ?, ?, 'Phase 8 Subcategory', 'active')
    `, [testCategoryId, `Phase 8 Subcategory ${timestamp}`, testSubcategorySlug]);
    testSubcategoryId = subRes.insertId;

    // 5. Create synthetic published course
    const [courseRes] = await pool.query(`
      INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        duration_hours, price, offer_price, status, published_at
      )
      VALUES (?, ?, ?, 'Phase 8 Short Desc', '<p>Phase 8 Desc</p>', ?, ?, 'beginner', 'English', 'online', 10, 4999, 3999, 'published', NOW())
    `, [testCourseCode, `Phase 8 Full Course ${timestamp}`, testCourseSlug, testCategoryId, testSubcategoryId]);
    testCourseId = courseRes.insertId;

    // 6. Create synthetic batch for enrollment conversion testing
    const [batchRes] = await pool.query(`
      INSERT INTO course_batches (
        course_id, batch_name, start_date, total_seats, seats_available, status
      ) VALUES (?, 'Demo Convert Batch', CURDATE(), 20, 20, 'open')
    `, [testCourseId]);
    testBatchId = batchRes.insertId;
  });

  after(async () => {
    try {
      if (testCourseId) {
        await pool.query('DELETE FROM demo_request_activity_log WHERE demo_request_id IN (SELECT id FROM demo_requests WHERE course_id = ?)', [testCourseId]);
        await pool.query('DELETE FROM demo_requests WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_demo_settings WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_enrollments WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_batches WHERE course_id = ?', [testCourseId]);
      }
      if (foreignCourseBatchId) {
        await pool.query('DELETE FROM course_batches WHERE id = ?', [foreignCourseBatchId]);
      }
      if (testCourseId) {
        await pool.query('DELETE FROM courses WHERE id = ?', [testCourseId]);
      }
      if (foreignCourseId) {
        await pool.query('DELETE FROM courses WHERE id = ?', [foreignCourseId]);
      }
      if (testCategoryId) {
        await pool.query('DELETE FROM courses WHERE category_id = ?', [testCategoryId]);
      }
      if (testSubcategoryId) {
        await pool.query('DELETE FROM subcategories WHERE id = ?', [testSubcategoryId]);
      }
      if (testCategoryId) {
        await pool.query('DELETE FROM categories WHERE id = ?', [testCategoryId]);
      }
      const userIdsToDelete = [adminUserId, counsellorUserId, studentUserId, anotherStudentUserId, extraUser1Id, extraUser2Id].filter(Boolean);
      if (userIdsToDelete.length > 0) {
        await pool.query(`DELETE FROM users WHERE id IN (${userIdsToDelete.map(() => '?').join(',')})`, userIdsToDelete);
      }
    } catch {
      // Ignore teardown errors
    }

    await closePool();
  });

  // ==========================================
  // 1. Demo Settings (Section 13.1)
  // ==========================================
  describe('1. Course Demo Settings Management (Section 13.1)', () => {
    it('GET /api/admin/courses/:id/demo-settings should reject unauthenticated requests with 401', async () => {
      const res = await request(app).get(`/api/admin/courses/${testCourseId}/demo-settings`);
      assert.strictEqual(res.status, 401);
    });

    it('GET /api/admin/courses/:id/demo-settings should reject non-admin/counsellor user with 403', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/demo-settings`)
        .set('Cookie', userCookie);
      assert.strictEqual(res.status, 403);
    });

    it('PUT /api/admin/courses/:id/demo-settings should reject invalid payload with 400', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/demo-settings`)
        .set('Cookie', adminCookie)
        .send({
          demo_enabled: true,
          // missing demo_request_enabled
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('PUT /api/admin/courses/:id/demo-settings should save demo configuration successfully', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/demo-settings`)
        .set('Cookie', adminCookie)
        .send({
          demo_enabled: true,
          demo_request_enabled: true,
          demo_type: 'live',
          demo_duration_minutes: 60,
          time_slots: ['10:00', '18:00'],
          accepting_requests: true,
          max_requests_per_slot: 5,
          allowed_demo_types: ['live', 'recorded'],
          meeting_platform: 'zoom',
          form_title: 'Book a Free Live Demo Class',
          submit_button_text: 'Request Demo',
          success_message: 'Demo request registered successfully',
          honeypot_enabled: true,
          rate_limit_per_hour: 5,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.demo_enabled, true);
      assert.strictEqual(res.body.data.demo_request_enabled, true);
      assert.deepStrictEqual(res.body.data.time_slots, ['10:00', '18:00']);
    });

    it('GET /api/admin/courses/:id/demo-settings should return saved demo settings', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/demo-settings`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_id, testCourseId);
      assert.strictEqual(res.body.data.meeting_platform, 'zoom');
    });

    it('GET /api/courses/:id/demo-settings should return public demo settings', async () => {
      const res = await request(app).get(`/api/courses/${testCourseId}/demo-settings`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.demo_enabled, true);
    });
  });

  // ==========================================
  // 2. Student Demo Request Submission (Section 13.2)
  // ==========================================
  describe('2. Student Demo Request Submission & Validation (Section 13.2)', () => {
    it('POST /api/courses/:id/demo-requests should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .send({
          student_name: 'Rahul Verma',
          email: 'rahul@example.com',
          phone: '9876543210',
          preferred_demo_type: 'live',
          consent: true,
        });

      assert.strictEqual(res.status, 401);
    });

    it('POST /api/courses/:id/demo-requests should reject invalid phone number with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', userCookie)
        .send({
          student_name: 'Rahul Verma',
          email: 'rahul@example.com',
          phone: '12345', // invalid phone
          preferred_demo_type: 'live',
          consent: true,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /phone/i);
    });

    it('POST /api/courses/:id/demo-requests should reject missing consent with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', userCookie)
        .send({
          student_name: 'Rahul Verma',
          email: 'rahul@example.com',
          phone: '9876543210',
          preferred_demo_type: 'live',
          consent: false,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/demo-requests should reject honeypot filled (bot submission) with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', userCookie)
        .send({
          student_name: 'Bot Spammer',
          email: 'bot@spam.com',
          phone: '9876543210',
          preferred_demo_type: 'live',
          consent: true,
          honeypot: 'i-am-a-bot',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /bot/i);
    });

    it('POST /api/courses/:id/demo-requests should successfully create demo request with reference_no', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', userCookie)
        .send({
          student_name: 'Rahul Verma',
          email: 'p8_student@example.com',
          phone: '9876543210',
          city: 'Indore',
          current_qualification: 'Graduate',
          experience_level: 'Fresher',
          preferred_demo_type: 'live',
          preferred_date: '2026-11-15',
          preferred_time: '18:00',
          message: 'Excited to attend the live demo!',
          consent: true,
          source: 'website',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.message, /Aapki demo request mil gayi hai/);
      assert.strictEqual(res.body.data.course_id, testCourseId);
      assert.strictEqual(res.body.data.status, 'pending');
      assert.match(res.body.data.reference_no, /^DEMO-\d{4}-\d{4}$/);

      testDemoRequestId = res.body.data.id;

      // Verify course demo_request_count incremented
      const [courseRows] = await pool.query('SELECT demo_request_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(courseRows[0].demo_request_count), 1);

      // Verify notification queued
      const [notifRows] = await pool.query("SELECT * FROM notifications WHERE type = 'demo_request_received' ORDER BY id DESC LIMIT 1");
      assert.strictEqual(notifRows.length, 1);
      assert.strictEqual(notifRows[0].status, 'queued');
    });

    it('POST /api/courses/:id/demo-requests should reject duplicate active demo request with 409', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', userCookie)
        .send({
          student_name: 'Rahul Verma',
          email: 'p8_student@example.com',
          phone: '9876543210',
          preferred_demo_type: 'live',
          consent: true,
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /already have an active demo request/i);
    });

    it('POST /api/courses/:id/demo-requests should reject when accepting_requests is false with 400', async () => {
      // Temporarily turn off accepting_requests
      await pool.query('UPDATE course_demo_settings SET accepting_requests = 0 WHERE course_id = ?', [testCourseId]);

      const res = await request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', anotherUserCookie)
        .send({
          student_name: 'Pooja Sharma',
          email: 'pooja@example.com',
          phone: '9123456789',
          preferred_demo_type: 'live',
          consent: true,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not currently accepting/i);

      // Revert accepting_requests
      await pool.query('UPDATE course_demo_settings SET accepting_requests = 1 WHERE course_id = ?', [testCourseId]);
    });
  });

  // ==========================================
  // 3. Student Lead Tracking & Cancellation (Section 13.2)
  // ==========================================
  describe('3. Student Lead Tracking & Cancellation (Section 13.2)', () => {
    it('GET /api/me/demo-requests should return student submitted requests', async () => {
      const res = await request(app)
        .get('/api/me/demo-requests')
        .set('Cookie', userCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].id, testDemoRequestId);
      assert.strictEqual(res.body.data[0].status, 'pending');
    });

    it('PATCH /api/me/demo-requests/:id/cancel should reject cancellation of another user request with 404', async () => {
      const res = await request(app)
        .patch(`/api/me/demo-requests/${testDemoRequestId}/cancel`)
        .set('Cookie', anotherUserCookie);

      assert.strictEqual(res.status, 404);
    });

    it('PATCH /api/me/demo-requests/:id/cancel should allow student to cancel pending request', async () => {
      const res = await request(app)
        .patch(`/api/me/demo-requests/${testDemoRequestId}/cancel`)
        .set('Cookie', userCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify status is cancelled in database
      const [rows] = await pool.query('SELECT status FROM demo_requests WHERE id = ?', [testDemoRequestId]);
      assert.strictEqual(rows[0].status, 'cancelled');

      // Verify activity log entry
      const [logs] = await pool.query('SELECT action, new_status FROM demo_request_activity_log WHERE demo_request_id = ? ORDER BY id DESC LIMIT 1', [testDemoRequestId]);
      assert.strictEqual(logs[0].action, 'cancelled_by_student');
      assert.strictEqual(logs[0].new_status, 'cancelled');
    });

    it('PATCH /api/me/demo-requests/:id/cancel on already cancelled request should return 400', async () => {
      const res = await request(app)
        .patch(`/api/me/demo-requests/${testDemoRequestId}/cancel`)
        .set('Cookie', userCookie);

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });
  });

  // ==========================================
  // 4. Staff Lead Management & Workflows (Section 13.3)
  // ==========================================
  describe('4. Staff Lead Management & Workflows (Section 13.3)', () => {
    let secondRequestId;
    let closedBatchId;
    let zeroSeatsBatchId;
    let validationLeadId;
    let noBatchLeadId;
    let extraUser1Id;
    let extraUser2Id;

    before(async () => {
      // Create a fresh active demo request using second student
      const [reqRes] = await pool.query(`
        INSERT INTO demo_requests (
          reference_no, course_id, user_id, student_name, email, phone,
          preferred_demo_type, consent_given, consent_at, status
        ) VALUES ('DEMO-2026-9999', ?, ?, 'Pooja Sharma', 'p8_student2@example.com', '9811223344', 'live', 1, NOW(), 'pending')
      `, [testCourseId, anotherStudentUserId]);
      secondRequestId = reqRes.insertId;

      // Batches for demo conversion batch validation
      const [closedRes] = await pool.query(`
        INSERT INTO course_batches (
          course_id, batch_name, start_date, total_seats, seats_available, status
        ) VALUES (?, 'Demo Closed Batch', CURDATE(), 10, 5, 'closed')
      `, [testCourseId]);
      closedBatchId = closedRes.insertId;

      const [zeroSeatsRes] = await pool.query(`
        INSERT INTO course_batches (
          course_id, batch_name, start_date, total_seats, seats_available, status
        ) VALUES (?, 'Demo Zero Seats Batch', CURDATE(), 10, 0, 'open')
      `, [testCourseId]);
      zeroSeatsBatchId = zeroSeatsRes.insertId;

      // Create a dummy course and foreign batch to test cross-course rejection
      const [foreignCourseRes] = await pool.query(`
        INSERT INTO courses (
          course_code, course_name, slug, short_description, description,
          category_id, subcategory_id, course_level, language, mode,
          price, is_free, status
        ) VALUES (?, 'Foreign Course', ?, 'desc', 'desc', ?, ?, 'beginner', 'English', 'online', 0, 1, 'published')
      `, [`P8-FOR-${timestamp}`, `foreign-course-p8-${timestamp}`, testCategoryId, testSubcategoryId]);
      foreignCourseId = foreignCourseRes.insertId;

      const [foreignBatchRes] = await pool.query(`
        INSERT INTO course_batches (
          course_id, batch_name, start_date, total_seats, seats_available, status
        ) VALUES (?, 'Foreign Course Batch', CURDATE(), 10, 5, 'open')
      `, [foreignCourseId]);
      foreignCourseBatchId = foreignBatchRes.insertId;

      // Extra users and leads for batch validation testing
      const [extraU1] = await pool.query(`
        INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, 'Val User 1', 'user', 'active')
      `, [`google_p8_val1_${timestamp}`, `val1_${timestamp}@example.com`]);
      extraUser1Id = extraU1.insertId;

      const [extraU2] = await pool.query(`
        INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, 'Val User 2', 'user', 'active')
      `, [`google_p8_val2_${timestamp}`, `val2_${timestamp}@example.com`]);
      extraUser2Id = extraU2.insertId;

      const [leadVal1] = await pool.query(`
        INSERT INTO demo_requests (
          reference_no, course_id, user_id, student_name, email, phone,
          preferred_demo_type, consent_given, consent_at, status
        ) VALUES ('DEMO-2026-VAL1', ?, ?, 'Val User 1', 'val1@example.com', '9811000001', 'live', 1, NOW(), 'pending')
      `, [testCourseId, extraUser1Id]);
      validationLeadId = leadVal1.insertId;

      const [leadVal2] = await pool.query(`
        INSERT INTO demo_requests (
          reference_no, course_id, user_id, student_name, email, phone,
          preferred_demo_type, consent_given, consent_at, status
        ) VALUES ('DEMO-2026-VAL2', ?, ?, 'Val User 2', 'val2@example.com', '9811000002', 'live', 1, NOW(), 'pending')
      `, [testCourseId, extraUser2Id]);
      noBatchLeadId = leadVal2.insertId;
    });

    it('GET /api/admin/demo-requests should return leads list with summary counts for counsellor', async () => {
      const res = await request(app)
        .get('/api/admin/demo-requests')
        .set('Cookie', counsellorCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.summary);
      assert.ok(res.body.data.summary.total >= 2);
      assert.ok(res.body.data.requests.length >= 2);
      assert.ok(res.body.data.pagination);
    });

    it('GET /api/admin/courses/:id/demo-requests should return leads for specific course', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/demo-requests`)
        .set('Cookie', counsellorCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.requests.length >= 2);
    });

    it('GET /api/admin/demo-requests/:id should return lead details with activity history', async () => {
      const res = await request(app)
        .get(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', counsellorCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.id, secondRequestId);
      assert.ok(Array.isArray(res.body.data.activity_history));
    });

    it('PATCH /api/admin/demo-requests/:id should update status to contacted and assign to counsellor', async () => {
      const res = await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', counsellorCookie)
        .send({
          status: 'contacted',
          assigned_to: counsellorUserId,
          admin_notes: 'Spoke with student on phone. Interested in evening live batch.',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'contacted');
      assert.strictEqual(res.body.data.assigned_to, counsellorUserId);
    });

    it('PATCH /api/admin/demo-requests/:id to scheduled without scheduled_at should return 400', async () => {
      const res = await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', counsellorCookie)
        .send({
          status: 'scheduled',
          meeting_link: 'https://zoom.us/j/1234567890',
          // missing scheduled_at
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /scheduled_at is required/i);
    });

    it('PATCH /api/admin/demo-requests/:id to scheduled with valid datetime should succeed', async () => {
      const res = await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', counsellorCookie)
        .send({
          status: 'scheduled',
          scheduled_at: '2026-11-20T18:00:00Z',
          meeting_link: 'https://zoom.us/j/1234567890',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'scheduled');
    });

    it('PATCH /api/admin/demo-requests/:id backward status revert by counsellor should be rejected with 403', async () => {
      // Counsellor trying to revert scheduled -> pending
      const res = await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', counsellorCookie)
        .send({
          status: 'pending',
        });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /revert/i);
    });

    it('PATCH /api/admin/demo-requests/:id backward status revert by admin should succeed', async () => {
      // Admin reverting scheduled -> contacted
      const res = await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', adminCookie)
        .send({
          status: 'contacted',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'contacted');

      // Put back to scheduled for completion test
      await request(app)
        .patch(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', adminCookie)
        .send({ status: 'scheduled', scheduled_at: '2026-11-20T18:00:00Z' });
    });

    it('POST /api/admin/demo-requests/:id/notes should append follow-up note', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${secondRequestId}/notes`)
        .set('Cookie', counsellorCookie)
        .send({
          note: 'Sent zoom link via WhatsApp. Student confirmed attendance.',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.admin_notes, /confirmed attendance/);
    });

    it('PATCH /api/admin/demo-requests/bulk should update status of multiple leads', async () => {
      const res = await request(app)
        .patch('/api/admin/demo-requests/bulk')
        .set('Cookie', adminCookie)
        .send({
          ids: [secondRequestId],
          admin_notes: 'Reviewed in weekly counsellor standup',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.updated_count, 1);
    });

    it('POST /api/admin/demo-requests/:id/convert by counsellor should be rejected with 403', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${secondRequestId}/convert`)
        .set('Cookie', counsellorCookie)
        .send({
          batch_id: testBatchId,
        });

      assert.strictEqual(res.status, 403);
    });

    it('POST /api/admin/demo-requests/:id/convert by admin should create enrollment row and set converted=true', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${secondRequestId}/convert`)
        .set('Cookie', adminCookie)
        .send({
          batch_id: testBatchId,
          access_expires_at: '2027-11-20T00:00:00Z',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.enrollment_id);

      // Verify demo request state in database
      const [reqRows] = await pool.query('SELECT converted_to_enrollment, status, enrollment_id FROM demo_requests WHERE id = ?', [secondRequestId]);
      assert.strictEqual(reqRows[0].converted_to_enrollment, 1);
      assert.strictEqual(reqRows[0].status, 'completed');
      assert.strictEqual(Number(reqRows[0].enrollment_id), res.body.data.enrollment_id);

      // Verify course_enrollments row
      const [enrollRows] = await pool.query('SELECT enrollment_source, enrollment_status FROM course_enrollments WHERE id = ?', [res.body.data.enrollment_id]);
      assert.strictEqual(enrollRows[0].enrollment_source, 'demo_convert');
      assert.strictEqual(enrollRows[0].enrollment_status, 'active');
    });

    it('POST /api/admin/demo-requests/:id/convert on already converted lead should return 400', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${secondRequestId}/convert`)
        .set('Cookie', adminCookie)
        .send({ batch_id: testBatchId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /already converted/i);
    });

    it('POST /api/admin/demo-requests/:id/convert with batch belonging to different course should return 400', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${validationLeadId}/convert`)
        .set('Cookie', adminCookie)
        .send({ batch_id: foreignCourseBatchId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Selected batch does not exist for this course/i);
    });

    it('POST /api/admin/demo-requests/:id/convert with closed batch should return 400', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${validationLeadId}/convert`)
        .set('Cookie', adminCookie)
        .send({ batch_id: closedBatchId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Cannot enroll into closed batch/i);
    });

    it('POST /api/admin/demo-requests/:id/convert with full batch (0 seats) should return 409', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${validationLeadId}/convert`)
        .set('Cookie', adminCookie)
        .send({ batch_id: zeroSeatsBatchId });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Selected batch is fully booked/i);
    });

    it('POST /api/admin/demo-requests/:id/convert without batch should succeed when batch is omitted', async () => {
      const res = await request(app)
        .post(`/api/admin/demo-requests/${noBatchLeadId}/convert`)
        .set('Cookie', adminCookie)
        .send({});

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.enrollment_id);

      // Verify enrollment created with batch_id = null
      const [enrollRows] = await pool.query('SELECT batch_id, enrollment_source, enrollment_status FROM course_enrollments WHERE id = ?', [res.body.data.enrollment_id]);
      assert.strictEqual(enrollRows[0].batch_id, null, 'batch_id should be null when not supplied');
      assert.strictEqual(enrollRows[0].enrollment_source, 'demo_convert');
      assert.strictEqual(enrollRows[0].enrollment_status, 'active');
    });

    it('GET /api/admin/demo-requests/export should export leads to CSV for admin', async () => {
      const res = await request(app)
        .get('/api/admin/demo-requests/export')
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');
      assert.match(res.headers['content-disposition'], /attachment; filename="demo_requests_export_/);
      assert.match(res.text, /Reference No,Course ID,Course Name,Student Name/);
      assert.match(res.text, /Pooja Sharma/);
    });

    it('DELETE /api/admin/demo-requests/:id should soft delete lead for admin', async () => {
      const res = await request(app)
        .delete(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify soft deleted in database
      const [rows] = await pool.query('SELECT deleted_at FROM demo_requests WHERE id = ?', [secondRequestId]);
      assert.ok(rows[0].deleted_at !== null);

      // Verify excluded from normal list
      const listRes = await request(app)
        .get(`/api/admin/demo-requests/${secondRequestId}`)
        .set('Cookie', adminCookie);
      assert.strictEqual(listRes.status, 404);
    });
  });

  // ==========================================
  // 5. Audit Logging Verification
  // ==========================================
  describe('5. Audit Logging Verification', () => {
    it('Should verify audit_logs entries were recorded for Phase 8 administrative actions', async () => {
      const [logs] = await pool.query(`
        SELECT action, entity_type
        FROM audit_logs
        WHERE actor_id = ?
        ORDER BY id DESC
      `, [adminUserId]);

      const actions = logs.map(l => l.action);
      assert.ok(actions.includes('demo_settings.update'), 'Should log demo_settings.update');
      assert.ok(actions.includes('demo_request.update'), 'Should log demo_request.update');
      assert.ok(actions.includes('demo_request.convert'), 'Should log demo_request.convert');
      assert.ok(actions.includes('demo_request.delete'), 'Should log demo_request.delete');
    });
  });

  // ==========================================
  // 6. Concurrency, CSV Injection & Data Integrity Tests
  // ==========================================
  describe('6. Concurrency, CSV Injection & Data Integrity Tests', () => {
    let student3UserId;
    let student3Cookie;
    let student4UserId;
    let student4Cookie;

    before(async () => {
      const [u3] = await pool.query(`
        INSERT INTO users (google_id, email, name, role, status)
        VALUES (?, ?, 'Student 3 Concurrency', 'user', 'active')
      `, [`google_p8_u3_${timestamp}`, `p8_u3_${timestamp}@example.com`]);
      student3UserId = u3.insertId;
      const t3 = generateAccessToken({ id: student3UserId, email: `p8_u3_${timestamp}@example.com`, role: 'user' });
      student3Cookie = `access_token=${t3}`;

      const [u4] = await pool.query(`
        INSERT INTO users (google_id, email, name, role, status)
        VALUES (?, ?, 'Student 4 Concurrency', 'user', 'active')
      `, [`google_p8_u4_${timestamp}`, `p8_u4_${timestamp}@example.com`]);
      student4UserId = u4.insertId;
      const t4 = generateAccessToken({ id: student4UserId, email: `p8_u4_${timestamp}@example.com`, role: 'user' });
      student4Cookie = `access_token=${t4}`;
    });

    after(async () => {
      if (student3UserId || student4UserId) {
        await pool.query('DELETE FROM demo_request_activity_log WHERE performed_by IN (?, ?)', [student3UserId, student4UserId]);
        await pool.query('DELETE FROM demo_requests WHERE user_id IN (?, ?)', [student3UserId, student4UserId]);
        await pool.query('DELETE FROM course_enrollments WHERE user_id IN (?, ?)', [student3UserId, student4UserId]);
        await pool.query('DELETE FROM users WHERE id IN (?, ?)', [student3UserId, student4UserId]);
      }
    });

    it('Concurrency: Simultaneous slot bookings when slot capacity = 1 should allow exactly one and reject other with 400', async () => {
      // Set slot capacity to 1
      await pool.query('UPDATE course_demo_settings SET max_requests_per_slot = 1 WHERE course_id = ?', [testCourseId]);

      const slotDate = '2026-12-05';
      const slotTime = '10:00';

      const p1 = request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', student3Cookie)
        .send({
          student_name: 'Student 3',
          email: 'p8_u3@example.com',
          phone: '9870000001',
          preferred_demo_type: 'live',
          preferred_date: slotDate,
          preferred_time: slotTime,
          consent: true,
        });

      const p2 = request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', student4Cookie)
        .send({
          student_name: 'Student 4',
          email: 'p8_u4@example.com',
          phone: '9870000002',
          preferred_demo_type: 'live',
          preferred_date: slotDate,
          preferred_time: slotTime,
          consent: true,
        });

      const [res1, res2] = await Promise.all([p1, p2]);
      const statuses = [res1.status, res2.status].sort();

      // One must be 201 Created and the other must be 400 Bad Request
      assert.deepStrictEqual(statuses, [201, 400], 'Concurrency slot check must allow exactly one booking');

      // Verify DB count is exactly 1
      const [slotCountRows] = await pool.query(`
        SELECT COUNT(*) AS count
        FROM demo_requests
        WHERE course_id = ? AND preferred_date = ? AND preferred_time = ? AND deleted_at IS NULL
      `, [testCourseId, slotDate, slotTime]);
      assert.strictEqual(Number(slotCountRows[0].count), 1);
    });

    it('Concurrency: Simultaneous duplicate submissions from same user should allow exactly one and return 409 for duplicate', async () => {
      const p1 = request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', student3Cookie)
        .send({
          student_name: 'Student 3 Repeat',
          email: 'p8_u3@example.com',
          phone: '9870000003',
          preferred_demo_type: 'live',
          consent: true,
        });

      const p2 = request(app)
        .post(`/api/courses/${testCourseId}/demo-requests`)
        .set('Cookie', student3Cookie)
        .send({
          student_name: 'Student 3 Repeat',
          email: 'p8_u3@example.com',
          phone: '9870000003',
          preferred_demo_type: 'live',
          consent: true,
        });

      const [res1, res2] = await Promise.all([p1, p2]);
      const statuses = [res1.status, res2.status].sort();

      // One must be 201 or 409
      assert.ok(statuses.includes(409), 'One concurrent submission must be rejected with 409 Conflict');
    });

    it('Enrollment Conversion: Should prevent duplicate enrollment if student is already enrolled in the course', async () => {
      // 1. Create a lead for student 4
      const [leadRes] = await pool.query(`
        INSERT INTO demo_requests (
          reference_no, course_id, user_id, student_name, email, phone,
          preferred_demo_type, consent_given, consent_at, status
        ) VALUES ('DEMO-2026-DUP1', ?, ?, 'Student 4', 'p8_u4@example.com', '9870000004', 'live', 1, NOW(), 'pending')
      `, [testCourseId, student4UserId]);
      const leadId = leadRes.insertId;

      // 2. Pre-create an active enrollment for student 4
      await pool.query(`
        INSERT INTO course_enrollments (
          user_id, course_id, enrollment_source, enrollment_status, enrolled_at
        ) VALUES (?, ?, 'free', 'active', NOW())
      `, [student4UserId, testCourseId]);

      // 3. Attempt to convert demo request
      const res = await request(app)
        .post(`/api/admin/demo-requests/${leadId}/convert`)
        .set('Cookie', adminCookie)
        .send({ batch_id: testBatchId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /already enrolled/i);
    });

    it('CSV Export: Should neutralize CSV formula injection characters (=, +, -, @) with single quote prefix', async () => {
      // 1. Create lead with potential formula injection payload in student_name and city
      await pool.query(`
        INSERT INTO demo_requests (
          reference_no, course_id, user_id, student_name, email, phone, city,
          preferred_demo_type, consent_given, consent_at, status
        ) VALUES ('DEMO-2026-CSV1', ?, ?, '=CMD("calc.exe")', 'csv_inj@example.com', '9870000005', '@MALICIOUS_CITY', 'live', 1, NOW(), 'pending')
      `, [testCourseId, student3UserId]);

      // 2. Export CSV
      const res = await request(app)
        .get('/api/admin/demo-requests/export')
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'text/csv; charset=utf-8');

      // 3. Verify formula injection neutralized
      assert.match(res.text, /"'=CMD\(""calc\.exe""\)"/, 'Formula starting with = must be escaped with single quote');
      assert.match(res.text, /"'@MALICIOUS_CITY"/, 'Formula starting with @ must be escaped with single quote');
    });

    it('Privacy: Public course demo settings endpoint must not leak any student PII', async () => {
      const res = await request(app).get(`/api/courses/${testCourseId}/demo-settings`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify no student PII fields present in public response
      const keys = Object.keys(res.body.data);
      assert.strictEqual(keys.includes('student_name'), false);
      assert.strictEqual(keys.includes('email'), false);
      assert.strictEqual(keys.includes('phone'), false);
      assert.strictEqual(keys.includes('admin_notes'), false);
    });
  });
});

