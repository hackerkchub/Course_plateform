import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import app from '../src/app.js';
import { getPool, closePool } from '../src/config/db.js';
import { generateAccessToken } from '../src/utils/token.js';
import env from '../src/config/env.js';

describe('Phase 7: Uploads, Media & Materials Automated Tests', () => {
  let pool;
  let adminToken;
  let userToken;
  let enrolledUserToken;
  let adminCookie;
  let userCookie;
  let enrolledUserCookie;

  let adminUserId;
  let normalUserId;
  let enrolledUserId;

  let testCategoryId;
  let testSubcategoryId;
  let testCourseId;
  let testCourseSlug;

  let publicMaterialId;
  let privateMaterialId;

  let uploadedPublicImagePath;
  let uploadedPublicDocPath;
  let uploadedPrivateMaterialPath;

  const timestamp = Date.now();
  const testCategorySlug = `phase7-cat-${timestamp}`;
  const testSubcategorySlug = `phase7-sub-${timestamp}`;
  const testCourseCode = `P7-${timestamp.toString().slice(-6)}`;
  testCourseSlug = `phase7-course-${timestamp}`;

  // Valid binary payloads for magic-bytes verification
  const validJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const validWebpBuffer = Buffer.alloc(16);
  validWebpBuffer.write('RIFF', 0);
  validWebpBuffer.write('WEBP', 8);

  const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
  const validZipBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);

  before(async () => {
    pool = getPool();

    // 1. Create synthetic admin user
    const [adminUserRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'admin', 'active')
    `, [`google_p7_admin_${timestamp}`, `p7_admin_${timestamp}@example.com`, 'Phase 7 Admin']);
    adminUserId = adminUserRes.insertId;

    // 2. Create synthetic regular (unenrolled) user
    const [normalUserRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `, [`google_p7_user_${timestamp}`, `p7_user_${timestamp}@example.com`, 'Phase 7 Student']);
    normalUserId = normalUserRes.insertId;

    // 3. Create synthetic enrolled user
    const [enrolledUserRes] = await pool.query(`
      INSERT INTO users (google_id, email, name, role, status)
      VALUES (?, ?, ?, 'user', 'active')
    `, [`google_p7_enrolled_${timestamp}`, `p7_enrolled_${timestamp}@example.com`, 'Phase 7 Enrolled Student']);
    enrolledUserId = enrolledUserRes.insertId;

    adminToken = generateAccessToken({ id: adminUserId, email: `p7_admin_${timestamp}@example.com`, role: 'admin' });
    userToken = generateAccessToken({ id: normalUserId, email: `p7_user_${timestamp}@example.com`, role: 'user' });
    enrolledUserToken = generateAccessToken({ id: enrolledUserId, email: `p7_enrolled_${timestamp}@example.com`, role: 'user' });

    adminCookie = `access_token=${adminToken}`;
    userCookie = `access_token=${userToken}`;
    enrolledUserCookie = `access_token=${enrolledUserToken}`;

    // 4. Create synthetic category & subcategory
    const [catRes] = await pool.query(`
      INSERT INTO categories (name, slug, description, status)
      VALUES (?, ?, 'Phase 7 Category', 'active')
    `, [`Phase 7 Category ${timestamp}`, testCategorySlug]);
    testCategoryId = catRes.insertId;

    const [subRes] = await pool.query(`
      INSERT INTO subcategories (category_id, name, slug, description, status)
      VALUES (?, ?, ?, 'Phase 7 Subcategory', 'active')
    `, [testCategoryId, `Phase 7 Subcategory ${timestamp}`, testSubcategorySlug]);
    testSubcategoryId = subRes.insertId;

    // 5. Create synthetic published course
    const [courseRes] = await pool.query(`
      INSERT INTO courses (
        course_code, course_name, slug, short_description, description,
        category_id, subcategory_id, course_level, language, mode,
        duration_hours, price, offer_price, status, published_at
      )
      VALUES (?, ?, ?, 'Phase 7 short desc', '<p>Phase 7 desc</p>', ?, ?, 'beginner', 'English', 'online', 10, 5000, 3999, 'published', NOW())
    `, [testCourseCode, `Phase 7 Test Course ${timestamp}`, testCourseSlug, testCategoryId, testSubcategoryId]);
    testCourseId = courseRes.insertId;

    // 6. Enroll enrolledUserId in testCourseId
    await pool.query(`
      INSERT INTO course_enrollments (
        user_id, course_id, enrollment_source, enrollment_status, enrolled_at
      )
      VALUES (?, ?, 'free', 'active', NOW())
    `, [enrolledUserId, testCourseId]);
  });

  after(async () => {
    // Clean up test database records
    if (testCourseId) {
      await pool.query('DELETE FROM course_materials WHERE course_id = ?', [testCourseId]);
      await pool.query('DELETE FROM course_enrollments WHERE course_id = ?', [testCourseId]);
      await pool.query('DELETE FROM courses WHERE id = ?', [testCourseId]);
    }
    if (testSubcategoryId) {
      await pool.query('DELETE FROM subcategories WHERE id = ?', [testSubcategoryId]);
    }
    if (testCategoryId) {
      await pool.query('DELETE FROM categories WHERE id = ?', [testCategoryId]);
    }
    if (adminUserId || normalUserId || enrolledUserId) {
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [adminUserId, normalUserId, enrolledUserId]);
    }

    // Clean up files on disk if any remain
    const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
    for (const p of [uploadedPublicImagePath, uploadedPublicDocPath, uploadedPrivateMaterialPath]) {
      if (p) {
        try {
          const cleanP = p.replace(/^\/files\//, 'public/').replace(/^\/private\//, 'private/');
          const fullPath = path.resolve(uploadRoot, cleanP);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch {}
      }
    }

    await closePool();
  });

  // ==========================================
  // 1. Uploads Security & Validation (Section 12.1)
  // ==========================================
  describe('1. Uploads Security & Validation (Section 12.1)', () => {
    it('POST /api/admin/uploads should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .attach('file', validPngBuffer, 'test.png')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject non-admin users with 403', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', userCookie)
        .attach('file', validPngBuffer, 'test.png')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject missing file payload with 400', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .field('purpose', 'image');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject missing or invalid purpose with 400', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validPngBuffer, 'test.png')
        .field('purpose', 'unsupported_purpose');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject image with invalid extension (.exe) with 400', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validPngBuffer, 'malicious.exe')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject image with magic byte mismatch with 400', async () => {
      // Named test.jpg but content is plain text
      const fakeJpg = Buffer.from('NOT A REAL JPEG FILE CONTENT');
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', fakeJpg, 'fake.jpg')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should reject oversized image (> 2 MB) with 400', async () => {
      // Create a 2.1 MB buffer starting with JPEG header
      const largeJpg = Buffer.alloc(2.1 * 1024 * 1024);
      largeJpg[0] = 0xFF;
      largeJpg[1] = 0xD8;
      largeJpg[2] = 0xFF;

      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', largeJpg, 'large.jpg')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /2 MB/i);
    });

    it('POST /api/admin/uploads should successfully upload valid JPEG image into /files/images/', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validJpegBuffer, 'thumbnail.jpg')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.path, /^\/files\/images\/[a-f0-9-]+-thumbnail\.jpg$/);
      assert.strictEqual(res.body.data.file_type, 'image/jpeg');
      assert.strictEqual(res.body.data.file_size_bytes, validJpegBuffer.length);

      uploadedPublicImagePath = res.body.data.path;
    });

    it('POST /api/admin/uploads should successfully upload valid PNG image', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validPngBuffer, 'banner.png')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.path, /^\/files\/images\/[a-f0-9-]+-banner\.png$/);
      assert.strictEqual(res.body.data.file_type, 'image/png');

      // Delete this temporary test file
      await request(app)
        .delete('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .send({ path: res.body.data.path });
    });

    it('POST /api/admin/uploads should successfully upload valid WEBP image', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validWebpBuffer, 'icon.webp')
        .field('purpose', 'image');

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.path, /^\/files\/images\/[a-f0-9-]+-icon\.webp$/);

      // Clean up
      await request(app)
        .delete('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .send({ path: res.body.data.path });
    });

    it('GET /files/images/... should serve uploaded public image statically with 200', async () => {
      const res = await request(app).get(uploadedPublicImagePath);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'image/jpeg');
    });

    it('POST /api/admin/uploads should reject document with non-PDF extension with 400', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validPdfBuffer, 'brochure.docx')
        .field('purpose', 'document');

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/uploads should successfully upload valid PDF document into /files/docs/', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validPdfBuffer, 'syllabus.pdf')
        .field('purpose', 'document');

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.path, /^\/files\/docs\/[a-f0-9-]+-syllabus\.pdf$/);
      assert.strictEqual(res.body.data.file_type, 'application/pdf');

      uploadedPublicDocPath = res.body.data.path;
    });

    it('GET /files/docs/... should serve uploaded public document statically with 200', async () => {
      const res = await request(app).get(uploadedPublicDocPath);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers['content-type'], 'application/pdf');
    });

    it('POST /api/admin/uploads should upload material into /private/materials/ folder', async () => {
      const res = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validZipBuffer, 'project_starter.zip')
        .field('purpose', 'material');

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.match(res.body.data.path, /^\/private\/materials\/[a-f0-9-]+-project_starter\.zip$/);
      assert.strictEqual(res.body.data.file_type, 'application/zip');

      uploadedPrivateMaterialPath = res.body.data.path;
    });

    it('GET /files/private/materials/... should NOT serve private materials statically (returns 404)', async () => {
      const staticUrl = uploadedPrivateMaterialPath.replace('/private/', '/files/private/');
      const res = await request(app).get(staticUrl);
      assert.strictEqual(res.status, 404);
    });
  });

  // ==========================================
  // 2. Upload Deletion Security (Section 12.1)
  // ==========================================
  describe('2. Upload Deletion & Path Traversal Prevention (Section 12.1)', () => {
    it('DELETE /api/admin/uploads should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .delete('/api/admin/uploads')
        .send({ path: uploadedPublicImagePath });

      assert.strictEqual(res.status, 401);
    });

    it('DELETE /api/admin/uploads should reject non-admin users with 403', async () => {
      const res = await request(app)
        .delete('/api/admin/uploads')
        .set('Cookie', userCookie)
        .send({ path: uploadedPublicImagePath });

      assert.strictEqual(res.status, 403);
    });

    it('DELETE /api/admin/uploads should reject path traversal attempt with 400', async () => {
      const res = await request(app)
        .delete('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .send({ path: '../../package.json' });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /traversal/i);
    });

    it('DELETE /api/admin/uploads should delete existing file from disk', async () => {
      // Upload a temporary file
      const uploadRes = await request(app)
        .post('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .attach('file', validJpegBuffer, 'temp_to_delete.jpg')
        .field('purpose', 'image');

      assert.strictEqual(uploadRes.status, 201);
      const tempPath = uploadRes.body.data.path;

      // Delete the file
      const delRes = await request(app)
        .delete('/api/admin/uploads')
        .set('Cookie', adminCookie)
        .send({ path: tempPath });

      assert.strictEqual(delRes.status, 200);
      assert.strictEqual(delRes.body.success, true);

      // Verify file is no longer accessible via static route
      const getRes = await request(app).get(tempPath);
      assert.strictEqual(getRes.status, 404);
    });
  });

  // ==========================================
  // 3. Admin Course Materials CRUD (Section 12.2)
  // ==========================================
  describe('3. Admin Course Materials CRUD (Section 12.2)', () => {
    it('POST /api/admin/courses/:id/materials should reject missing title with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie)
        .send({
          material_type: 'notes',
          file_path: uploadedPrivateMaterialPath,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/materials should reject invalid material_type with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Invalid Material',
          material_type: 'unknown_type',
          file_path: uploadedPrivateMaterialPath,
        });

      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.success, false);
    });

    it('POST /api/admin/courses/:id/materials should create a public preview material', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Course Syllabus & Curriculum Guide',
          material_type: 'syllabus',
          file_path: uploadedPublicDocPath,
          is_preview: true,
          requires_enrollment: false,
          display_order: 1,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Course Syllabus & Curriculum Guide');
      assert.strictEqual(res.body.data.is_preview, true);
      assert.strictEqual(res.body.data.requires_enrollment, false);

      publicMaterialId = res.body.data.id;
    });

    it('POST /api/admin/courses/:id/materials should create a private course material', async () => {
      const res = await request(app)
        .post(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Project Source Code & Starter Kit',
          material_type: 'project',
          file_path: uploadedPrivateMaterialPath,
          is_preview: false,
          requires_enrollment: true,
          display_order: 2,
        });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Project Source Code & Starter Kit');
      assert.strictEqual(res.body.data.is_preview, false);
      assert.strictEqual(res.body.data.requires_enrollment, true);

      privateMaterialId = res.body.data.id;
    });

    it('GET /api/admin/courses/:id/materials should return all materials for admin', async () => {
      const res = await request(app)
        .get(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 2);
    });

    it('PATCH /api/admin/materials/:materialId should update material title and order', async () => {
      const res = await request(app)
        .patch(`/api/admin/materials/${publicMaterialId}`)
        .set('Cookie', adminCookie)
        .send({
          title: 'Updated Official Syllabus 2026',
          display_order: 10,
        });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.title, 'Updated Official Syllabus 2026');
      assert.strictEqual(res.body.data.display_order, 10);
    });
  });

  // ==========================================
  // 4. Public & Student Material Visibility (Section 12.2)
  // ==========================================
  describe('4. Material Visibility & Access Rules (Section 12.2)', () => {
    it('GET /api/courses/:id/materials as guest should return ONLY public/preview materials', async () => {
      const res = await request(app).get(`/api/courses/${testCourseId}/materials`);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].id, publicMaterialId);
      assert.strictEqual(res.body.data[0].is_preview, true);
    });

    it('GET /api/courses/:id/materials as unenrolled user should return ONLY public/preview materials', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials`)
        .set('Cookie', userCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 1);
      assert.strictEqual(res.body.data[0].id, publicMaterialId);
    });

    it('GET /api/courses/:id/materials as enrolled student should return ALL materials with signed links', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials`)
        .set('Cookie', enrolledUserCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 2);

      const privateItem = res.body.data.find(m => m.id === privateMaterialId);
      assert.ok(privateItem);
      assert.match(privateItem.download_url, /token=[a-f0-9]+&expires=\d+/);
    });

    it('GET /api/courses/:id/materials as admin should return ALL materials', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.length, 2);
    });
  });

  // ==========================================
  // 5. Download Streaming & Signed URL Security (Section 12.2)
  // ==========================================
  describe('5. Download Streaming & Signed URL Security (Section 12.2)', () => {
    it('GET public preview material download without token should succeed for guest', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${publicMaterialId}/download`);

      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-disposition'], /attachment; filename=/);
    });

    it('GET private material download without token should return 401 for guest', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download`);

      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body.success, false);
    });

    it('GET private material download without token should return 403 for unenrolled user', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download`)
        .set('Cookie', userCookie);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
    });

    it('GET private material download with valid signed token should stream file to client', async () => {
      // 1. Fetch materials as enrolled user to get a signed URL
      const listRes = await request(app)
        .get(`/api/courses/${testCourseId}/materials`)
        .set('Cookie', enrolledUserCookie);

      const privateItem = listRes.body.data.find(m => m.id === privateMaterialId);
      assert.ok(privateItem.download_url);

      // 2. Access the signed download URL (even without cookies, as link is pre-signed)
      const res = await request(app).get(privateItem.download_url);

      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-disposition'], /attachment; filename=/);
    });

    it('GET private material download with tampered/invalid token should return 403', async () => {
      const expires = Math.floor(Date.now() / 1000) + 600;
      const fakeToken = 'badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb';

      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download?token=${fakeToken}&expires=${expires}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /invalid/i);
    });

    it('GET private material download with expired token should return 403', async () => {
      // Expired 60 seconds ago
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 60;
      const validSigForExpired = crypto
        .createHmac('sha256', env.JWT_ACCESS_SECRET)
        .update(`${testCourseId}:${privateMaterialId}:${expiredTimestamp}`)
        .digest('hex');

      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download?token=${validSigForExpired}&expires=${expiredTimestamp}`);

      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /expired/i);
    });

    it('GET private material download without token by enrolled student should succeed', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download`)
        .set('Cookie', enrolledUserCookie);

      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-disposition'], /attachment; filename=/);
    });

    it('GET private material download without token by admin should succeed', async () => {
      const res = await request(app)
        .get(`/api/courses/${testCourseId}/materials/${privateMaterialId}/download`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.match(res.headers['content-disposition'], /attachment; filename=/);
    });

    it('DELETE /api/admin/materials/:materialId should delete material and remove file from disk', async () => {
      const res = await request(app)
        .delete(`/api/admin/materials/${privateMaterialId}`)
        .set('Cookie', adminCookie);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);

      // Verify material no longer exists in course materials list
      const listRes = await request(app)
        .get(`/api/admin/courses/${testCourseId}/materials`)
        .set('Cookie', adminCookie);

      assert.strictEqual(listRes.body.data.length, 1);
      assert.strictEqual(listRes.body.data[0].id, publicMaterialId);
    });
  });

  // ==========================================
  // 6. Audit Logging Verification
  // ==========================================
  describe('6. Audit Logging Verification', () => {
    it('Should verify audit_logs entries were recorded for Phase 7 administrative writes', async () => {
      const [logs] = await pool.query(`
        SELECT action, entity_type
        FROM audit_logs
        WHERE actor_id = ?
        ORDER BY id DESC
      `, [adminUserId]);

      const actions = logs.map(l => l.action);
      assert.ok(actions.includes('upload.create'), 'Should log upload.create');
      assert.ok(actions.includes('upload.delete'), 'Should log upload.delete');
      assert.ok(actions.includes('material.create'), 'Should log material.create');
      assert.ok(actions.includes('material.update'), 'Should log material.update');
      assert.ok(actions.includes('material.delete'), 'Should log material.delete');
    });
  });
});
