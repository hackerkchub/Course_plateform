import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Section 19.4 Step 11: Wishlist, Reviews & Search Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();

  let adminUser = null;
  let adminToken = null;
  let studentUserA = null;
  let studentTokenA = null;
  let studentUserB = null;
  let studentTokenB = null;

  let testCategoryId = null;
  let testSubcategoryId = null;
  let testCourseId = null;
  let draftCourseId = null;
  let testReviewId = null;

  const createdUserIds = [];
  const createdCourseIds = [];
  const createdSubcategoryIds = [];
  const createdCategoryIds = [];

  before(async () => {
    // 1. Strict Database Verification
    const [dbCheck] = await pool.query('SELECT DATABASE() AS current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');

    // 2. Create Admin Account
    const [adminResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'admin', 'active', TRUE)`,
      [`Admin_S11_${testRunId}`, `admin_s11_${testRunId}@test.com`]
    );
    adminUser = { id: adminResult.insertId, role: 'admin' };
    adminToken = generateAccessToken(adminUser);
    createdUserIds.push(adminUser.id);

    // 3. Create Student Account A (Enrolled)
    const [studentAResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'user', 'active', TRUE)`,
      [`Student_A_${testRunId}`, `student_a_${testRunId}@test.com`]
    );
    studentUserA = { id: studentAResult.insertId, role: 'user' };
    studentTokenA = generateAccessToken(studentUserA);
    createdUserIds.push(studentUserA.id);

    // 4. Create Student Account B (Not Enrolled)
    const [studentBResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'user', 'active', TRUE)`,
      [`Student_B_${testRunId}`, `student_b_${testRunId}@test.com`]
    );
    studentUserB = { id: studentBResult.insertId, role: 'user' };
    studentTokenB = generateAccessToken(studentUserB);
    createdUserIds.push(studentUserB.id);

    // 5. Create Test Category & Subcategory
    const [catResult] = await pool.query(
      `INSERT INTO categories (name, slug, status, display_order)
       VALUES (?, ?, 'active', 1)`,
      [`Cat S11 ${testRunId}`, `cat-s11-${testRunId}`]
    );
    testCategoryId = catResult.insertId;
    createdCategoryIds.push(testCategoryId);

    const [subcatResult] = await pool.query(
      `INSERT INTO subcategories (category_id, name, slug, status, display_order)
       VALUES (?, ?, ?, 'active', 1)`,
      [testCategoryId, `Subcat S11 ${testRunId}`, `subcat-s11-${testRunId}`]
    );
    testSubcategoryId = subcatResult.insertId;
    createdSubcategoryIds.push(testSubcategoryId);

    // 6. Create Published Course
    const [courseResult] = await pool.query(
      `INSERT INTO courses (
         category_id, subcategory_id, course_code, course_name, slug,
         short_description, description, course_level, language, mode,
         duration_hours, price, is_free, status, published_at
       ) VALUES (
         ?, ?, ?, ?, ?,
         'Full stack course description', '<p>Full details</p>', 'beginner', 'English', 'online',
         30.0, 0.00, TRUE, 'published', NOW()
       )`,
      [
        testCategoryId,
        testSubcategoryId,
        `S11-CRS-${testRunId}`,
        `React Node Mastery ${testRunId}`,
        `react-node-mastery-${testRunId}`,
      ]
    );
    testCourseId = courseResult.insertId;
    createdCourseIds.push(testCourseId);

    // 7. Create Draft (Unpublished) Course
    const [draftResult] = await pool.query(
      `INSERT INTO courses (
         category_id, subcategory_id, course_code, course_name, slug,
         short_description, description, course_level, language, mode,
         duration_hours, price, is_free, status
       ) VALUES (
         ?, ?, ?, ?, ?,
         'Draft course description', '<p>Draft details</p>', 'beginner', 'English', 'online',
         10.0, 0.00, TRUE, 'draft'
       )`,
      [
        testCategoryId,
        testSubcategoryId,
        `S11-DFT-${testRunId}`,
        `Draft Course ${testRunId}`,
        `draft-course-${testRunId}`,
      ]
    );
    draftCourseId = draftResult.insertId;
    createdCourseIds.push(draftCourseId);

    // 8. Enroll Student A in Published Course (so Student A is eligible for reviews)
    await pool.query(
      `INSERT INTO course_enrollments (user_id, course_id, enrollment_source, enrollment_status, enrolled_at)
       VALUES (?, ?, 'free', 'active', NOW())`,
      [studentUserA.id, testCourseId]
    );
  });

  after(async () => {
    try {
      if (testCourseId || draftCourseId) {
        const cIds = [testCourseId, draftCourseId].filter(Boolean);
        const p = cIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM course_reviews WHERE course_id IN (${p})`, cIds);
        await pool.query(`DELETE FROM wishlists WHERE course_id IN (${p})`, cIds);
        await pool.query(`DELETE FROM course_enrollments WHERE course_id IN (${p})`, cIds);
        await pool.query(`DELETE FROM courses WHERE id IN (${p})`, cIds);
      }
      if (testSubcategoryId) {
        await pool.query(`DELETE FROM subcategories WHERE id = ?`, [testSubcategoryId]);
      }
      if (testCategoryId) {
        await pool.query(`DELETE FROM categories WHERE id = ?`, [testCategoryId]);
      }
      if (createdUserIds.length > 0) {
        const p = createdUserIds.map(() => '?').join(',');
        await pool.query(`DELETE FROM users WHERE id IN (${p})`, createdUserIds);
      }
    } finally {
      await closePool();
    }
  });

  // ==========================================
  // 1. WISHLIST ENDPOINTS TESTS
  // ==========================================
  describe('1. Wishlist Operations (Section 15.2)', () => {
    it('POST /api/courses/:id/wishlist should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/wishlist`)
        .expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/wishlist should reject non-existent course with 404', async () => {
      const res = await request(app)
        .post('/api/courses/99999999/wishlist')
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(404);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/wishlist should reject unpublished course with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${draftCourseId}/wishlist`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/wishlist should add published course for Student A (201)', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/wishlist`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.wishlisted, true);
      assert.strictEqual(res.body.data.course_id, testCourseId);

      // Verify DB row exists and course.wishlist_count is 1
      const [wRows] = await pool.query(
        'SELECT * FROM wishlists WHERE user_id = ? AND course_id = ?',
        [studentUserA.id, testCourseId]
      );
      assert.strictEqual(wRows.length, 1);

      const [cRows] = await pool.query('SELECT wishlist_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].wishlist_count), 1);
    });

    it('POST /api/courses/:id/wishlist should be idempotent on repeat addition (200)', async () => {
      // Re-add same course
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/wishlist`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.wishlisted, true);
      assert.strictEqual(res.body.data.already_wishlisted, true);

      // Verify course.wishlist_count is STILL 1 (not duplicated)
      const [cRows] = await pool.query('SELECT wishlist_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].wishlist_count), 1);
    });

    it('GET /api/me/wishlist should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .get('/api/me/wishlist')
        .expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('GET /api/me/wishlist should return wishlisted courses for Student A (200)', async () => {
      const res = await request(app)
        .get('/api/me/wishlist')
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pagination.total, 1);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].id, testCourseId);
      assert.strictEqual(res.body.data[0].wishlisted, true);
    });

    it('GET /api/me/wishlist should enforce user isolation: Student B has empty wishlist (200)', async () => {
      const res = await request(app)
        .get('/api/me/wishlist')
        .set('Authorization', `Bearer ${studentTokenB}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pagination.total, 0);
      assert.strictEqual(res.body.data.length, 0);
    });

    it('DELETE /api/courses/:id/wishlist should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .delete(`/api/courses/${testCourseId}/wishlist`)
        .expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('DELETE /api/courses/:id/wishlist should remove course from Student A wishlist (200)', async () => {
      const res = await request(app)
        .delete(`/api/courses/${testCourseId}/wishlist`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.wishlisted, false);
      assert.strictEqual(res.body.data.removed, true);

      // Verify row deleted from wishlists table
      const [wRows] = await pool.query(
        'SELECT * FROM wishlists WHERE user_id = ? AND course_id = ?',
        [studentUserA.id, testCourseId]
      );
      assert.strictEqual(wRows.length, 0);

      // Verify counter decremented to 0
      const [cRows] = await pool.query('SELECT wishlist_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].wishlist_count), 0);
    });

    it('DELETE /api/courses/:id/wishlist should be idempotent on repeat deletion (200)', async () => {
      const res = await request(app)
        .delete(`/api/courses/${testCourseId}/wishlist`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.removed, false);

      // Verify counter never drops below 0
      const [cRows] = await pool.query('SELECT wishlist_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].wishlist_count), 0);
    });
  });

  // ==========================================
  // 2. PUBLIC REVIEWS ENDPOINT TESTS
  // ==========================================
  describe('2. Public Course Reviews API (Section 9.1 & 15.3)', () => {
    it('GET /api/courses/:id/reviews should be accessible publicly without token (200)', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/reviews`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.pagination.total, 0);
    });

    it('GET /api/courses/:id/reviews should reject non-existent course with 404', async () => {
      const res = await request(app)
        .get('/api/courses/99999999/reviews')
        .expect(404);
      assert.strictEqual(res.body.success, false);
    });
  });

  // ==========================================
  // 3. REVIEW SUBMISSION & ELIGIBILITY TESTS
  // ==========================================
  describe('3. Review Submission & Verification (Section 15.3)', () => {
    it('POST /api/courses/:id/reviews should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .send({ rating: 5, text: 'Great!' })
        .expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/reviews should reject unenrolled Student B with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .set('Authorization', `Bearer ${studentTokenB}`)
        .send({
          rating: 5,
          title: 'Unenrolled review attempt',
          text: 'I should not be allowed to review without enrollment',
        })
        .expect(403);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('enrolled students'));
    });

    it('POST /api/courses/:id/reviews should reject rating < 1 with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({ rating: 0, text: 'Zero rating' })
        .expect(400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/reviews should reject rating > 5 with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({ rating: 6, text: 'Six rating' })
        .expect(400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/courses/:id/reviews should allow enrolled Student A to submit review (201)', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({
          rating: 5,
          title: 'Excellent Course Material',
          text: 'Loved the hands-on modules and mentorship.',
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.rating, 5);
      assert.strictEqual(res.body.data.moderation_status, 'pending');
      assert.ok(res.body.data.id);

      testReviewId = res.body.data.id;

      // Verify row in course_reviews table has is_verified_enrollment = TRUE and status = 'pending'
      const [rRows] = await pool.query('SELECT * FROM course_reviews WHERE id = ?', [testReviewId]);
      assert.strictEqual(rRows.length, 1);
      assert.strictEqual(Boolean(rRows[0].is_verified_enrollment), true);
      assert.strictEqual(rRows[0].moderation_status, 'pending');

      // Verify pending review does NOT increment course.rating_count
      const [cRows] = await pool.query('SELECT rating_count, rating_avg FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_count), 0);
      assert.strictEqual(Number(cRows[0].rating_avg), 0);
    });

    it('POST /api/courses/:id/reviews should reject duplicate review by Student A with 409 Conflict', async () => {
      const res = await request(app)
        .post(`/api/courses/${testCourseId}/reviews`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({ rating: 4, text: 'Second review attempt' })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already reviewed'));
    });

    it('GET /api/courses/:id/reviews should NOT display pending review in public listing', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/reviews`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pagination.total, 0);
      assert.strictEqual(res.body.data.length, 0);
    });
  });

  // ==========================================
  // 4. ADMIN REVIEW MODERATION & RATING SYNC
  // ==========================================
  describe('4. Admin Moderation & Dynamic Rating Calculation (Section 15.3)', () => {
    it('GET /api/admin/reviews should reject student role with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/reviews')
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(403);
      assert.strictEqual(res.body.success, false);
    });

    it('GET /api/admin/reviews should allow admin to view pending reviews (200)', async () => {
      const res = await request(app)
        .get('/api/admin/reviews?moderation_status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.pagination.total >= 1);

      const found = res.body.data.find(r => r.id === testReviewId);
      assert.ok(found);
      assert.strictEqual(found.moderation_status, 'pending');
      assert.strictEqual(found.student.email, `student_a_${testRunId}@test.com`);
    });

    it('PATCH /api/admin/reviews/:id/moderate should reject student role with 403 Forbidden', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${testReviewId}/moderate`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({ moderation_status: 'approved' })
        .expect(403);
      assert.strictEqual(res.body.success, false);
    });

    it('PATCH /api/admin/reviews/:id/moderate should allow admin to approve review (200)', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${testReviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ moderation_status: 'approved', reason: 'High quality review' })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.moderation_status, 'approved');
      assert.strictEqual(res.body.data.course_rating_avg, 5.00);
      assert.strictEqual(res.body.data.course_rating_count, 1);

      // Verify courses table has updated rating_avg and rating_count
      const [cRows] = await pool.query('SELECT rating_avg, rating_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_avg), 5.00);
      assert.strictEqual(Number(cRows[0].rating_count), 1);

      // Verify audit_logs entry
      const [audit] = await pool.query(
        'SELECT * FROM audit_logs WHERE entity_type = "review" AND entity_id = ? AND action = "review.moderate"',
        [testReviewId]
      );
      assert.strictEqual(audit.length, 1);
    });

    it('GET /api/courses/:id/reviews should now display approved review publicly with privacy scrub', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/reviews`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pagination.total, 1);
      assert.strictEqual(res.body.data.length, 1);

      const review = res.body.data[0];
      assert.strictEqual(review.id, testReviewId);
      assert.strictEqual(review.rating, 5);
      assert.strictEqual(review.user_name, `Student_A_${testRunId}`);
      assert.strictEqual(review.is_verified_enrollment, true);

      // CRITICAL PRIVACY CHECK: email and phone MUST NOT be exposed
      assert.strictEqual(review.email, undefined);
      assert.strictEqual(review.phone, undefined);
      assert.strictEqual(review.student_email, undefined);
    });
  });

  // ==========================================
  // 5. STUDENT REVIEW EDIT & DELETE LIFECYCLE
  // ==========================================
  describe('5. Student Review Edit & Delete Lifecycle (Section 15.3)', () => {
    it('PATCH /api/me/reviews/:id should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .patch(`/api/me/reviews/${testReviewId}`)
        .send({ rating: 4 })
        .expect(401);
      assert.strictEqual(res.body.success, false);
    });

    it('PATCH /api/me/reviews/:id should reject Student B editing Student A review with 404', async () => {
      const res = await request(app)
        .patch(`/api/me/reviews/${testReviewId}`)
        .set('Authorization', `Bearer ${studentTokenB}`)
        .send({ rating: 4 })
        .expect(404);
      assert.strictEqual(res.body.success, false);
    });

    it('PATCH /api/me/reviews/:id should allow Student A to edit review and revert status to pending (200)', async () => {
      const res = await request(app)
        .patch(`/api/me/reviews/${testReviewId}`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .send({
          rating: 4,
          title: 'Updated title: Very good course',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.moderation_status, 'pending');

      // Verify DB row status reverted to 'pending'
      const [rRows] = await pool.query('SELECT moderation_status, rating FROM course_reviews WHERE id = ?', [testReviewId]);
      assert.strictEqual(rRows[0].moderation_status, 'pending');
      assert.strictEqual(Number(rRows[0].rating), 4);

      // RE-MODERATION INVARIANT: Course rating_avg and rating_count must dynamically exclude the now-pending review!
      const [cRows] = await pool.query('SELECT rating_avg, rating_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_avg), 0.00);
      assert.strictEqual(Number(cRows[0].rating_count), 0);
    });

    it('PATCH /api/admin/reviews/:id/moderate should approve edited review with new rating (200)', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${testReviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ moderation_status: 'approved' })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_rating_avg, 4.00);
      assert.strictEqual(res.body.data.course_rating_count, 1);

      // Verify course rating is now 4.00
      const [cRows] = await pool.query('SELECT rating_avg, rating_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_avg), 4.00);
      assert.strictEqual(Number(cRows[0].rating_count), 1);
    });

    it('DELETE /api/me/reviews/:id should reject Student B deleting Student A review with 404', async () => {
      const res = await request(app)
        .delete(`/api/me/reviews/${testReviewId}`)
        .set('Authorization', `Bearer ${studentTokenB}`)
        .expect(404);
      assert.strictEqual(res.body.success, false);
    });

    it('DELETE /api/me/reviews/:id should allow Student A to delete own review and re-sync course stats (200)', async () => {
      const res = await request(app)
        .delete(`/api/me/reviews/${testReviewId}`)
        .set('Authorization', `Bearer ${studentTokenA}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);

      // Verify review row deleted
      const [rRows] = await pool.query('SELECT * FROM course_reviews WHERE id = ?', [testReviewId]);
      assert.strictEqual(rRows.length, 0);

      // DYNAMIC RECALCULATION INVARIANT: course rating dynamically reverts to 0.00, count 0
      const [cRows] = await pool.query('SELECT rating_avg, rating_count FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(cRows[0].rating_avg), 0.00);
      assert.strictEqual(Number(cRows[0].rating_count), 0);
    });
  });

  // ==========================================
  // 6. SEARCH & CATALOG INTEGRATION TESTS
  // ==========================================
  describe('6. Search & Catalog Integration (Section 9.1 & 19.4)', () => {
    it('GET /api/search should match courses with q parameter (200)', async () => {
      const res = await request(app)
        .get(`/api/search?q=React`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.courses));

      const found = res.body.data.courses.find(c => c.id === testCourseId);
      assert.ok(found);
      assert.ok(found.name.includes('React Node Mastery'));
    });

    it('GET /api/search should reject queries shorter than 2 chars with 400 Bad Request', async () => {
      const res = await request(app)
        .get('/api/search?q=a')
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });
  });
});
