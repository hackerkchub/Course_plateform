import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Phase 6: Course Content, Curriculum, Batches, Pricing & SEO Automated Tests', () => {
  let pool;
  let adminToken;
  let userToken;
  let adminCookie;
  let userCookie;

  let testCategoryId;
  let testSubcategoryId;
  let testCourseId;
  let testCourseSlug;
  let testModuleId;
  let testLessonId;
  let testBatchId;
  let testPlanId;
  let testOfferId;

  const timestamp = Date.now();
  const testCategorySlug = `phase6-cat-${timestamp}`;
  const testSubcategorySlug = `phase6-sub-${timestamp}`;
  const testCourseCode = `P6-${timestamp.toString().slice(-6)}`;
  const initialCourseSlug = `phase6-course-${timestamp}`;

  before(async () => {
    pool = getPool();

    // 1. Create synthetic admin user
    const [adminUserRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `, [`google_admin_${timestamp}`, `admin_${timestamp}@example.com`, 'Phase 6 Admin']);
    const adminUserId = adminUserRes.insertId;

    // 2. Create synthetic regular user
    const [normalUserRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `, [`google_user_${timestamp}`, `user_${timestamp}@example.com`, 'Phase 6 Student']);
    const normalUserId = normalUserRes.insertId;

    adminToken = generateAccessToken({ id: adminUserId, email: `admin_${timestamp}@example.com`, role: 'admin' });
    userToken = generateAccessToken({ id: normalUserId, email: `user_${timestamp}@example.com`, role: 'user' });

    adminCookie = `access_token=${adminToken}`;
    userCookie = `access_token=${userToken}`;

    // 3. Create synthetic category
    const [catRes] = await pool.query(`
      INSERT INTO categories (name, slug, description, status)
      VALUES (?, ?, 'Phase 6 Test Category', 'active')
    `, [`Phase 6 Category ${timestamp}`, testCategorySlug]);
    testCategoryId = catRes.insertId;

    // 4. Create synthetic subcategory
    const [subRes] = await pool.query(`
      INSERT INTO subcategories (category_id, name, slug, description, status)
      VALUES (?, ?, ?, 'Phase 6 Test Subcategory', 'active')
    `, [testCategoryId, `Phase 6 Subcategory ${timestamp}`, testSubcategorySlug]);
    testSubcategoryId = subRes.insertId;

    // 5. Create synthetic course (draft)
    const [courseRes] = await pool.query(`
      INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        duration_hours, price, status
      )
      VALUES (?, ?, ?, 'Phase 6 short desc', '<p>Phase 6 desc</p>', ?, ?, 'beginner', 'English', 'online', 10, 5000, 'draft')
    `, [testCourseCode, `Phase 6 Course ${timestamp}`, initialCourseSlug, testCategoryId, testSubcategoryId]);
    testCourseId = courseRes.insertId;
    testCourseSlug = initialCourseSlug;
  });

  after(async () => {
    try {
      // Clean up in reverse dependency order
      if (testCourseId) {
        await pool.query('DELETE FROM course_lessons WHERE module_id IN (SELECT id FROM course_modules WHERE course_id = ?)', [testCourseId]);
        await pool.query('DELETE FROM course_modules WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_batches WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_installment_plans WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_offers WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_faqs WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_testimonials WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_benefits WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_enrollment_settings WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_points WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_tags WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_seo WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM course_slug_history WHERE course_id = ?', [testCourseId]);
        await pool.query('DELETE FROM courses WHERE id = ?', [testCourseId]);
      }
      if (testSubcategoryId) {
        await pool.query('DELETE FROM subcategories WHERE id = ?', [testSubcategoryId]);
      }
      if (testCategoryId) {
        await pool.query('DELETE FROM categories WHERE id = ?', [testCategoryId]);
      }
      await pool.query('DELETE FROM users WHERE email LIKE ?', [`%_${timestamp}@example.com`]);
      await pool.query('DELETE FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email LIKE ?)', [`%_${timestamp}@example.com`]);
    } catch (err) {
      console.error('Error during test cleanup:', err.message);
    } finally {
      await closePool();
    }
  });

  // ==========================================
  // 1. Curriculum Tests (Modules & Lessons)
  // ==========================================
  describe('1. Curriculum Management (Modules & Lessons)', () => {
    it('POST /api/admin/courses/:id/modules should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/modules`)
        .send({ title: 'Module 1: Introduction' });

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/modules should reject regular users with 403', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/modules`)
        .set('Cookie', userCookie)
        .send({ title: 'Module 1: Introduction' });

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/modules should validate body and reject empty title with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/modules`)
        .set('Cookie', adminCookie)
        .send({ title: '' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/modules should create a module and sync course total_modules', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/modules`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Module 1: Fundamentals',
          description: 'Basic introduction',
          display_order: 1,
          is_published: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Module 1: Fundamentals');
      assert.strictEqual(res.body.data.is_published, true);

      testModuleId = res.body.data.id;

      // Verify course total_modules incremented
      const [courseRows] = await pool.query('SELECT total_modules FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(courseRows[0].total_modules), 1);
    });

    it('PATCH /api/admin/modules/:moduleId should update module details', async () => {
      const res = await request(app)
        .patch(`/api/admin/modules/${testModuleId}`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Module 1: Advanced Fundamentals',
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Module 1: Advanced Fundamentals');
    });

    it('POST /api/admin/modules/:moduleId/lessons should create a lesson and update course total_lessons & duration_hours', async () => {
      const res = await request(app)
        .post(`/api/admin/modules/${testModuleId}/lessons`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Lesson 1.1: Setup and Tools',
          lesson_type: 'video',
          content_url: 'https://cdn.example.com/videos/setup.mp4',
          duration_seconds: 3600, // 1 hour
          is_preview: true,
          is_published: true,
          display_order: 1,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Lesson 1.1: Setup and Tools');
      assert.strictEqual(res.body.data.is_preview, true);

      testLessonId = res.body.data.id;

      // Verify course counters updated
      const [courseRows] = await pool.query('SELECT total_lessons, duration_hours FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(courseRows[0].total_lessons), 1);
      assert.strictEqual(Number(courseRows[0].duration_hours), 1);
    });

    it('POST /api/admin/modules/:moduleId/lessons with second lesson should recalculate duration_hours correctly', async () => {
      const res = await request(app)
        .post(`/api/admin/modules/${testModuleId}/lessons`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Lesson 1.2: Core Concepts',
          lesson_type: 'video',
          content_url: 'https://cdn.example.com/videos/core-concepts.mp4',
          duration_seconds: 1800, // 0.5 hour
          is_preview: false,
          is_published: true,
          display_order: 2,
        });

      assert.strictEqual(res.status, 201);

      // Verify duration_hours is 1.5 (5400 seconds)
      const [courseRows] = await pool.query('SELECT total_lessons, duration_hours FROM courses WHERE id = ?', [testCourseId]);
      assert.strictEqual(Number(courseRows[0].total_lessons), 2);
      assert.strictEqual(Number(courseRows[0].duration_hours), 1.5);
    });

    it('GET /api/admin/courses/:id/curriculum should return all modules and nested lessons', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/curriculum`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].lessons.length, 2);
    });

    it('PATCH /api/admin/courses/:id/curriculum/reorder should update display order in batch', async () => {
      const res = await request(app)
        .patch(`/api/admin/courses/${testCourseId}/curriculum/reorder`)
        .set('Cookie', adminCookie)
        .send({
          modules: [
            {
              id: testModuleId,
              display_order: 2,
              lessons: [
                { id: testLessonId, display_order: 5 },
              ],
            },
          ],
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify display_order updated
      const [modRows] = await pool.query('SELECT display_order FROM course_modules WHERE id = ?', [testModuleId]);
      assert.strictEqual(Number(modRows[0].display_order), 2);
    });
  });

  // ==========================================
  // 2. Batches Tests
  // ==========================================
  describe('2. Batch Management (Section 11.2)', () => {
    it('POST /api/admin/courses/:id/batches should reject when total_seats < 1 with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/batches`)
        .set('Cookie', adminCookie)
        .send({
          batch_name: 'Invalid Batch',
          start_date: '2026-11-01',
          total_seats: 0,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/batches should reject when end_date < start_date with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/batches`)
        .set('Cookie', adminCookie)
        .send({
          batch_name: 'Invalid Dates Batch',
          start_date: '2026-12-01',
          end_date: '2026-11-01',
          total_seats: 25,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/batches should create batch with seats_available = total_seats', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/batches`)
        .set('Cookie', adminCookie)
        .send({
          batch_name: 'November 2026 Cohort',
          start_date: '2026-11-15',
          end_date: '2026-12-30',
          class_days: 'Mon-Fri',
          class_timing: '7 PM - 9 PM',
          total_seats: 30,
          status: 'open',
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.batch_name, 'November 2026 Cohort');
      assert.strictEqual(res.body.data.seats_available, 30);
      assert.strictEqual(res.body.data.status, 'open');

      testBatchId = res.body.data.id;
    });

    it('GET /api/courses/:id/batches should return upcoming open batches publicly', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/batches`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].batch_name, 'November 2026 Cohort');
    });

    it('GET /api/admin/courses/:id/batches should return all batches for admin', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/batches`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 1);
    });

    it('PATCH /api/admin/batches/:batchId should auto-update status to full if seats reach 0', async () => {
      // Insert a synthetic active enrollment for testBatchId to consume a seat
      const [userRows] = await pool.query("SELECT id FROM users WHERE email LIKE '%@example.com' LIMIT 1");
      const userId = userRows[0].id;
      const [enrollRes] = await pool.query(`
        INSERT INTO course_enrollments (user_id, course_id, batch_id, enrollment_source, enrollment_status, enrolled_at)
        VALUES (?, ?, ?, 'free', 'active', NOW())
      `, [userId, testCourseId, testBatchId]);

      // Setting total_seats to 1 means seats_available becomes 1 - 1 = 0, triggering status: 'full'
      const res = await request(app)
        .patch(`/api/admin/batches/${testBatchId}`)
        .set('Cookie', adminCookie)
        .send({
          total_seats: 1,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'full');
      assert.strictEqual(res.body.data.seats_available, 0);

      // Clean up synthetic enrollment and revert batch
      await pool.query('DELETE FROM course_enrollments WHERE id = ?', [enrollRes.insertId]);
      await request(app)
        .patch(`/api/admin/batches/${testBatchId}`)
        .set('Cookie', adminCookie)
        .send({ total_seats: 25, status: 'open' });
    });
  });

  // ==========================================
  // 3. SEO Management (Section 10.1)
  // ==========================================
  describe('3. Course SEO Management (Section 10.1)', () => {
    it('PUT /api/admin/courses/:id/seo should reject when seo_title exceeds 70 chars with 400', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/seo`)
        .set('Cookie', adminCookie)
        .send({
          seo_title: 'A'.repeat(71),
          seo_description: 'Valid SEO Description',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('PUT /api/admin/courses/:id/seo should upsert SEO metadata and sync course_tags', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/seo`)
        .set('Cookie', adminCookie)
        .send({
          seo_title: 'Fullstack Web Development Course 2026',
          seo_description: 'Learn MERN stack and modern cloud development with real projects.',
          focus_keyword: 'web development course',
          seo_tags: ['mern', 'javascript', 'react', 'nodejs'],
          robots_directive: 'index,follow',
          schema_type: 'Course',
          schema_markup: { "@context": "https://schema.org", "@type": "Course" },
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.seo_title, 'Fullstack Web Development Course 2026');
      assert.deepStrictEqual(res.body.data.seo_tags, ['mern', 'javascript', 'react', 'nodejs']);
    });

    it('GET /api/admin/courses/:id/seo should return current SEO data', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/seo`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.focus_keyword, 'web development course');
      assert.strictEqual(res.body.data.seo_tags.length, 4);
    });

    it('PUT /api/admin/courses/:id/seo with new slug should record old slug in course_slug_history', async () => {
      const updatedSlug = `fullstack-mastery-${timestamp}`;

      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/seo`)
        .set('Cookie', adminCookie)
        .send({
          seo_title: 'Fullstack Mastery 2026',
          seo_description: 'Updated SEO description for web development.',
          slug: updatedSlug,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.slug, updatedSlug);

      testCourseSlug = updatedSlug;

      // Verify old slug is recorded in course_slug_history
      const [histRows] = await pool.query(
        'SELECT old_slug, new_slug FROM course_slug_history WHERE course_id = ?',
        [testCourseId]
      );
      assert.ok(histRows.some(h => h.old_slug === initialCourseSlug && h.new_slug === updatedSlug));
    });
  });

  // ==========================================
  // 4. Pricing & Installments (Section 10.2)
  // ==========================================
  describe('4. Pricing & Installment Plans (Section 10.2)', () => {
    it('PUT /api/admin/courses/:id/pricing should reject offer_price > price with 400', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/pricing`)
        .set('Cookie', adminCookie)
        .send({
          price: 5000,
          offer_price: 6000,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      const errString = JSON.stringify(res.body.errors || res.body.message);
      assert.ok(errString.includes('offer_price cannot exceed price'));
    });

    it('PUT /api/admin/courses/:id/pricing should update pricing and return computed discount_percentage', async () => {
      const res = await request(app)
        .put(`/api/admin/courses/${testCourseId}/pricing`)
        .set('Cookie', adminCookie)
        .send({
          price: 10000,
          offer_price: 7500,
          currency: 'INR',
          tax_inclusive: true,
          gst_percentage: 18,
          is_free: false,
          refund_policy: '7 days money back guarantee',
          refund_days: 7,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.price, 10000);
      assert.strictEqual(res.body.data.offer_price, 7500);
      assert.strictEqual(res.body.data.discount_percentage, 25);
    });

    it('GET /api/admin/courses/:id/pricing should return current pricing fields', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/pricing`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.tax_inclusive, true);
      assert.strictEqual(res.body.data.refund_days, 7);
    });

    it('POST /api/admin/courses/:id/installments should create an installment plan', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/installments`)
        .set('Cookie', adminCookie)
        .send({
          plan_name: '3-Month EMI Plan',
          installment_count: 3,
          installment_amount: 3500,
          interval_days: 30,
          is_active: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.plan_name, '3-Month EMI Plan');
      assert.strictEqual(res.body.data.installment_count, 3);

      testPlanId = res.body.data.id;
    });

    it('GET /api/admin/courses/:id/installments should list installment plans', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/installments`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].installment_amount, 3500);
    });
  });

  // ==========================================
  // 5. Offers Management (Section 10.3)
  // ==========================================
  describe('5. Course Offers & Coupons (Section 10.3)', () => {
    it('POST /api/admin/courses/:id/offers should reject ends_at <= starts_at with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/offers`)
        .set('Cookie', adminCookie)
        .send({
          offer_name: 'Flash Sale',
          discount_type: 'percentage',
          discount_value: 30,
          starts_at: '2026-11-10 10:00:00',
          ends_at: '2026-11-10 09:00:00',
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/offers should create an offer with active date window', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/offers`)
        .set('Cookie', adminCookie)
        .send({
          offer_name: 'Diwali Special Offer',
          discount_type: 'percentage',
          discount_value: 40,
          coupon_code: `DIWALI${timestamp.toString().slice(-4)}`,
          starts_at: '2026-01-01 00:00:00',
          ends_at: '2026-12-31 23:59:59',
          usage_limit: 100,
          per_user_limit: 1,
          is_active: true,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.discount_value, 40);
      assert.strictEqual(res.body.data.usage_count, 0);

      testOfferId = res.body.data.id;
    });

    it('POST /api/admin/courses/:id/offers should reject duplicate coupon code with 409', async () => {
      const couponCode = `DIWALI${timestamp.toString().slice(-4)}`;

      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/offers`)
        .set('Cookie', adminCookie)
        .send({
          offer_name: 'Duplicate Coupon Offer',
          discount_type: 'fixed',
          discount_value: 500,
          coupon_code: couponCode,
          starts_at: '2026-01-01 00:00:00',
          ends_at: '2026-12-31 23:59:59',
        });

      assert.strictEqual(res.status, 409);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Coupon code already in use'));
    });

    it('GET /api/admin/courses/:id/offers should list offers for course', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/offers`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].offer_name, 'Diwali Special Offer');
    });
  });

  // ==========================================
  // 6. Supporting Sections (Section 11.4)
  // ==========================================
  describe('6. Supporting Sections (FAQs, Testimonials, Benefits, Enrollment Settings, Points)', () => {
    it('PUT & GET /api/admin/courses/:id/faqs should replace and fetch FAQs', async () => {
      const putRes = await request(app)
        .put(`/api/admin/courses/${testCourseId}/faqs`)
        .set('Cookie', adminCookie)
        .send({
          faqs: [
            { question: 'Is prior coding knowledge required?', answer: 'No, this course starts from absolute basics.', display_order: 1 },
            { question: 'Will I receive a certificate?', answer: 'Yes, an industry-recognized certificate is awarded.', display_order: 2 },
          ],
        });

      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.data.length, 2);

      const getRes = await request(app)
        .get(`/api/admin/courses/${testCourseId}/faqs`)
        .set('Cookie', adminCookie);

      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.data[0].question, 'Is prior coding knowledge required?');
    });

    it('PUT & GET /api/admin/courses/:id/testimonials should replace and fetch testimonials', async () => {
      const putRes = await request(app)
        .put(`/api/admin/courses/${testCourseId}/testimonials`)
        .set('Cookie', adminCookie)
        .send({
          testimonials: [
            { name: 'Rohan Sharma', text: 'This course landed me a software engineering role!', is_active: true },
          ],
        });

      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.data.length, 1);
      assert.strictEqual(putRes.body.data[0].name, 'Rohan Sharma');
    });

    it('PUT & GET /api/admin/courses/:id/benefits should upsert and fetch course benefits', async () => {
      const putRes = await request(app)
        .put(`/api/admin/courses/${testCourseId}/benefits`)
        .set('Cookie', adminCookie)
        .send({
          certificate_enabled: true,
          certificate_type: 'assessment',
          career_support_enabled: true,
          mock_interviews: true,
          resume_support: true,
          placement_assistance: true,
          internship_support: true,
          project_count: 5,
          lifetime_access: true,
          access_duration_days: 0,
        });

      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.data.certificate_enabled, true);
      assert.strictEqual(putRes.body.data.project_count, 5);

      const getRes = await request(app)
        .get(`/api/admin/courses/${testCourseId}/benefits`)
        .set('Cookie', adminCookie);

      assert.strictEqual(getRes.status, 200);
      assert.strictEqual(getRes.body.data.career_support_enabled, true);
    });

    it('PUT & GET /api/admin/courses/:id/enrollment-settings should upsert and fetch enrollment settings', async () => {
      const putRes = await request(app)
        .put(`/api/admin/courses/${testCourseId}/enrollment-settings`)
        .set('Cookie', adminCookie)
        .send({
          enrollment_limit: 100,
          enrollment_start_at: '2026-01-01 00:00:00',
          enrollment_end_at: '2026-12-31 23:59:59',
          drip_content_enabled: true,
        });

      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.data.enrollment_limit, 100);
      assert.strictEqual(putRes.body.data.drip_content_enabled, true);
    });

    it('PUT & GET /api/admin/courses/:id/points should replace and fetch learning points', async () => {
      const putRes = await request(app)
        .put(`/api/admin/courses/${testCourseId}/points`)
        .set('Cookie', adminCookie)
        .send({
          points: [
            { point_type: 'learn', text: 'Build production web apps with React', display_order: 1 },
            { point_type: 'tool', text: 'VSCode, Git, Docker, MongoDB', display_order: 1 },
            { point_type: 'prerequisite', text: 'Basic computer proficiency', display_order: 1 },
          ],
        });

      assert.strictEqual(putRes.status, 200);
      assert.strictEqual(putRes.body.data.length, 3);
    });
  });

  // ==========================================
  // 7. Full Public Course Page Integration & Preview Masking
  // ==========================================
  describe('7. Public Course Page Integration & Video Preview Masking (Section 9.2)', () => {
    before(async () => {
      // Publish course so it appears in public catalog
      await pool.query(
        "UPDATE courses SET status = 'published', published_at = NOW() WHERE id = ?",
        [testCourseId]
      );
    });

    it('GET /api/courses/:slug should return complete integrated course detail', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseSlug}`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      const data = res.body.data;

      // 1. Basic & counters
      assert.strictEqual(data.basic.id, testCourseId);
      assert.strictEqual(data.basic.total_modules, 1);
      assert.strictEqual(data.basic.total_lessons, 2);

      // 2. SEO
      assert.strictEqual(data.seo.seo_title, 'Fullstack Mastery 2026');
      assert.strictEqual(data.seo.robots_directive, 'index,follow');

      // 3. Batches
      assert.strictEqual(data.batches.length, 1);
      assert.strictEqual(data.batches[0].batch_name, 'November 2026 Cohort');

      // 4. Social proof (FAQs, Testimonials)
      assert.strictEqual(data.social_proof.faqs.length, 2);
      assert.strictEqual(data.social_proof.testimonials.length, 1);

      // 5. Benefits
      assert.strictEqual(data.benefits.certificate_enabled, true);
      assert.strictEqual(data.benefits.project_count, 5);

      // 6. Pricing & Active Offer calculation
      // Price = 10000, active offer = 40% discount -> offer_price = 6000, discount_percentage = 40
      assert.strictEqual(data.pricing.price, 10000);
      assert.strictEqual(data.pricing.offer_price, 6000);
      assert.strictEqual(data.pricing.discount_percentage, 40);
      assert.ok(data.pricing.offer);
      assert.strictEqual(data.pricing.offer.offer_name, 'Diwali Special Offer');

      // 7. Installment plans
      assert.strictEqual(data.pricing.installment.enabled, true);
      assert.strictEqual(data.pricing.installment.plans.length, 1);
      assert.strictEqual(data.pricing.installment.plans[0].installment_amount, 3500);

      // 8. Video preview masking:
      // Lesson 1 is preview -> content_url is populated
      // Lesson 2 is NOT preview -> content_url MUST be null for unauthenticated user!
      const module1 = data.curriculum[0];
      const lesson1 = module1.lessons.find(l => l.lesson_id === testLessonId);
      const lesson2 = module1.lessons.find(l => l.lesson_id !== testLessonId);

      assert.strictEqual(lesson1.is_preview, true);
      assert.strictEqual(lesson1.content_url, 'https://cdn.example.com/videos/setup.mp4');

      assert.strictEqual(lesson2.is_preview, false);
      assert.strictEqual(lesson2.content_url, null, 'Private lesson content_url must be masked for non-enrolled user');
    });

    it('GET /api/courses/:oldSlug should issue 301 Moved Permanently redirect to new slug', async () => {
      const res = await request(app)
        .get(`/api/courses/${initialCourseSlug}`);

      assert.strictEqual(res.status, 301);
      assert.strictEqual(res.headers.location, `/api/courses/${testCourseSlug}`);
    });
  });

  // ==========================================
  // 8. Audit Logging Verification
  // ==========================================
  describe('8. Audit Logging Verification', () => {
    it('Should verify audit_logs entries were recorded for Phase 6 administrative writes', async () => {
      const [logs] = await pool.query(
        'SELECT action, entity_type, entity_id FROM audit_logs WHERE entity_id = ? ORDER BY id DESC',
        [testCourseId]
      );

      assert.ok(logs.length > 0, 'Audit logs must be present for test course');
      const actions = logs.map(l => l.action);
      assert.ok(actions.includes('UPDATE_COURSE_SEO') || actions.includes('UPDATE_COURSE_PRICING'));
    });
  });
});
