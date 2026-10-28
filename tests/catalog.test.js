import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';

describe('Phase 5: Catalog Hierarchy & Course Management Tests', () => {
  const pool = getPool();
  const testRunId = Date.now();

  let adminUser = null;
  let regularUser = null;
  let adminToken = null;
  let regularToken = null;

  // Track created entities for cleanup
  const createdCategoryIds = [];
  const createdSubcategoryIds = [];
  const createdCourseIds = [];
  const createdInstructorIds = [];
  const createdUserIds = [];

  before(async () => {
    // 1. Verify connected database is strictly course_platform_db
    const [dbCheck] = await pool.query('SELECT DATABASE() as current_db');
    assert.strictEqual(dbCheck[0]?.current_db, 'course_platform_db');

    // 2. Create synthetic admin and user accounts
    const [adminResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'admin', 'active', TRUE)`,
      [`Admin_${testRunId}`, `admin_${testRunId}@test.com`]
    );
    adminUser = { id: adminResult.insertId, role: 'admin' };
    adminToken = generateAccessToken(adminUser);
    createdUserIds.push(adminUser.id);

    const [userResult] = await pool.query(
      `INSERT INTO users (name, email, role, status, email_verified)
       VALUES (?, ?, 'user', 'active', TRUE)`,
      [`User_${testRunId}`, `user_${testRunId}@test.com`]
    );
    regularUser = { id: userResult.insertId, role: 'user' };
    regularToken = generateAccessToken(regularUser);
    createdUserIds.push(regularUser.id);
  });

  after(async () => {
    // Clean up created entities in reverse FK dependency order
    if (createdCourseIds.length > 0) {
      const p = createdCourseIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM course_slug_history WHERE course_id IN (${p})`, createdCourseIds);
      await pool.query(`DELETE FROM course_tags WHERE course_id IN (${p})`, createdCourseIds);
      await pool.query(`DELETE FROM course_points WHERE course_id IN (${p})`, createdCourseIds);
      await pool.query(`DELETE FROM course_faqs WHERE course_id IN (${p})`, createdCourseIds);
      await pool.query(`DELETE FROM course_testimonials WHERE course_id IN (${p})`, createdCourseIds);
      await pool.query(`DELETE FROM courses WHERE id IN (${p})`, createdCourseIds);
    }

    if (createdSubcategoryIds.length > 0) {
      const p = createdSubcategoryIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM subcategories WHERE id IN (${p})`, createdSubcategoryIds);
    }

    if (createdCategoryIds.length > 0) {
      const p = createdCategoryIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM categories WHERE id IN (${p})`, createdCategoryIds);
    }

    if (createdInstructorIds.length > 0) {
      const p = createdInstructorIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM instructors WHERE id IN (${p})`, createdInstructorIds);
    }

    if (createdUserIds.length > 0) {
      const p = createdUserIds.map(() => '?').join(',');
      await pool.query(`DELETE FROM users WHERE id IN (${p})`, createdUserIds);
    }

    await closePool();
  });

  // ==========================================
  // 1. CATEGORY TESTS (Section 7)
  // ==========================================
  describe('1. Category APIs (Public & Admin)', () => {
    let testCatId = null;
    const catSlug = `cat-test-${testRunId}`;

    it('POST /api/admin/categories should create category as admin (201)', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Computer Science',
          slug: catSlug,
          description: 'Core computer science subjects',
          icon_url: '/uploads/cs-icon.png',
          display_order: 1,
          status: 'active',
          seo_title: 'Computer Science Courses',
          seo_description: 'Best CS courses online',
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.name, 'Computer Science');
      assert.strictEqual(res.body.data.slug, catSlug);
      assert.strictEqual(res.body.data.status, 'active');

      testCatId = res.body.data.id;
      createdCategoryIds.push(testCatId);

      // Verify audit_logs entry
      const [audit] = await pool.query(
        'SELECT * FROM audit_logs WHERE entity_type = "category" AND entity_id = ? AND action = "category.create"',
        [testCatId]
      );
      assert.strictEqual(audit.length, 1);
    });

    it('POST /api/admin/categories should auto-generate slug if omitted', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Auto Slug Category ${testRunId}`,
        })
        .expect(201);

      assert.ok(res.body.data.slug);
      assert.ok(res.body.data.slug.includes('auto-slug-category'));
      createdCategoryIds.push(res.body.data.id);
    });

    it('POST /api/admin/categories should reject duplicate slug with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Duplicate Category',
          slug: catSlug,
        })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already exists'));
    });

    it('POST /api/admin/categories should reject invalid payloads (400)', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'A', // min 2 characters required
        })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, 'Validation failed');
    });

    it('GET /api/categories should return active categories publicly', async () => {
      const res = await request(app)
        .get('/api/categories')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find(c => c.slug === catSlug);
      assert.ok(found, 'Created active category must be in public list');
      assert.strictEqual(typeof found.total_courses, 'number');
    });

    it('GET /api/categories/:slug should return category details, SEO and breadcrumbs', async () => {
      const res = await request(app)
        .get(`/api/categories/${catSlug}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.category.slug, catSlug);
      assert.ok(res.body.data.category.seo);
      assert.strictEqual(res.body.data.category.seo.seo_title, 'Computer Science Courses');
      assert.ok(Array.isArray(res.body.data.breadcrumbs));
      assert.ok(Array.isArray(res.body.data.subcategories));
    });

    it('GET /api/categories/:slug should return 404 for nonexistent category', async () => {
      await request(app)
        .get('/api/categories/nonexistent-category-slug-404')
        .expect(404);
    });

    it('PATCH /api/admin/categories/:id should update category fields', async () => {
      const res = await request(app)
        .patch(`/api/admin/categories/${testCatId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Computer Science & Engineering',
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.name, 'Computer Science & Engineering');
    });

    it('PATCH /api/admin/categories/reorder should update display_order', async () => {
      const res = await request(app)
        .patch('/api/admin/categories/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          items: [{ id: testCatId, display_order: 5 }],
        })
        .expect(200);

      assert.strictEqual(res.body.success, true);

      const [row] = await pool.query('SELECT display_order FROM categories WHERE id = ?', [testCatId]);
      assert.strictEqual(row[0].display_order, 5);
    });

    it('GET /api/admin/categories should return paginated category list with total_courses', async () => {
      const res = await request(app)
        .get('/api/admin/categories?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.pagination);
      assert.strictEqual(res.body.pagination.page, 1);
      assert.strictEqual(res.body.pagination.limit, 10);
    });
  });

  // ==========================================
  // 2. SUBCATEGORY TESTS (Section 8)
  // ==========================================
  describe('2. Subcategory APIs (Public & Admin)', () => {
    let parentCat = null;
    let targetCat = null;
    let subCat = null;
    const parentSlug = `parent-cat-${testRunId}`;
    const targetSlug = `target-cat-${testRunId}`;
    const subSlug = `web-dev-${testRunId}`;

    before(async () => {
      // Create parent category and target category for move test
      const [pRes] = await pool.query(
        `INSERT INTO categories (name, slug, status) VALUES ('Parent Category', ?, 'active')`,
        [parentSlug]
      );
      parentCat = { id: pRes.insertId, slug: parentSlug };
      createdCategoryIds.push(parentCat.id);

      const [tRes] = await pool.query(
        `INSERT INTO categories (name, slug, status) VALUES ('Target Category', ?, 'active')`,
        [targetSlug]
      );
      targetCat = { id: tRes.insertId, slug: targetSlug };
      createdCategoryIds.push(targetCat.id);
    });

    it('POST /api/admin/subcategories should create subcategory under category (201)', async () => {
      const res = await request(app)
        .post('/api/admin/subcategories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: parentCat.id,
          name: 'Web Development',
          slug: subSlug,
          description: 'Frontend and Backend development',
          image_url: '/uploads/web-dev.png',
          display_order: 1,
          status: 'active',
          seo_title: 'Web Development Courses',
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.name, 'Web Development');
      assert.strictEqual(res.body.data.category_id, parentCat.id);

      subCat = res.body.data;
      createdSubcategoryIds.push(subCat.id);
    });

    it('POST /api/admin/subcategories should reject duplicate slug in SAME category (409)', async () => {
      const res = await request(app)
        .post('/api/admin/subcategories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: parentCat.id,
          name: 'Another Web Dev',
          slug: subSlug,
        })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('already exists in this category'));
    });

    it('POST /api/admin/subcategories should allow SAME slug in DIFFERENT category', async () => {
      const res = await request(app)
        .post('/api/admin/subcategories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category_id: targetCat.id,
          name: 'Web Dev in Other Category',
          slug: subSlug, // Same slug but under targetCat!
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.category_id, targetCat.id);
      createdSubcategoryIds.push(res.body.data.id);
    });

    it('GET /api/categories/:catSlug/subcategories should list active subcategories', async () => {
      const res = await request(app)
        .get(`/api/categories/${parentCat.slug}/subcategories`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find(s => s.slug === subSlug);
      assert.ok(found);
    });

    it('GET /api/categories/:catSlug/subcategories/:subSlug should return subcategory page', async () => {
      const res = await request(app)
        .get(`/api/categories/${parentCat.slug}/subcategories/${subSlug}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.category.slug, parentCat.slug);
      assert.strictEqual(res.body.data.subcategory.slug, subSlug);
      assert.ok(Array.isArray(res.body.data.breadcrumbs));
      assert.ok(res.body.data.filters_available);
      assert.ok(Array.isArray(res.body.data.courses));
    });

    it('DELETE /api/admin/categories/:id should reject deletion when active subcategories exist (409)', async () => {
      const res = await request(app)
        .delete(`/api/admin/categories/${parentCat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('subcategories'));
    });
  });

  // ==========================================
  // 3. INSTRUCTOR TESTS
  // ==========================================
  describe('3. Instructor APIs', () => {
    let instructorId = null;

    it('POST /api/admin/instructors should create instructor (201)', async () => {
      const res = await request(app)
        .post('/api/admin/instructors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Instructor ${testRunId}`,
          designation: 'Senior Software Engineer',
          experience_years: 8.5,
          bio: 'Fullstack tech lead',
          photo_url: '/uploads/instructor.jpg',
          social_links: { linkedin: 'https://linkedin.com' },
          status: 'active',
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.experience_years, 8.5);
      instructorId = res.body.data.id;
      createdInstructorIds.push(instructorId);
    });

    it('GET /api/instructors should return public active instructors', async () => {
      const res = await request(app)
        .get('/api/instructors')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const found = res.body.data.find(i => i.id === instructorId);
      assert.ok(found);
    });
  });

  // ==========================================
  // 4. COURSE TESTS (Section 9)
  // ==========================================
  describe('4. Course APIs (Public & Admin)', () => {
    let courseCat = null;
    let courseSub = null;
    let instructor = null;
    let testCourse = null;
    const catSlug = `course-cat-${testRunId}`;
    const subSlug = `course-sub-${testRunId}`;
    const courseCode = `CS-${testRunId}`;
    const courseSlug = `react-masterclass-${testRunId}`;

    before(async () => {
      // 1. Create Category
      const [cRes] = await pool.query(
        'INSERT INTO categories (name, slug, status) VALUES ("Frontend Hub", ?, "active")',
        [catSlug]
      );
      courseCat = { id: cRes.insertId, slug: catSlug };
      createdCategoryIds.push(courseCat.id);

      // 2. Create Subcategory
      const [sRes] = await pool.query(
        'INSERT INTO subcategories (category_id, name, slug, status) VALUES (?, "React Ecosystem", ?, "active")',
        [courseCat.id, subSlug]
      );
      courseSub = { id: sRes.insertId, slug: subSlug };
      createdSubcategoryIds.push(courseSub.id);

      // 3. Create Instructor
      const [iRes] = await pool.query(
        'INSERT INTO instructors (name, designation, status) VALUES ("Jane Doe", "Staff Architect", "active")'
      );
      instructor = { id: iRes.insertId, name: 'Jane Doe' };
      createdInstructorIds.push(instructor.id);
    });

    it('POST /api/admin/courses should create course with status draft (201)', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          course_code: courseCode,
          course_name: 'Modern React 19 Masterclass',
          slug: courseSlug,
          short_description: 'Deep dive into React 19 Server Components and Suspense',
          description: '<p>Comprehensive masterclass.</p><script>alert("hack")</script>', // HTML with script tag to test sanitization!
          subcategory_id: courseSub.id,
          instructor_id: instructor.id,
          course_level: 'intermediate',
          language: 'English',
          mode: 'online',
          duration_hours: 45.5,
          thumbnail_url: '/uploads/react-thumb.jpg',
          price: 4999.00,
          offer_price: 2499.00,
          currency: 'INR',
          tags: ['react', 'nextjs', 'javascript'],
          what_you_will_learn: ['React 19 Server Actions', 'Custom Hooks'],
          tools_covered: ['VS Code', 'Git'],
          prerequisites: ['Basic JavaScript'],
          is_featured: true,
        })
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.course_code, courseCode);
      assert.strictEqual(res.body.data.slug, courseSlug);
      assert.strictEqual(res.body.data.status, 'draft', 'New course must strictly start with draft status');
      assert.strictEqual(res.body.data.category_id, courseCat.id, 'category_id must be auto-derived from subcategory');
      assert.strictEqual(res.body.data.price, 4999);
      assert.strictEqual(res.body.data.offer_price, 2499);

      // Verify HTML description was sanitized (script tag removed!)
      assert.ok(!res.body.data.description.includes('<script>'), 'Script tag must be stripped by sanitizer');
      assert.ok(res.body.data.description.includes('<p>Comprehensive masterclass.</p>'));

      testCourse = res.body.data;
      createdCourseIds.push(testCourse.id);
    });

    it('POST /api/admin/courses should reject duplicate course_code with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          course_code: courseCode,
          course_name: 'Duplicate Code Course',
          short_description: 'Duplicate course code attempt',
          description: '<p>Desc</p>',
          subcategory_id: courseSub.id,
          course_level: 'beginner',
          language: 'Hindi',
          mode: 'online',
          duration_hours: 10,
          price: 999,
        })
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Course code already exists'));
    });

    it('POST /api/admin/courses should reject offer_price greater than price (400)', async () => {
      const res = await request(app)
        .post('/api/admin/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          course_code: `INV-${testRunId}`,
          course_name: 'Invalid Pricing Course',
          short_description: 'Invalid price test',
          description: '<p>Desc</p>',
          subcategory_id: courseSub.id,
          course_level: 'beginner',
          language: 'Hindi',
          mode: 'online',
          duration_hours: 10,
          price: 1000,
          offer_price: 2000, // Invalid: offer_price > price
        })
        .expect(400);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.errors.some(e => e.message.includes('Offer price cannot be greater than regular price')));
    });

    it('GET /api/courses should NOT return draft course in public catalog', async () => {
      const res = await request(app)
        .get('/api/courses')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      const found = res.body.data.find(c => c.slug === courseSlug);
      assert.strictEqual(found, undefined, 'Draft course must NOT be visible in public catalog');
    });

    it('GET /api/courses/:slug should return 404 for draft course', async () => {
      await request(app)
        .get(`/api/courses/${courseSlug}`)
        .expect(404);
    });

    it('PATCH /api/admin/courses/:id/status should publish course', async () => {
      const res = await request(app)
        .patch(`/api/admin/courses/${testCourse.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'published' })
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'published');
      assert.ok(res.body.data.published_at, 'published_at must be populated on publish');
    });

    it('GET /api/courses should now return published course in public catalog', async () => {
      const res = await request(app)
        .get('/api/courses')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      const found = res.body.data.find(c => c.slug === courseSlug);
      assert.ok(found, 'Published course must now be visible in public catalog');
      assert.strictEqual(found.course_level, 'intermediate');
      assert.strictEqual(found.pricing.price, 4999);
      assert.strictEqual(found.pricing.offer_price, 2499);
      assert.strictEqual(found.pricing.discount_percentage, 50);
      assert.strictEqual(found.instructor.name, 'Jane Doe');
      assert.strictEqual(found.badges.is_featured, true);
    });

    it('GET /api/courses with query filters should filter by level and language', async () => {
      const res = await request(app)
        .get(`/api/courses?level=intermediate&language=English&category=${catSlug}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.length >= 1);
      assert.strictEqual(res.body.data[0].slug, courseSlug);

      // Query with non-matching level
      const emptyRes = await request(app)
        .get(`/api/courses?level=advanced&category=${catSlug}`)
        .expect(200);

      assert.strictEqual(emptyRes.body.data.length, 0);
    });

    it('GET /api/courses/:slug should return full course details adhering to Section 9.2', async () => {
      const res = await request(app)
        .get(`/api/courses/${courseSlug}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.basic.slug, courseSlug);
      assert.strictEqual(res.body.data.basic.category.slug, catSlug);
      assert.strictEqual(res.body.data.basic.subcategory.slug, subSlug);
      assert.ok(Array.isArray(res.body.data.breadcrumbs));
      assert.strictEqual(res.body.data.pricing.price, 4999);
      assert.strictEqual(res.body.data.pricing.offer_price, 2499);
      assert.strictEqual(res.body.data.pricing.discount_percentage, 50);
      assert.ok(Array.isArray(res.body.data.learning.what_you_will_learn));
      assert.ok(res.body.data.learning.what_you_will_learn.includes('React 19 Server Actions'));
      assert.ok(res.body.data.user_state);
    });

    it('PATCH /api/admin/courses/:id should record slug change in course_slug_history and redirect 301', async () => {
      const newSlug = `react-masterclass-updated-${testRunId}`;

      const updateRes = await request(app)
        .patch(`/api/admin/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug: newSlug })
        .expect(200);

      assert.strictEqual(updateRes.body.data.slug, newSlug);

      // Verify course_slug_history table has the record
      const [history] = await pool.query(
        'SELECT * FROM course_slug_history WHERE course_id = ? AND old_slug = ? AND new_slug = ?',
        [testCourse.id, courseSlug, newSlug]
      );
      assert.strictEqual(history.length, 1);

      // Requesting the OLD slug publicly must return HTTP 301 Moved Permanently!
      const redirectRes = await request(app)
        .get(`/api/courses/${courseSlug}`)
        .expect(301);

      assert.strictEqual(redirectRes.headers.location, `/api/courses/${newSlug}`);
    });

    it('POST /api/admin/courses/:id/duplicate should duplicate course as draft (201)', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourse.id}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.status, 'draft', 'Duplicated course must start as draft');
      assert.notStrictEqual(res.body.data.id, testCourse.id);
      assert.notStrictEqual(res.body.data.course_code, testCourse.course_code);
      assert.ok(res.body.data.course_name.includes('(Copy)'));

      createdCourseIds.push(res.body.data.id);
    });

    it('GET /api/search should search across courses, categories, and subcategories', async () => {
      const res = await request(app)
        .get('/api/search?q=React')
        .expect(200);

      assert.strictEqual(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.courses));
      assert.ok(Array.isArray(res.body.data.categories));
      assert.ok(Array.isArray(res.body.data.subcategories));
    });

    it('DELETE /api/admin/subcategories/:id should reject deletion when courses exist (409)', async () => {
      const res = await request(app)
        .delete(`/api/admin/subcategories/${courseSub.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Subcategory has courses'));
    });

    it('DELETE /api/admin/courses/:id should soft delete course', async () => {
      const res = await request(app)
        .delete(`/api/admin/courses/${testCourse.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      assert.strictEqual(res.body.success, true);

      // Verify soft deleted in DB
      const [row] = await pool.query('SELECT deleted_at FROM courses WHERE id = ?', [testCourse.id]);
      assert.ok(row[0].deleted_at !== null);

      // Must no longer appear in public API
      await request(app)
        .get(`/api/courses/${testCourse.slug}`)
        .expect(404);
    });
  });

  // ==========================================
  // 5. ROLE & ACCESS CONTROL VERIFICATION
  // ==========================================
  describe('5. Role-Based Access Control on Management Routes', () => {
    it('should reject unauthenticated request on admin category route (401)', async () => {
      await request(app)
        .post('/api/admin/categories')
        .send({ name: 'Hacker Category' })
        .expect(401);
    });

    it('should reject regular user on admin category route (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/admin/categories')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'Hacker Category' })
        .expect(403);

      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes('Forbidden'));
    });

    it('should reject regular user on admin subcategory route (403 Forbidden)', async () => {
      await request(app)
        .post('/api/admin/subcategories')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ name: 'Hacker Subcategory', category_id: 1 })
        .expect(403);
    });

    it('should reject regular user on admin course route (403 Forbidden)', async () => {
      await request(app)
        .post('/api/admin/courses')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({ course_name: 'Hacker Course' })
        .expect(403);
    });
  });
});
