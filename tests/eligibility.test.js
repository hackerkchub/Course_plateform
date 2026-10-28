import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Phase 9: Course Eligibility Management & Evaluation Subsystem Automated Tests', () => {
  let pool;
  let superAdminToken;
  let adminToken;
  let counsellorToken;
  let studentToken;
  let anotherStudentToken;

  let superAdminCookie;
  let adminCookie;
  let counsellorCookie;
  let studentCookie;
  let anotherStudentCookie;

  let superAdminUserId;
  let adminUserId;
  let counsellorUserId;
  let studentUserId;
  let anotherStudentUserId;

  let testCategoryId;
  let testSubcategoryId;
  let publishedCourseId;
  let draftCourseId;

  const timestamp = Date.now();
  const catSlug = `p9-cat-${timestamp}`;
  const subSlug = `p9-sub-${timestamp}`;
  const pubCode = `P9-PUB-${timestamp.toString().slice(-5)}`;
  const draftCode = `P9-DFT-${timestamp.toString().slice(-5)}`;
  const pubSlug = `p9-published-course-${timestamp}`;
  const draftSlug = `p9-draft-course-${timestamp}`;

  before(async () => {
    pool = getPool();

    // 1. Create synthetic users
    const [superAdminRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'super_admin', 'active')`,
      [`google_p9_superadmin_${timestamp}`, `p9_superadmin_${timestamp}@example.com`, 'Phase 9 Super Admin']
    );
    superAdminUserId = superAdminRes.insertId;

    const [adminRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'admin', 'active')`,
      [`google_p9_admin_${timestamp}`, `p9_admin_${timestamp}@example.com`, 'Phase 9 Admin']
    );
    adminUserId = adminRes.insertId;

    const [counsellorRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'counsellor', 'active')`,
      [`google_p9_counsellor_${timestamp}`, `p9_counsellor_${timestamp}@example.com`, 'Phase 9 Counsellor']
    );
    counsellorUserId = counsellorRes.insertId;

    const [studentRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
      [`google_p9_student_${timestamp}`, `p9_student_${timestamp}@example.com`, 'Amit Kumar']
    );
    studentUserId = studentRes.insertId;

    const [anotherStudentRes] = await pool.query(
      `INSERT INTO users (google_id, email, name, role, status) VALUES (?, ?, ?, 'user', 'active')`,
      [`google_p9_student2_${timestamp}`, `p9_student2_${timestamp}@example.com`, 'Sneha Patel']
    );
    anotherStudentUserId = anotherStudentRes.insertId;

    // Tokens & Cookies
    superAdminToken = generateAccessToken({ id: superAdminUserId, email: `p9_superadmin_${timestamp}@example.com`, role: 'super_admin' });
    adminToken = generateAccessToken({ id: adminUserId, email: `p9_admin_${timestamp}@example.com`, role: 'admin' });
    counsellorToken = generateAccessToken({ id: counsellorUserId, email: `p9_counsellor_${timestamp}@example.com`, role: 'counsellor' });
    studentToken = generateAccessToken({ id: studentUserId, email: `p9_student_${timestamp}@example.com`, role: 'user' });
    anotherStudentToken = generateAccessToken({ id: anotherStudentUserId, email: `p9_student2_${timestamp}@example.com`, role: 'user' });

    superAdminCookie = `access_token=${superAdminToken}`;
    adminCookie = `access_token=${adminToken}`;
    counsellorCookie = `access_token=${counsellorToken}`;
    studentCookie = `access_token=${studentToken}`;
    anotherStudentCookie = `access_token=${anotherStudentToken}`;

    // 2. Create Category & Subcategory
    const [catRes] = await pool.query(
      `INSERT INTO categories (name, slug, description, status) VALUES (?, ?, 'P9 Test Cat', 'active')`,
      [`P9 Category ${timestamp}`, catSlug]
    );
    testCategoryId = catRes.insertId;

    const [subRes] = await pool.query(
      `INSERT INTO subcategories (category_id, name, slug, description, status) VALUES (?, ?, ?, 'P9 Test Subcat', 'active')`,
      [testCategoryId, `P9 Subcat ${timestamp}`, subSlug]
    );
    testSubcategoryId = subRes.insertId;

    // 3. Create published course
    const [pubRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        duration_hours, price, offer_price, status, published_at
      ) VALUES (?, ?, ?, 'P9 Pub Course', '<p>Desc</p>', ?, ?, 'intermediate', 'Hinglish', 'online', 20, 5999, 4999, 'published', NOW())`,
      [pubCode, `P9 Published Course ${timestamp}`, pubSlug, testCategoryId, testSubcategoryId]
    );
    publishedCourseId = pubRes.insertId;

    // 4. Create draft course
    const [draftRes] = await pool.query(
      `INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        duration_hours, price, offer_price, status
      ) VALUES (?, ?, ?, 'P9 Draft Course', '<p>Desc</p>', ?, ?, 'beginner', 'English', 'offline', 10, 2999, 1999, 'draft')`,
      [draftCode, `P9 Draft Course ${timestamp}`, draftSlug, testCategoryId, testSubcategoryId]
    );
    draftCourseId = draftRes.insertId;
  });

  after(async () => {
    try {
      if (pool) {
        // Clean up test data
        if (publishedCourseId) {
          await pool.query('DELETE FROM eligibility_checks WHERE course_id = ?', [publishedCourseId]);
          await pool.query('DELETE FROM course_eligibility_rules WHERE course_id = ?', [publishedCourseId]);
          await pool.query('DELETE FROM courses WHERE id = ?', [publishedCourseId]);
        }
        if (draftCourseId) {
          await pool.query('DELETE FROM eligibility_checks WHERE course_id = ?', [draftCourseId]);
          await pool.query('DELETE FROM course_eligibility_rules WHERE course_id = ?', [draftCourseId]);
          await pool.query('DELETE FROM courses WHERE id = ?', [draftCourseId]);
        }
        if (testSubcategoryId) {
          await pool.query('DELETE FROM subcategories WHERE id = ?', [testSubcategoryId]);
        }
        if (testCategoryId) {
          await pool.query('DELETE FROM categories WHERE id = ?', [testCategoryId]);
        }
        if (superAdminUserId) await pool.query('DELETE FROM users WHERE id = ?', [superAdminUserId]);
        if (adminUserId) await pool.query('DELETE FROM users WHERE id = ?', [adminUserId]);
        if (counsellorUserId) await pool.query('DELETE FROM users WHERE id = ?', [counsellorUserId]);
        if (studentUserId) await pool.query('DELETE FROM users WHERE id = ?', [studentUserId]);
        if (anotherStudentUserId) await pool.query('DELETE FROM users WHERE id = ?', [anotherStudentUserId]);
        await closePool();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('1. Public Eligibility API (GET /api/courses/:id/eligibility)', () => {
    it('should return 404 if course does not exist', async () => {
      const res = await request(app)
        .get('/api/courses/99999999/eligibility')
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not found/i);
    });

    it('should return 404 if course is not published', async () => {
      const res = await request(app)
        .get(`/api/courses/${draftCourseId}/eligibility`)
        .expect(404);

      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /not found|not published/i);
    });

    it('should return default open eligibility criteria when no rules record exists', async () => {
      const res = await request(app)
        .get(`/api/courses/${publishedCourseId}/eligibility`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_id, publishedCourseId);
      assert.strictEqual(res.body.data.eligibility_enabled, false);
      assert.strictEqual(res.body.data.minimum_qualification, 'any');
      assert.deepStrictEqual(res.body.data.custom_questions, []);
    });

    it('should sanitize and scrub correct_answers from custom questions for public access', async () => {
      // First, admin sets rules with a custom question containing correct_answers
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_qualification: '12th',
          minimum_percentage: 50,
          eligible_streams: ['Science', 'Commerce'],
          custom_questions: [
            {
              key: 'math_background',
              question: 'Did you have Mathematics in 12th?',
              field_type: 'radio',
              options: ['Yes', 'No'],
              required: true,
              correct_answers: ['Yes'],
            },
          ],
        })
        .expect(200);

      // Now query public endpoint
      const res = await request(app)
        .get(`/api/courses/${publishedCourseId}/eligibility`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.eligibility_enabled, true);
      assert.strictEqual(res.body.data.custom_questions.length, 1);
      const q = res.body.data.custom_questions[0];
      assert.strictEqual(q.key, 'math_background');
      assert.strictEqual(q.question, 'Did you have Mathematics in 12th?');
      // Crucial privacy check: correct_answers must be stripped!
      assert.strictEqual(q.correct_answers, undefined, 'Public endpoint must not leak correct_answers');
    });
  });

  describe('2. Admin Eligibility Rules API (GET & PUT /api/admin/courses/:id/eligibility-rules)', () => {
    it('should reject unauthenticated requests with 401', async () => {
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .expect(401);

      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .send({ eligibility_enabled: true })
        .expect(401);
    });

    it('should reject non-admin users (students and counsellors) with 403', async () => {
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', studentCookie)
        .expect(403);

      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', studentCookie)
        .send({ eligibility_enabled: true })
        .expect(403);

      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', counsellorCookie)
        .send({ eligibility_enabled: true })
        .expect(403);
    });

    it('should validate invalid payload and reject with 400', async () => {
      // 1. Missing eligibility_enabled
      const res1 = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({ minimum_qualification: 'graduate' })
        .expect(400);
      assert.strictEqual(res1.body.success, false);

      // 2. minimum_percentage > 100
      const res2 = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_percentage: 150,
        })
        .expect(400);
      assert.strictEqual(res2.body.success, false);

      // 3. maximum_age < minimum_age
      const res3 = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_age: 25,
          maximum_age: 20,
        })
        .expect(400);
      assert.strictEqual(res3.body.success, false);
      assert.ok(res3.body.errors.some((e) => e.field.includes('maximum_age') || e.message.includes('maximum_age')));

      // 4. Invalid qualification enum
      const res4 = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_qualification: 'doctorate',
        })
        .expect(400);
      assert.strictEqual(res4.body.success, false);
    });

    it('should successfully upsert rules and record an audit log', async () => {
      const rulesPayload = {
        eligibility_enabled: true,
        minimum_qualification: 'graduate',
        minimum_percentage: 60,
        eligible_streams: ['B.Tech', 'BCA', 'B.Sc CS'],
        minimum_age: 20,
        maximum_age: 28,
        required_skills: ['Basic C++', 'Problem Solving'],
        experience_required: 'fresher_allowed',
        custom_questions: [
          {
            key: 'coding_exp',
            question: 'Do you have prior coding experience?',
            field_type: 'radio',
            options: ['Yes', 'No'],
            required: true,
            correct_answers: ['Yes'],
          },
        ],
        disclaimer: 'Shortlisted candidates may have to clear an aptitude assessment.',
      };

      const res = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send(rulesPayload)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.minimum_qualification, 'graduate');
      assert.strictEqual(res.body.data.minimum_percentage, 60);
      assert.strictEqual(res.body.data.minimum_age, 20);
      assert.strictEqual(res.body.data.maximum_age, 28);
      assert.deepStrictEqual(res.body.data.eligible_streams, ['B.Tech', 'BCA', 'B.Sc CS']);

      // Verify Admin GET returns full rules including correct_answers
      const getRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(getRes.body.success, true);
      assert.strictEqual(getRes.body.data.custom_questions[0].correct_answers[0], 'Yes');

      // Verify audit log
      const [auditRows] = await pool.query(
        `SELECT * FROM audit_logs WHERE entity_id = ? AND action = 'course.eligibility_rules.update' ORDER BY id DESC LIMIT 1`,
        [publishedCourseId]
      );
      assert.strictEqual(auditRows.length, 1);
      assert.strictEqual(Number(auditRows[0].actor_id), adminUserId);
    });
  });

  describe('3. Student Eligibility Check Evaluation (POST /api/courses/:id/eligibility-checks)', () => {
    it('should reject unauthenticated request with 401', async () => {
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .send({ answers: {} })
        .expect(401);
    });

    it('should reject missing answers payload with 400', async () => {
      const res = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({})
        .expect(400);

      assert.strictEqual(res.body.success, false);
    });

    it('should automatically pass when eligibility_enabled is false', async () => {
      // Temporarily disable eligibility
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: false,
        })
        .expect(200);

      const res = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({
          answers: {
            qualification: '10th',
            percentage: 35,
            age: 12,
          },
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.eligible, true);
      assert.strictEqual(res.body.data.result, 'eligible');
      assert.deepStrictEqual(res.body.data.failed_rules, []);
    });

    describe('Server-Side Evaluation Rules Testing', () => {
      before(async () => {
        // Set standard rules for testing specific criteria:
        // Min Qual: graduate, Min Pct: 60%, Streams: ["B.Tech", "BCA"], Age: 20-30, Exp: experience_required
        await request(app)
          .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
          .set('Cookie', adminCookie)
          .send({
            eligibility_enabled: true,
            minimum_qualification: 'graduate',
            minimum_percentage: 60,
            eligible_streams: ['B.Tech', 'BCA'],
            minimum_age: 20,
            maximum_age: 30,
            experience_required: 'experience_required',
            custom_questions: [
              {
                key: 'laptop_available',
                question: 'Do you have a personal laptop?',
                field_type: 'radio',
                options: ['Yes', 'No'],
                required: true,
                correct_answers: ['Yes'],
              },
            ],
          })
          .expect(200);
      });

      it('should fail qualification when student qualification is lower in hierarchy', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: '12th', // 12th < graduate
              percentage: 75,
              stream: 'B.Tech',
              age: 24,
              experience: '1 year',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, false);
        assert.strictEqual(res.body.data.result, 'not_eligible');
        assert.ok(res.body.data.failed_rules.includes('minimum_qualification'));
        assert.match(res.body.data.message, /graduate/i);
      });

      it('should pass qualification when student qualification is equal or higher in hierarchy', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'post_graduate', // post_graduate > graduate
              percentage: 75,
              stream: 'B.Tech',
              age: 24,
              experience: '2 years',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, true);
        assert.strictEqual(res.body.data.result, 'eligible');
        assert.deepStrictEqual(res.body.data.failed_rules, []);
      });

      it('should fail minimum percentage when below threshold', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 55, // 55 < 60
              stream: 'B.Tech',
              age: 24,
              experience: '1 year',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, false);
        assert.ok(res.body.data.failed_rules.includes('minimum_percentage'));
        assert.match(res.body.data.message, /60%/i);
      });

      it('should fail stream check when stream is not in whitelist', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'Mechanical', // Not in ['B.Tech', 'BCA']
              age: 24,
              experience: '1 year',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, false);
        assert.ok(res.body.data.failed_rules.includes('eligible_streams'));
      });

      it('should fail age check when student is younger than minimum or older than maximum', async () => {
        // Too young
        const resYoung = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'BCA',
              age: 18, // < 20
              experience: '1 year',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(resYoung.body.data.eligible, false);
        assert.ok(resYoung.body.data.failed_rules.includes('minimum_age'));

        // Too old
        const resOld = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'BCA',
              age: 35, // > 30
              experience: '1 year',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(resOld.body.data.eligible, false);
        assert.ok(resOld.body.data.failed_rules.includes('maximum_age'));
      });

      it('should fail experience when prior experience is required but student is fresher', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'BCA',
              age: 23,
              experience: 'fresher',
              laptop_available: 'Yes',
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, false);
        assert.ok(res.body.data.failed_rules.includes('experience_required'));
      });

      it('should fail custom question when required question is missing or answer does not match criteria', async () => {
        // Missing required custom question
        const resMissing = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'BCA',
              age: 23,
              experience: '1 year',
            },
          })
          .expect(201);

        assert.strictEqual(resMissing.body.data.eligible, false);
        assert.ok(resMissing.body.data.failed_rules.includes('custom_question_laptop_available'));

        // Wrong answer to custom question
        const resWrong = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: 'graduate',
              percentage: 70,
              stream: 'BCA',
              age: 23,
              experience: '1 year',
              laptop_available: 'No', // Correct answer is 'Yes'
            },
          })
          .expect(201);

        assert.strictEqual(resWrong.body.data.eligible, false);
        assert.ok(resWrong.body.data.failed_rules.includes('custom_question_laptop_available'));
      });

      it('should report multiple simultaneous failed rules in failed_rules array', async () => {
        const res = await request(app)
          .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
          .set('Cookie', studentCookie)
          .send({
            answers: {
              qualification: '10th', // Fail minimum_qualification
              percentage: 40,        // Fail minimum_percentage
              stream: 'Arts',        // Fail eligible_streams
              age: 16,               // Fail minimum_age
              experience: 'none',    // Fail experience_required
              laptop_available: 'No', // Fail custom question
            },
          })
          .expect(201);

        assert.strictEqual(res.body.data.eligible, false);
        assert.strictEqual(res.body.data.result, 'not_eligible');
        assert.ok(res.body.data.failed_rules.includes('minimum_qualification'));
        assert.ok(res.body.data.failed_rules.includes('minimum_percentage'));
        assert.ok(res.body.data.failed_rules.includes('eligible_streams'));
        assert.ok(res.body.data.failed_rules.includes('minimum_age'));
        assert.ok(res.body.data.failed_rules.includes('experience_required'));
        assert.ok(res.body.data.failed_rules.includes('custom_question_laptop_available'));
        assert.strictEqual(res.body.data.failed_rules.length, 6);
      });
    });
  });

  describe('4. Student Latest Result API (GET /api/me/courses/:id/eligibility-result)', () => {
    it('should return has_checked: false if student has never checked', async () => {
      const res = await request(app)
        .get(`/api/me/courses/${publishedCourseId}/eligibility-result`)
        .set('Cookie', anotherStudentCookie)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.has_checked, false);
      assert.strictEqual(res.body.data.result, null);
      assert.strictEqual(res.body.data.eligible, null);
    });

    it('should return latest check result after student checks', async () => {
      // Another student submits check and passes
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', anotherStudentCookie)
        .send({
          answers: {
            qualification: 'graduate',
            percentage: 80,
            stream: 'B.Tech',
            age: 22,
            experience: '1 year',
            laptop_available: 'Yes',
          },
        })
        .expect(201);

      const res = await request(app)
        .get(`/api/me/courses/${publishedCourseId}/eligibility-result`)
        .set('Cookie', anotherStudentCookie)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.has_checked, true);
      assert.strictEqual(res.body.data.eligible, true);
      assert.strictEqual(res.body.data.result, 'eligible');
      assert.ok(res.body.data.checked_at);
    });
  });

  describe('5. Admin Student Checks Inspection (GET /api/admin/courses/:id/eligibility-checks)', () => {
    it('should reject unauthenticated and student requests with 401 and 403', async () => {
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .expect(401);

      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .expect(403);
    });

    it('should allow counsellor and admin to view students check attempts', async () => {
      // Counsellor check
      const counsRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', counsellorCookie)
        .expect(200);

      assert.strictEqual(counsRes.body.success, true);
      assert.ok(Array.isArray(counsRes.body.data));
      assert.ok(counsRes.body.data.length > 0);
      assert.ok(counsRes.body.pagination);

      // Verify student details are populated
      const checkItem = counsRes.body.data[0];
      assert.ok(checkItem.id);
      assert.ok(checkItem.student_name);
      assert.ok(checkItem.student_email);
      assert.ok(checkItem.result);
      assert.ok(checkItem.checked_at);

      // Admin check
      const adminRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(adminRes.body.success, true);
      assert.strictEqual(adminRes.body.data.length, counsRes.body.data.length);
    });

    it('should filter checks by result status (eligible vs not_eligible)', async () => {
      const eligibleRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks?result=eligible`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(eligibleRes.body.success, true);
      for (const item of eligibleRes.body.data) {
        assert.strictEqual(item.result, 'eligible');
      }

      const notEligibleRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks?result=not_eligible`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(notEligibleRes.body.success, true);
      for (const item of notEligibleRes.body.data) {
        assert.strictEqual(item.result, 'not_eligible');
      }
    });

    it('should support pagination params (page, limit)', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks?page=1&limit=2`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 2);
      assert.ok(res.body.data.length <= 2);
    });

    it('should not expose sensitive tokens, passwords, or google_id in student checks response', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', adminCookie)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      for (const item of res.body.data) {
        assert.strictEqual(item.google_id, undefined, 'Must not expose google_id');
        assert.strictEqual(item.password, undefined, 'Must not expose password');
        assert.strictEqual(item.token_hash, undefined, 'Must not expose token_hash');
      }
    });
  });

  describe('6. Additional Edge Cases & Specification Discrepancy Audits', () => {
    it('should allow all authenticated roles (user, counsellor, admin) to submit checks per Section 3 Roles Matrix', async () => {
      // Counsellor check
      const counsCheck = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', counsellorCookie)
        .send({
          answers: {
            qualification: 'graduate',
            percentage: 75,
            stream: 'B.Tech',
            age: 25,
            experience: '1 year',
            laptop_available: 'Yes',
          },
        })
        .expect(201);
      assert.strictEqual(counsCheck.body.success, true);
      assert.strictEqual(counsCheck.body.data.eligible, true);

      // Admin check
      const adminCheck = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', adminCookie)
        .send({
          answers: {
            qualification: 'graduate',
            percentage: 75,
            stream: 'B.Tech',
            age: 25,
            experience: '1 year',
            laptop_available: 'Yes',
          },
        })
        .expect(201);
      assert.strictEqual(adminCheck.body.success, true);
      assert.strictEqual(adminCheck.body.data.eligible, true);
    });

    it('should treat minimum_qualification: "any" as open to all qualifications', async () => {
      // Admin configures minimum_qualification: "any"
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_qualification: 'any',
          minimum_percentage: 50,
          eligible_streams: ['Any'],
        })
        .expect(200);

      // Student with 10th qualification passes
      const res10th = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({
          answers: {
            qualification: '10th',
            percentage: 60,
          },
        })
        .expect(201);
      assert.strictEqual(res10th.body.data.eligible, true);
      assert.deepStrictEqual(res10th.body.data.failed_rules, []);

      // Student with no qualification specified also passes qualification check
      const resNone = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({
          answers: {
            percentage: 60,
          },
        })
        .expect(201);
      assert.strictEqual(resNone.body.data.eligible, true);
      assert.deepStrictEqual(resNone.body.data.failed_rules, []);
    });

    it('should expose required_skills as informational criteria and not falsely evaluate it as a required answer', async () => {
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_qualification: '12th',
          required_skills: ['Basic Computer Literacy', 'Typing Skills'],
        })
        .expect(200);

      // Public endpoint returns required_skills for informational display
      const publicRes = await request(app)
        .get(`/api/courses/${publishedCourseId}/eligibility`)
        .expect(200);
      assert.deepStrictEqual(publicRes.body.data.required_skills, ['Basic Computer Literacy', 'Typing Skills']);

      // Student answers payload does not include required_skills and passes
      const checkRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({
          answers: {
            qualification: '12th',
          },
        })
        .expect(201);
      assert.strictEqual(checkRes.body.data.eligible, true);
      assert.deepStrictEqual(checkRes.body.data.failed_rules, []);
    });

    it('should enforce authentication, validation, and course existence even when eligibility is disabled', async () => {
      // 1. Disable eligibility
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: false,
        })
        .expect(200);

      // 2. Unauthenticated check fails with 401
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .send({ answers: {} })
        .expect(401);

      // 3. Malformed payload without answers object fails with 400
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({ wrong_field: true })
        .expect(400);

      // 4. Non-existent course fails with 404
      await request(app)
        .post('/api/courses/99999999/eligibility-checks')
        .set('Cookie', studentCookie)
        .send({ answers: {} })
        .expect(404);

      // 5. Draft course fails with 404
      await request(app)
        .post(`/api/courses/${draftCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({ answers: {} })
        .expect(404);
    });

    it('should strictly isolate personal latest results between distinct authenticated users', async () => {
      // Enable strict rules
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send({
          eligibility_enabled: true,
          minimum_qualification: 'graduate',
          minimum_percentage: 70,
        })
        .expect(200);

      // Student 1 submits and passes
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send({
          answers: {
            qualification: 'graduate',
            percentage: 85,
          },
        })
        .expect(201);

      // Student 2 submits and fails
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', anotherStudentCookie)
        .send({
          answers: {
            qualification: '10th',
            percentage: 50,
          },
        })
        .expect(201);

      // Student 1 queries personal result: must be eligible
      const s1Res = await request(app)
        .get(`/api/me/courses/${publishedCourseId}/eligibility-result`)
        .set('Cookie', studentCookie)
        .expect(200);
      assert.strictEqual(s1Res.body.data.has_checked, true);
      assert.strictEqual(s1Res.body.data.eligible, true);
      assert.strictEqual(s1Res.body.data.result, 'eligible');

      // Student 2 queries personal result: must be not_eligible
      const s2Res = await request(app)
        .get(`/api/me/courses/${publishedCourseId}/eligibility-result`)
        .set('Cookie', anotherStudentCookie)
        .expect(200);
      assert.strictEqual(s2Res.body.data.has_checked, true);
      assert.strictEqual(s2Res.body.data.eligible, false);
      assert.strictEqual(s2Res.body.data.result, 'not_eligible');

      // Counsellor queries personal result for a course they haven't checked: has_checked false
      const counsRes = await request(app)
        .get(`/api/me/courses/${draftCourseId}/eligibility-result`)
        .set('Cookie', counsellorCookie)
        .expect(200);
      assert.strictEqual(counsRes.body.data.has_checked, false);
    });
  });

  describe('7. Exhaustive Role Matrix Verification (guest, user, counsellor, admin, super_admin)', () => {
    it('POST /api/courses/:id/eligibility-checks: guest returns 401, user, counsellor, admin, super_admin all permitted (201)', async () => {
      const payload = {
        answers: {
          qualification: 'graduate',
          percentage: 80,
          stream: 'B.Tech',
        },
      };

      // 1. Guest -> 401
      const guestRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .send(payload)
        .expect(401);
      assert.strictEqual(guestRes.body.success, false);

      // 2. User -> 201
      const userRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .send(payload)
        .expect(201);
      assert.strictEqual(userRes.body.success, true);
      assert.strictEqual(userRes.body.data.eligible, true);

      // 3. Counsellor -> 201
      const counsRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', counsellorCookie)
        .send(payload)
        .expect(201);
      assert.strictEqual(counsRes.body.success, true);
      assert.strictEqual(counsRes.body.data.eligible, true);

      // 4. Admin -> 201
      const adminRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', adminCookie)
        .send(payload)
        .expect(201);
      assert.strictEqual(adminRes.body.success, true);
      assert.strictEqual(adminRes.body.data.eligible, true);

      // 5. Super Admin -> 201
      const superAdminRes = await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', superAdminCookie)
        .send(payload)
        .expect(201);
      assert.strictEqual(superAdminRes.body.success, true);
      assert.strictEqual(superAdminRes.body.data.eligible, true);
    });

    it('GET & PUT /api/admin/courses/:id/eligibility-rules: guest 401, user 403, counsellor 403, admin 200, super_admin 200', async () => {
      const updatePayload = {
        eligibility_enabled: true,
        minimum_qualification: 'graduate',
        minimum_percentage: 55,
      };

      // 1. Guest -> 401
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .expect(401);
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .send(updatePayload)
        .expect(401);

      // 2. User -> 403
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', studentCookie)
        .expect(403);
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', studentCookie)
        .send(updatePayload)
        .expect(403);

      // 3. Counsellor -> 403
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', counsellorCookie)
        .expect(403);
      await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', counsellorCookie)
        .send(updatePayload)
        .expect(403);

      // 4. Admin -> 200
      const adminGet = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .expect(200);
      assert.strictEqual(adminGet.body.success, true);

      const adminPut = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', adminCookie)
        .send(updatePayload)
        .expect(200);
      assert.strictEqual(adminPut.body.success, true);

      // 5. Super Admin -> 200
      const superAdminGet = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', superAdminCookie)
        .expect(200);
      assert.strictEqual(superAdminGet.body.success, true);

      const superAdminPut = await request(app)
        .put(`/api/admin/courses/${publishedCourseId}/eligibility-rules`)
        .set('Cookie', superAdminCookie)
        .send(updatePayload)
        .expect(200);
      assert.strictEqual(superAdminPut.body.success, true);
    });

    it('GET /api/admin/courses/:id/eligibility-checks: guest 401, user 403, counsellor 200, admin 200, super_admin 200', async () => {
      // 1. Guest -> 401
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .expect(401);

      // 2. User -> 403
      await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', studentCookie)
        .expect(403);

      // 3. Counsellor -> 200
      const counsRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', counsellorCookie)
        .expect(200);
      assert.strictEqual(counsRes.body.success, true);

      // 4. Admin -> 200
      const adminRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', adminCookie)
        .expect(200);
      assert.strictEqual(adminRes.body.success, true);

      // 5. Super Admin -> 200
      const superAdminRes = await request(app)
        .get(`/api/admin/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', superAdminCookie)
        .expect(200);
      assert.strictEqual(superAdminRes.body.success, true);
    });

    it('GET /api/me/courses/:id/eligibility-result: strictly isolates results by authenticated user ID across all roles', async () => {
      // Super admin submits an eligibility check for course
      await request(app)
        .post(`/api/courses/${publishedCourseId}/eligibility-checks`)
        .set('Cookie', superAdminCookie)
        .send({
          answers: {
            qualification: 'post_graduate',
            percentage: 95,
          },
        })
        .expect(201);

      // Super admin queries their personal result: gets super admin result
      const superRes = await request(app)
        .get(`/api/me/courses/${publishedCourseId}/eligibility-result`)
        .set('Cookie', superAdminCookie)
        .expect(200);
      assert.strictEqual(superRes.body.data.has_checked, true);
      assert.strictEqual(superRes.body.data.eligible, true);

      // Admin has never submitted a check for draftCourseId: gets has_checked false
      const adminDraftRes = await request(app)
        .get(`/api/me/courses/${draftCourseId}/eligibility-result`)
        .set('Cookie', adminCookie)
        .expect(200);
      assert.strictEqual(adminDraftRes.body.data.has_checked, false);
      assert.strictEqual(adminDraftRes.body.data.result, null);
    });
  });
});
