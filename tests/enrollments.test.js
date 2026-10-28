import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Phase 10 / Step 10: Course Enrollments & Lesson Progress Subsystem Automated Tests', () => {
  let pool;

  let superAdminToken;
  let adminToken;
  let counsellorToken;
  let student1Token;
  let student2Token;
  let unenrolledStudentToken;

  let superAdminCookie;
  let adminCookie;
  let counsellorCookie;
  let student1Cookie;
  let student2Cookie;
  let unenrolledStudentCookie;

  let superAdminUserId;
  let adminUserId;
  let counsellorUserId;
  let student1UserId;
  let student2UserId;
  let unenrolledStudentUserId;

  let categoryId;
  let subcategoryId;

  let freeCourseId;
  let paidCourseId;
  let draftCourseId;
  let limitedCourseId;
  let eligibilityCourseId;

  let freeBatch1Id;
  let freeBatchZeroSeatsId;
  let freeBatchClosedId;
  let freeBatch2Id;
  let foreignBatchId;

  let moduleId;
  let lesson1Id;
  let lesson2Id;

  const timestamp = Date.now();

  before(async () => {
    pool = getPool();

    // 1. Create synthetic users
    const [superAdminRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'super_admin', 'active')`,
      [`google_p10_sa_${timestamp}`, `p10_sa_${timestamp}@example.com`, 'Phase 10 Super Admin']
    );
    superAdminUserId = superAdminRes.insertId;

    const [adminRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'admin', 'active')`,
      [`google_p10_adm_${timestamp}`, `p10_adm_${timestamp}@example.com`, 'Phase 10 Admin']
    );
    adminUserId = adminRes.insertId;

    const [counsellorRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'counsellor', 'active')`,
      [`google_p10_cns_${timestamp}`, `p10_cns_${timestamp}@example.com`, 'Phase 10 Counsellor']
    );
    counsellorUserId = counsellorRes.insertId;

    const [student1Res] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
      [`google_p10_s1_${timestamp}`, `p10_s1_${timestamp}@example.com`, 'Phase 10 Student 1']
    );
    student1UserId = student1Res.insertId;

    const [student2Res] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
      [`google_p10_s2_${timestamp}`, `p10_s2_${timestamp}@example.com`, 'Phase 10 Student 2']
    );
    student2UserId = student2Res.insertId;

    const [unenrolledRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
      [`google_p10_un_${timestamp}`, `p10_un_${timestamp}@example.com`, 'Phase 10 Unenrolled Student']
    );
    unenrolledStudentUserId = unenrolledRes.insertId;

    // Tokens & Cookies
    superAdminToken = generateAccessToken({ id: superAdminUserId, email: `p10_sa_${timestamp}@example.com`, role: 'super_admin' });
    adminToken = generateAccessToken({ id: adminUserId, email: `p10_adm_${timestamp}@example.com`, role: 'admin' });
    counsellorToken = generateAccessToken({ id: counsellorUserId, email: `p10_cns_${timestamp}@example.com`, role: 'counsellor' });
    student1Token = generateAccessToken({ id: student1UserId, email: `p10_s1_${timestamp}@example.com`, role: 'user' });
    student2Token = generateAccessToken({ id: student2UserId, email: `p10_s2_${timestamp}@example.com`, role: 'user' });
    unenrolledStudentToken = generateAccessToken({ id: unenrolledStudentUserId, email: `p10_un_${timestamp}@example.com`, role: 'user' });

    superAdminCookie = `access_token=${superAdminToken}`;
    adminCookie = `access_token=${adminToken}`;
    counsellorCookie = `access_token=${counsellorToken}`;
    student1Cookie = `access_token=${student1Token}`;
    student2Cookie = `access_token=${student2Token}`;
    unenrolledStudentCookie = `access_token=${unenrolledStudentToken}`;

    // 2. Create Category & Subcategory
    const [catRes] = await pool.query(
      `INSERT INTO categories (name, slug, status) VALUES (?, ?, 'active')`,
      [`P10 Category ${timestamp}`, `p10-cat-${timestamp}`]
    );
    categoryId = catRes.insertId;

    const [subRes] = await pool.query(
      `INSERT INTO subcategories (category_id, name, slug, status) VALUES (?, ?, ?, 'active')`,
      [categoryId, `P10 Subcategory ${timestamp}`, `p10-sub-${timestamp}`]
    );
    subcategoryId = subRes.insertId;

    // 3. Create Courses
    // (a) Published Free Course with benefits
    const [freeCourseRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        price, offer_price, is_free, status, enrollment_count, created_by
      ) VALUES (?, ?, ?, 'Short desc', 'Full description', ?, ?, 'beginner', 'Hindi', 'online', 0, 0, 1, 'published', 0, ?)`,
      [`P10-FREE-${timestamp}`, `Free Course ${timestamp}`, `free-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
    );
    freeCourseId = freeCourseRes.insertId;

    await pool.query(
      `INSERT INTO course_benefits (course_id, lifetime_access, access_duration_days) VALUES (?, 1, 0)`,
      [freeCourseId]
    );

    // Batches for free course
    const [b1Res] = await pool.query(
      `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
       VALUES (?, 'Batch Alpha (Available)', DATE_ADD(NOW(), INTERVAL 5 DAY), 10, 5, 'open')`,
      [freeCourseId]
    );
    freeBatch1Id = b1Res.insertId;

    const [bZeroRes] = await pool.query(
      `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
       VALUES (?, 'Batch Full (0 Seats)', DATE_ADD(NOW(), INTERVAL 5 DAY), 10, 0, 'open')`,
      [freeCourseId]
    );
    freeBatchZeroSeatsId = bZeroRes.insertId;

    const [bClosedRes] = await pool.query(
      `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
       VALUES (?, 'Batch Closed', DATE_ADD(NOW(), INTERVAL 5 DAY), 10, 5, 'closed')`,
      [freeCourseId]
    );
    freeBatchClosedId = bClosedRes.insertId;

    const [b2Res] = await pool.query(
      `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
       VALUES (?, 'Batch Beta (Target)', DATE_ADD(NOW(), INTERVAL 5 DAY), 10, 4, 'open')`,
      [freeCourseId]
    );
    freeBatch2Id = b2Res.insertId;

    // Curriculum for free course
    const [modRes] = await pool.query(
      `INSERT INTO course_modules (course_id, title, display_order, is_published)
       VALUES (?, 'Module 1: Foundations', 1, 1)`,
      [freeCourseId]
    );
    moduleId = modRes.insertId;

    const [l1Res] = await pool.query(
      `INSERT INTO course_lessons (module_id, title, lesson_type, content_url, duration_seconds, is_preview, is_published, display_order)
       VALUES (?, 'Lesson 1: Intro', 'video', 'https://video.example.com/l1.mp4', 600, 1, 1, 1)`,
      [moduleId]
    );
    lesson1Id = l1Res.insertId;

    const [l2Res] = await pool.query(
      `INSERT INTO course_lessons (module_id, title, lesson_type, content_url, duration_seconds, is_preview, is_published, display_order)
       VALUES (?, 'Lesson 2: Advanced Concepts', 'video', 'https://video.example.com/l2.mp4', 900, 0, 1, 2)`,
      [moduleId]
    );
    lesson2Id = l2Res.insertId;

    await pool.query(
      `UPDATE courses SET total_modules = 1, total_lessons = 2 WHERE id = ?`,
      [freeCourseId]
    );

    // (b) Paid Course (is_free = 0)
    const [paidCourseRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        price, offer_price, is_free, status, enrollment_count, created_by
      ) VALUES (?, ?, ?, 'Paid desc', 'Paid description', ?, ?, 'intermediate', 'English', 'online', 4999, 2999, 0, 'published', 0, ?)`,
      [`P10-PAID-${timestamp}`, `Paid Course ${timestamp}`, `paid-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
    );
    paidCourseId = paidCourseRes.insertId;

    // (c) Draft Course (status = 'draft')
    const [draftCourseRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        price, is_free, status, enrollment_count, created_by
      ) VALUES (?, ?, ?, 'Draft desc', 'Draft description', ?, ?, 'beginner', 'Hindi', 'online', 0, 1, 'draft', 0, ?)`,
      [`P10-DRAFT-${timestamp}`, `Draft Course ${timestamp}`, `draft-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
    );
    draftCourseId = draftCourseRes.insertId;

    // (d) Course with Enrollment Limit
    const [limitedCourseRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        price, is_free, status, enrollment_count, created_by
      ) VALUES (?, ?, ?, 'Limited desc', 'Limited description', ?, ?, 'beginner', 'Hindi', 'online', 0, 1, 'published', 2, ?)`,
      [`P10-LIMIT-${timestamp}`, `Limited Course ${timestamp}`, `limited-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
    );
    limitedCourseId = limitedCourseRes.insertId;

    await pool.query(
      `INSERT INTO course_enrollment_settings (course_id, enrollment_limit) VALUES (?, 2)`,
      [limitedCourseId]
    );

    // (e) Course with Eligibility Rules Enabled
    const [eligCourseRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        price, is_free, status, enrollment_count, created_by
      ) VALUES (?, ?, ?, 'Elig desc', 'Elig description', ?, ?, 'advanced', 'Hindi', 'online', 0, 1, 'published', 0, ?)`,
      [`P10-ELIG-${timestamp}`, `Eligibility Course ${timestamp}`, `elig-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
    );
    eligibilityCourseId = eligCourseRes.insertId;

    await pool.query(
      `INSERT INTO course_eligibility_rules (course_id, eligibility_enabled, minimum_qualification, minimum_percentage)
       VALUES (?, 1, 'graduate', 60.00)`,
      [eligibilityCourseId]
    );

    // Foreign Batch (belongs to paid course, not free course)
    const [foreignBatchRes] = await pool.query(
      `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
       VALUES (?, 'Paid Batch', DATE_ADD(NOW(), INTERVAL 5 DAY), 20, 15, 'open')`,
      [paidCourseId]
    );
    foreignBatchId = foreignBatchRes.insertId;
  });

  after(async () => {
    // Cleanup test data
    try {
      await pool.query(`DELETE FROM lesson_progress WHERE user_id IN (?, ?, ?, ?)`, [
        student1UserId, student2UserId, unenrolledStudentUserId, adminUserId
      ]);
      await pool.query(`DELETE FROM course_enrollments WHERE user_id IN (?, ?, ?, ?)`, [
        student1UserId, student2UserId, unenrolledStudentUserId, adminUserId
      ]);
      await pool.query(`DELETE FROM eligibility_checks WHERE user_id IN (?, ?, ?)`, [
        student1UserId, student2UserId, unenrolledStudentUserId
      ]);
      await pool.query(`DELETE FROM course_lessons WHERE module_id = ?`, [moduleId]);
      await pool.query(`DELETE FROM course_modules WHERE course_id = ?`, [freeCourseId]);
      await pool.query(`DELETE FROM course_batches WHERE course_id IN (?, ?)`, [freeCourseId, paidCourseId]);
      await pool.query(`DELETE FROM course_benefits WHERE course_id = ?`, [freeCourseId]);
      await pool.query(`DELETE FROM course_enrollment_settings WHERE course_id = ?`, [limitedCourseId]);
      await pool.query(`DELETE FROM course_eligibility_rules WHERE course_id = ?`, [eligibilityCourseId]);
      await pool.query(`DELETE FROM courses WHERE id IN (?, ?, ?, ?, ?)`, [
        freeCourseId, paidCourseId, draftCourseId, limitedCourseId, eligibilityCourseId
      ]);
      await pool.query(`DELETE FROM subcategories WHERE id = ?`, [subcategoryId]);
      await pool.query(`DELETE FROM categories WHERE id = ?`, [categoryId]);
      await pool.query(`DELETE FROM users WHERE id IN (?, ?, ?, ?, ?, ?)`, [
        superAdminUserId, adminUserId, counsellorUserId, student1UserId, student2UserId, unenrolledStudentUserId
      ]);
    } catch {
      // Ignore teardown errors
    } finally {
      await closePool();
    }
  });

  describe('1. Free Course Self-Enrollment Validation (POST /api/courses/:id/enroll)', () => {
    it('should reject enrollment for unauthenticated guest with 401', async () => {
      const res = await request(app).post(`/api/courses/${freeCourseId}/enroll`).send({});
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('should reject enrollment for unpublished/draft course with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${draftCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({});
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not published/i);
    });

    it('should reject self-enrollment for paid course with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${paidCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({});
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /only permitted for free courses/i);
    });

    it('should reject batch that does not belong to the course with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${freeCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({ batch_id: foreignBatchId });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /does not belong to this course/i);
    });

    it('should reject batch with 0 available seats with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/courses/${freeCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({ batch_id: freeBatchZeroSeatsId });
      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /fully booked/i);
    });

    it('should reject course when enrollment limit has been reached with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${limitedCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({});
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /limit has been reached/i);
    });

    it('should successfully enroll student into free course with batch and decrement seats', async () => {
      // Check initial batch seats
      const [bBefore] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [freeBatch1Id]);
      const initialSeats = Number(bBefore[0].seats_available);

      const res = await request(app)
        .post(`/api/courses/${freeCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({ batch_id: freeBatch1Id });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.enrollment_id);
      assert.strictEqual(res.body.data.enrollment_status, 'active');

      // Verify batch seat was decremented atomically
      const [bAfter] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [freeBatch1Id]);
      assert.strictEqual(Number(bAfter[0].seats_available), initialSeats - 1);

      // Verify course enrollment_count incremented
      const [cAfter] = await pool.query('SELECT enrollment_count FROM courses WHERE id = ?', [freeCourseId]);
      assert.strictEqual(Number(cAfter[0].enrollment_count), 1);
    });

    it('should reject duplicate enrollment for the same user and course with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/courses/${freeCourseId}/enroll`)
        .set('Cookie', student1Cookie)
        .send({ batch_id: freeBatch1Id });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /already enrolled/i);
    });
  });

  describe('2. Eligibility Evaluation Enforcement during Enrollment (Section 15.1 & 18.5)', () => {
    it('should reject enrollment when eligibility is enabled but user has not taken assessment', async () => {
      const res = await request(app)
        .post(`/api/courses/${eligibilityCourseId}/enroll`)
        .set('Cookie', student2Cookie)
        .send({});

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /must complete the course eligibility assessment/i);
    });

    it('should reject client-supplied eligible: true or result: eligible bypass attempt', async () => {
      const res = await request(app)
        .post(`/api/courses/${eligibilityCourseId}/enroll`)
        .set('Cookie', student2Cookie)
        .send({ eligible: true, result: 'eligible' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /must complete the course eligibility assessment/i);
    });

    it('should reject enrollment when latest eligibility check evaluated to not_eligible', async () => {
      // Insert a not_eligible check for student2
      await pool.query(
        `INSERT INTO eligibility_checks (user_id, course_id, answers, result, message, checked_at)
         VALUES (?, ?, '{"percentage": 45}', 'not_eligible', 'Percentage 45% is below minimum required 60%', NOW())`,
        [student2UserId, eligibilityCourseId]
      );

      const res = await request(app)
        .post(`/api/courses/${eligibilityCourseId}/enroll`)
        .set('Cookie', student2Cookie)
        .send({});

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not eligible to enroll/i);
    });

    it('should permit enrollment when latest eligibility check evaluated to eligible', async () => {
      // Insert an eligible check for student2
      await pool.query(
        `INSERT INTO eligibility_checks (user_id, course_id, answers, result, message, checked_at)
         VALUES (?, ?, '{"qualification": "graduate", "percentage": 75}', 'eligible', 'Congratulations, you meet all eligibility criteria!', DATE_ADD(NOW(), INTERVAL 1 SECOND))`,
        [student2UserId, eligibilityCourseId]
      );

      const res = await request(app)
        .post(`/api/courses/${eligibilityCourseId}/enroll`)
        .set('Cookie', student2Cookie)
        .send({});

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.enrollment_status, 'active');
    });
  });

  describe('3. Student My Courses (GET /api/me/enrollments)', () => {
    it('should return 401 for unauthenticated guest', async () => {
      const res = await request(app).get('/api/me/enrollments');
      assert.strictEqual(res.status, 401);
    });

    it('should return empty list for user with zero enrollments', async () => {
      const res = await request(app)
        .get('/api/me/enrollments')
        .set('Cookie', unenrolledStudentCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 0);
      assert.strictEqual(res.body.pagination.total, 0);
    });

    it('should return enrolled courses strictly scoped to authenticated user', async () => {
      const res = await request(app)
        .get('/api/me/enrollments')
        .set('Cookie', student1Cookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].course.id, freeCourseId);
      assert.strictEqual(res.body.data[0].enrollment_status, 'active');
      assert.strictEqual(res.body.data[0].progress_percentage, 0);
    });
  });

  describe('4. Enrolled Curriculum Access (GET /api/me/courses/:id/curriculum)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).get(`/api/me/courses/${freeCourseId}/curriculum`);
      assert.strictEqual(res.status, 401);
    });

    it('should return 403 Forbidden for user not enrolled in course', async () => {
      const res = await request(app)
        .get(`/api/me/courses/${freeCourseId}/curriculum`)
        .set('Cookie', unenrolledStudentCookie);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not enrolled in this course/i);
    });

    it('should return complete curriculum with lesson video URLs and progress for enrolled student', async () => {
      const res = await request(app)
        .get(`/api/me/courses/${freeCourseId}/curriculum`)
        .set('Cookie', student1Cookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_id, freeCourseId);
      assert.strictEqual(res.body.data.modules.length, 1);

      const module = res.body.data.modules[0];
      assert.strictEqual(module.lessons.length, 2);
      assert.strictEqual(module.lessons[0].id, lesson1Id);
      assert.strictEqual(module.lessons[0].content_url, 'https://video.example.com/l1.mp4');
      assert.strictEqual(module.lessons[0].progress.completed, false);
    });
  });

  describe('5. Lesson Progress Tracking (POST /api/me/lessons/:lessonId/progress)', () => {
    it('should reject progress update from unauthenticated guest with 401', async () => {
      const res = await request(app)
        .post(`/api/me/lessons/${lesson1Id}/progress`)
        .send({ completed: true, last_position_seconds: 120 });
      assert.strictEqual(res.status, 401);
    });

    it('should reject progress update from user not enrolled in course with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/me/lessons/${lesson1Id}/progress`)
        .set('Cookie', unenrolledStudentCookie)
        .send({ completed: true, last_position_seconds: 120 });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not enrolled/i);
    });

    it('should save progress and update position seconds for enrolled student', async () => {
      const res = await request(app)
        .post(`/api/me/lessons/${lesson1Id}/progress`)
        .set('Cookie', student1Cookie)
        .send({ completed: true, last_position_seconds: 450 });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.lesson_id, lesson1Id);
      assert.strictEqual(res.body.data.completed, true);
      assert.strictEqual(res.body.data.last_position_seconds, 450);
      assert.strictEqual(res.body.data.course_completed, false);

      // Verify progress reflected in My Courses
      const myCoursesRes = await request(app)
        .get('/api/me/enrollments')
        .set('Cookie', student1Cookie);
      assert.strictEqual(myCoursesRes.body.data[0].progress_percentage, 50); // 1 of 2 lessons completed
      assert.strictEqual(myCoursesRes.body.data[0].last_lesson_id, lesson1Id);
    });

    it('should automatically mark course enrollment as completed when all lessons are completed', async () => {
      const res = await request(app)
        .post(`/api/me/lessons/${lesson2Id}/progress`)
        .set('Cookie', student1Cookie)
        .send({ completed: true, last_position_seconds: 880 });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_completed, true);

      // Verify enrollment status changed to completed in DB
      const [enrollRows] = await pool.query(
        `SELECT enrollment_status, completed_at FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [student1UserId, freeCourseId]
      );
      assert.strictEqual(enrollRows[0].enrollment_status, 'completed');
      assert.ok(enrollRows[0].completed_at);

      // Verify My Courses shows 100% progress
      const myCoursesRes = await request(app)
        .get('/api/me/enrollments')
        .set('Cookie', student1Cookie);
      assert.strictEqual(myCoursesRes.body.data[0].progress_percentage, 100);
      assert.strictEqual(myCoursesRes.body.data[0].enrollment_status, 'completed');
    });
  });

  describe('6. Admin Enrollment Management Endpoints', () => {
    it('should reject GET /api/admin/enrollments for guest (401), user (403), counsellor (403)', async () => {
      const guestRes = await request(app).get('/api/admin/enrollments');
      assert.strictEqual(guestRes.status, 401);

      const userRes = await request(app)
        .get('/api/admin/enrollments')
        .set('Cookie', student1Cookie);
      assert.strictEqual(userRes.status, 403);

      const counsellorRes = await request(app)
        .get('/api/admin/enrollments')
        .set('Cookie', counsellorCookie);
      assert.strictEqual(counsellorRes.status, 403);
    });

    it('should permit GET /api/admin/enrollments for admin and super_admin', async () => {
      const adminRes = await request(app)
        .get('/api/admin/enrollments')
        .set('Cookie', adminCookie);
      assert.strictEqual(adminRes.status, 200);
      assert.strictEqual(adminRes.body.success, true);
      assert.ok(Array.isArray(adminRes.body.data));

      const superAdminRes = await request(app)
        .get('/api/admin/enrollments')
        .set('Cookie', superAdminCookie);
      assert.strictEqual(superAdminRes.status, 200);
      assert.strictEqual(superAdminRes.body.success, true);
    });

    it('should permit POST /api/admin/enrollments for admin manual enrollment', async () => {
      const res = await request(app)
        .post('/api/admin/enrollments')
        .set('Cookie', adminCookie)
        .send({
          user_id: unenrolledStudentUserId,
          course_id: paidCourseId,
          batch_id: foreignBatchId,
          notes: 'Bank transfer receipt #TXN987654',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.enrollment_source, 'admin_manual');
      assert.strictEqual(res.body.data.enrollment_status, 'active');
      assert.strictEqual(res.body.data.user_id, unenrolledStudentUserId);
      assert.strictEqual(res.body.data.course_id, paidCourseId);
    });

    it('should permit PATCH /api/admin/enrollments/:id to update enrollment access and status', async () => {
      // Find the enrollment we just created
      const [rows] = await pool.query(
        `SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [unenrolledStudentUserId, paidCourseId]
      );
      const enrollmentId = rows[0].id;

      const res = await request(app)
        .patch(`/api/admin/enrollments/${enrollmentId}`)
        .set('Cookie', adminCookie)
        .send({
          enrollment_status: 'cancelled',
          notes: 'Refunded upon student request',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.enrollment_status, 'cancelled');
      assert.match(res.body.data.notes, /Refunded/);
    });

    it('should reject PATCH /api/admin/enrollments/:id with batch belonging to different course with 400', async () => {
      const [rows] = await pool.query(
        `SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [student1UserId, freeCourseId]
      );
      const enrollmentId = rows[0].id;

      const res = await request(app)
        .patch(`/api/admin/enrollments/${enrollmentId}`)
        .set('Cookie', adminCookie)
        .send({ batch_id: foreignBatchId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Selected batch does not exist for this course/i);
    });

    it('should reject PATCH /api/admin/enrollments/:id with closed batch with 400', async () => {
      const [rows] = await pool.query(
        `SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [student1UserId, freeCourseId]
      );
      const enrollmentId = rows[0].id;

      const res = await request(app)
        .patch(`/api/admin/enrollments/${enrollmentId}`)
        .set('Cookie', adminCookie)
        .send({ batch_id: freeBatchClosedId });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Cannot reassign to closed batch/i);
    });

    it('should reject PATCH /api/admin/enrollments/:id with full batch (0 seats) with 409 and preserve existing seats', async () => {
      const [rows] = await pool.query(
        `SELECT id, batch_id FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [student1UserId, freeCourseId]
      );
      const enrollmentId = rows[0].id;
      const initialOldBatchId = rows[0].batch_id;

      const [oldBatchBefore] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [initialOldBatchId]);
      const initialOldSeats = Number(oldBatchBefore[0].seats_available);

      const res = await request(app)
        .patch(`/api/admin/enrollments/${enrollmentId}`)
        .set('Cookie', adminCookie)
        .send({ batch_id: freeBatchZeroSeatsId });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /New batch is fully booked/i);

      // Verify rollback: old batch seats unchanged
      const [oldBatchAfter] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [initialOldBatchId]);
      assert.strictEqual(Number(oldBatchAfter[0].seats_available), initialOldSeats);

      // Verify enrollment batch_id unchanged
      const [enrollAfter] = await pool.query('SELECT batch_id FROM course_enrollments WHERE id = ?', [enrollmentId]);
      assert.strictEqual(enrollAfter[0].batch_id, initialOldBatchId);
    });

    it('should successfully reassign enrollment to valid batch and atomically update both batch seats', async () => {
      const [rows] = await pool.query(
        `SELECT id, batch_id FROM course_enrollments WHERE user_id = ? AND course_id = ?`,
        [student1UserId, freeCourseId]
      );
      const enrollmentId = rows[0].id;
      const oldBatchId = rows[0].batch_id;

      const [oldBatchBefore] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [oldBatchId]);
      const [newBatchBefore] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [freeBatch2Id]);
      const oldSeatsBefore = Number(oldBatchBefore[0].seats_available);
      const newSeatsBefore = Number(newBatchBefore[0].seats_available);

      const res = await request(app)
        .patch(`/api/admin/enrollments/${enrollmentId}`)
        .set('Cookie', adminCookie)
        .send({ batch_id: freeBatch2Id });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.batch_id, freeBatch2Id);

      // Verify old batch seats restored (+1)
      const [oldBatchAfter] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [oldBatchId]);
      assert.strictEqual(Number(oldBatchAfter[0].seats_available), oldSeatsBefore + 1);

      // Verify new batch seats decremented (-1)
      const [newBatchAfter] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [freeBatch2Id]);
      assert.strictEqual(Number(newBatchAfter[0].seats_available), newSeatsBefore - 1);
    });
  });

  describe('7. Concurrency & Contention Tests (Correction 3)', () => {
    let concCourseId;
    let concBatchId;
    let concUserAId;
    let concUserBId;
    let concUserACookie;
    let concUserBCookie;

    before(async () => {
      // 1. Create two new independent users for concurrency test
      const [uARes] = await pool.query(
        `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
        [`google_p10_conc_a_${timestamp}`, `p10_conc_a_${timestamp}@example.com`, 'Conc User A']
      );
      concUserAId = uARes.insertId;

      const [uBRes] = await pool.query(
        `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
        [`google_p10_conc_b_${timestamp}`, `p10_conc_b_${timestamp}@example.com`, 'Conc User B']
      );
      concUserBId = uBRes.insertId;

      const tokenA = generateAccessToken({ id: concUserAId, email: `p10_conc_a_${timestamp}@example.com`, role: 'user' });
      const tokenB = generateAccessToken({ id: concUserBId, email: `p10_conc_b_${timestamp}@example.com`, role: 'user' });
      concUserACookie = `access_token=${tokenA}`;
      concUserBCookie = `access_token=${tokenB}`;

      // 2. Create a dedicated free course
      const [cRes] = await pool.query(
        `INSERT INTO courses (
          course_code, course_name, slug, short_description, description,
          category_id, subcategory_id, course_level, language, mode,
          price, offer_price, is_free, status, enrollment_count, created_by
        ) VALUES (?, ?, ?, 'Conc desc', 'Conc full description', ?, ?, 'beginner', 'Hindi', 'online', 0, 0, 1, 'published', 0, ?)`,
        [`P10-CONC-${timestamp}`, `Conc Course ${timestamp}`, `conc-course-${timestamp}`, categoryId, subcategoryId, adminUserId]
      );
      concCourseId = cRes.insertId;

      await pool.query(
        `INSERT INTO course_benefits (course_id, lifetime_access, access_duration_days) VALUES (?, 1, 0)`,
        [concCourseId]
      );

      // 3. Create open batch with EXACTLY ONE available seat
      const [bRes] = await pool.query(
        `INSERT INTO course_batches (course_id, batch_name, start_date, total_seats, seats_available, status)
         VALUES (?, 'Final Seat Batch', DATE_ADD(NOW(), INTERVAL 5 DAY), 10, 1, 'open')`,
        [concCourseId]
      );
      concBatchId = bRes.insertId;
    });

    after(async () => {
      try {
        await pool.query('DELETE FROM course_enrollments WHERE course_id = ?', [concCourseId]);
        await pool.query('DELETE FROM course_batches WHERE id = ?', [concBatchId]);
        await pool.query('DELETE FROM course_benefits WHERE course_id = ?', [concCourseId]);
        await pool.query('DELETE FROM courses WHERE id = ?', [concCourseId]);
        await pool.query('DELETE FROM users WHERE id IN (?, ?)', [concUserAId, concUserBId]);
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should handle simultaneous enrollment requests targeting the final seat: exactly one succeeds (201) and one conflicts (409)', async () => {
      // Verify initial state
      const [bBefore] = await pool.query('SELECT seats_available, total_seats FROM course_batches WHERE id = ?', [concBatchId]);
      assert.strictEqual(Number(bBefore[0].seats_available), 1, 'Batch must start with exactly 1 available seat');

      const [cBefore] = await pool.query('SELECT enrollment_count FROM courses WHERE id = ?', [concCourseId]);
      assert.strictEqual(Number(cBefore[0].enrollment_count), 0, 'Course enrollment_count must start at 0');

      // Fire concurrent requests using Promise.all targeting the last available seat
      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/courses/${concCourseId}/enroll`)
          .set('Cookie', concUserACookie)
          .send({ batch_id: concBatchId }),
        request(app)
          .post(`/api/courses/${concCourseId}/enroll`)
          .set('Cookie', concUserBCookie)
          .send({ batch_id: concBatchId }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      assert.deepStrictEqual(statuses, [201, 409], 'Exactly one request must succeed (201) and one must fail with Conflict (409)');

      // Verify the successful response
      const successRes = resA.status === 201 ? resA : resB;
      assert.strictEqual(successRes.body.success, true);
      assert.ok(successRes.body.data.enrollment_id);
      assert.strictEqual(successRes.body.data.enrollment_status, 'active');

      // Verify the conflict response
      const conflictRes = resA.status === 409 ? resA : resB;
      assert.strictEqual(conflictRes.body.success, false);
      assert.match(conflictRes.body.message, /fully booked|0 seats available/i);

      // Verify database integrity: seats_available must be exactly 0 (never negative)
      const [bAfter] = await pool.query('SELECT seats_available FROM course_batches WHERE id = ?', [concBatchId]);
      assert.strictEqual(Number(bAfter[0].seats_available), 0, 'seats_available must be exactly 0 and never negative');

      // Verify database integrity: courses.enrollment_count must be exactly 1
      const [cAfter] = await pool.query('SELECT enrollment_count FROM courses WHERE id = ?', [concCourseId]);
      assert.strictEqual(Number(cAfter[0].enrollment_count), 1, 'courses.enrollment_count must be exactly 1');

      // Verify database integrity: course_enrollments must contain exactly one row
      const [enrollRows] = await pool.query('SELECT id, user_id, batch_id, enrollment_status FROM course_enrollments WHERE course_id = ?', [concCourseId]);
      assert.strictEqual(enrollRows.length, 1, 'Exactly one enrollment record must exist in course_enrollments');
      assert.strictEqual(Number(enrollRows[0].batch_id), concBatchId);
      assert.strictEqual(enrollRows[0].enrollment_status, 'active');

      const expectedWinnerId = resA.status === 201 ? concUserAId : concUserBId;
      assert.strictEqual(Number(enrollRows[0].user_id), expectedWinnerId, 'Enrollment record must belong to the winning user');
    });
  });
});
