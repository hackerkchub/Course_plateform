import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrations/runner.js';
import { seedSuperAdmin } from '../seeds/001_super_admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'course_platform_db',
};

const REQUIRED_33_TABLES = [
  'users',
  'refresh_tokens',
  'categories',
  'subcategories',
  'instructors',
  'courses',
  'course_slug_history',
  'course_seo',
  'course_tags',
  'course_points',
  'course_faqs',
  'course_testimonials',
  'course_modules',
  'course_lessons',
  'course_materials',
  'course_batches',
  'course_benefits',
  'course_enrollment_settings',
  'course_offers',
  'course_installment_plans',
  'course_demo_settings',
  'demo_requests',
  'demo_request_activity_log',
  'course_eligibility_rules',
  'eligibility_checks',
  'course_enrollments',
  'lesson_progress',
  'wishlists',
  'course_reviews',
  'course_views',
  'course_analytics_daily',
  'audit_logs',
  'notifications',
];

describe('Phase 3: Database Schema & Migration Verification', () => {
  let connection;

  before(async () => {
    connection = await mysql.createConnection(config);
  });

  after(async () => {
    if (connection) await connection.end();
  });

  it('Safety check: Active database must strictly be course_platform_db', async () => {
    const [rows] = await connection.query('SELECT DATABASE() AS active_db');
    assert.strictEqual(rows[0]?.active_db, 'course_platform_db');
  });

  it('Should verify all 33 tables exist in course_platform_db', async () => {
    const [rows] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'course_platform_db' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations'
    `);

    const existingTables = rows.map(r => r.table_name);
    
    // Check total count is exactly 33
    assert.strictEqual(existingTables.length, 33, `Expected exactly 33 tables, found ${existingTables.length}`);

    // Verify each required table exists
    for (const tableName of REQUIRED_33_TABLES) {
      assert.ok(existingTables.includes(tableName), `Missing required table: ${tableName}`);
    }
  });

  it('Should verify InnoDB engine and utf8mb4 charset across tables', async () => {
    const [rows] = await connection.query(`
      SELECT table_name, engine, table_collation
      FROM information_schema.tables 
      WHERE table_schema = 'course_platform_db' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations'
    `);

    for (const row of rows) {
      assert.strictEqual(row.engine.toLowerCase(), 'innodb', `Table ${row.table_name} engine must be InnoDB`);
      assert.ok(row.table_collation.startsWith('utf8mb4'), `Table ${row.table_name} collation must start with utf8mb4`);
    }
  });

  it('Should verify critical UNIQUE constraints from specification', async () => {
    const [constraints] = await connection.query(`
      SELECT table_name, constraint_name
      FROM information_schema.table_constraints
      WHERE table_schema = 'course_platform_db' AND constraint_type = 'UNIQUE'
    `);

    const tableNamesWithUnique = new Set(constraints.map(c => c.table_name));

    assert.ok(tableNamesWithUnique.has('users'), 'users must have unique constraint (email/google_id)');
    assert.ok(tableNamesWithUnique.has('categories'), 'categories must have unique constraint (slug)');
    assert.ok(tableNamesWithUnique.has('subcategories'), 'subcategories must have unique constraint (category_id, slug)');
    assert.ok(tableNamesWithUnique.has('courses'), 'courses must have unique constraint (slug/course_code)');
    assert.ok(tableNamesWithUnique.has('course_seo'), 'course_seo must be 1:1 with course_id');
    assert.ok(tableNamesWithUnique.has('course_enrollments'), 'course_enrollments must have UNIQUE(user_id, course_id)');
    assert.ok(tableNamesWithUnique.has('lesson_progress'), 'lesson_progress must have UNIQUE(user_id, lesson_id)');
    assert.ok(tableNamesWithUnique.has('wishlists'), 'wishlists must have UNIQUE(user_id, course_id)');
    assert.ok(tableNamesWithUnique.has('course_reviews'), 'course_reviews must have UNIQUE(user_id, course_id)');
    assert.ok(tableNamesWithUnique.has('course_analytics_daily'), 'course_analytics_daily must have UNIQUE(course_id, analytics_date)');
  });

  it('Should verify Foreign Key constraints are properly established', async () => {
    const [fkRows] = await connection.query(`
      SELECT table_name, constraint_name, referenced_table_name
      FROM information_schema.key_column_usage
      WHERE table_schema = 'course_platform_db' AND referenced_table_name IS NOT NULL
    `);

    assert.ok(fkRows.length > 20, `Expected at least 20 foreign key relationships, found ${fkRows.length}`);

    // Verify key parent-child relationships
    const subcatFk = fkRows.find(f => f.table_name === 'subcategories' && f.referenced_table_name === 'categories');
    assert.ok(subcatFk, 'subcategories must reference categories');

    const courseSubcatFk = fkRows.find(f => f.table_name === 'courses' && f.referenced_table_name === 'subcategories');
    assert.ok(courseSubcatFk, 'courses must reference subcategories');

    const lessonModuleFk = fkRows.find(f => f.table_name === 'course_lessons' && f.referenced_table_name === 'course_modules');
    assert.ok(lessonModuleFk, 'course_lessons must reference course_modules');

    const enrollCourseFk = fkRows.find(f => f.table_name === 'course_enrollments' && f.referenced_table_name === 'courses');
    assert.ok(enrollCourseFk, 'course_enrollments must reference courses');
  });

  it('Should verify super-admin user is seeded with role super_admin', async () => {
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const [users] = await connection.query(
      'SELECT id, name, email, role, status FROM users WHERE email = ?',
      [superAdminEmail]
    );

    assert.strictEqual(users.length, 1, `Expected super admin account for ${superAdminEmail}`);
    assert.strictEqual(users[0]?.role, 'super_admin');
    assert.strictEqual(users[0]?.status, 'active');
  });

  it('Migration runner should be idempotent (rerun does not fail or duplicate)', async () => {
    const result = await runMigrations();
    assert.strictEqual(result.appliedCount, 0, 'Rerunning migrations should apply 0 new files');
    assert.strictEqual(result.tableCount, 33, 'Table count must remain exactly 33');
  });

  it('Super-admin seeder should be idempotent (rerun does not create duplicate)', async () => {
    const result = await seedSuperAdmin();
    assert.strictEqual(result.success, true);

    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const [users] = await connection.query(
      'SELECT COUNT(*) as count FROM users WHERE email = ?',
      [superAdminEmail]
    );
    assert.strictEqual(Number(users[0]?.count), 1, 'There must be exactly one user record for super admin email');
  });

  it('Should verify course_batches.status ENUM aligns with Section 11.2 (open, full, closed, completed)', async () => {
    const [cols] = await connection.query(`
      SELECT column_type, column_default
      FROM information_schema.columns
      WHERE table_schema = 'course_platform_db' AND table_name = 'course_batches' AND column_name = 'status'
    `);
    assert.strictEqual(cols.length, 1);
    const colType = cols[0].column_type.toLowerCase();
    assert.ok(colType.includes("'open'"));
    assert.ok(colType.includes("'full'"));
    assert.ok(colType.includes("'closed'"));
    assert.ok(colType.includes("'completed'"));
    assert.strictEqual(cols[0].column_default.replace(/'/g, ''), 'open');
  });

  it('Should verify audit_logs database-level immutability via triggers', async () => {
    // Insert a test audit record
    const [ins] = await connection.query(
      "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('TEST_AUDIT', 'test_entity', 9999)"
    );
    const testId = ins.insertId;
    assert.ok(testId > 0);

    // Attempting to UPDATE must throw SQL error from trigger
    await assert.rejects(
      async () => {
        await connection.query("UPDATE audit_logs SET action = 'MODIFIED' WHERE id = ?", [testId]);
      },
      (err) => {
        return err.message.includes('audit_logs entries are immutable and cannot be updated');
      },
      'Database must reject UPDATE on audit_logs'
    );

    // Attempting to DELETE must throw SQL error from trigger
    await assert.rejects(
      async () => {
        await connection.query("DELETE FROM audit_logs WHERE id = ?", [testId]);
      },
      (err) => {
        return err.message.includes('audit_logs entries are immutable and cannot be deleted');
      },
      'Database must reject DELETE on audit_logs'
    );
  });

  it('Should verify all Section 4.9 specific indexes exist in course_platform_db', async () => {
    const [idxRows] = await connection.query(`
      SELECT table_name, index_name, column_name, seq_in_index
      FROM information_schema.statistics
      WHERE table_schema = 'course_platform_db'
    `);

    // Helper to check compound or single column index
    const hasIndexOn = (tableName, cols) => {
      const tableIndexes = idxRows.filter(r => r.table_name === tableName);
      const indexNames = [...new Set(tableIndexes.map(r => r.index_name))];
      return indexNames.some(idxName => {
        const matchingCols = tableIndexes
          .filter(r => r.index_name === idxName)
          .sort((a, b) => a.seq_in_index - b.seq_in_index)
          .map(r => r.column_name);
        return cols.every((c, i) => matchingCols[i] === c);
      });
    };

    assert.ok(hasIndexOn('courses', ['slug']), 'Missing index: courses(slug)');
    assert.ok(hasIndexOn('courses', ['subcategory_id', 'status']), 'Missing index: courses(subcategory_id, status)');
    assert.ok(hasIndexOn('courses', ['status', 'published_at']), 'Missing index: courses(status, published_at)');
    assert.ok(hasIndexOn('courses', ['category_id', 'status']), 'Missing index: courses(category_id, status)');
    assert.ok(hasIndexOn('subcategories', ['category_id', 'slug']), 'Missing index: subcategories(category_id, slug)');
    assert.ok(hasIndexOn('demo_requests', ['course_id', 'status']), 'Missing index: demo_requests(course_id, status)');
    assert.ok(hasIndexOn('demo_requests', ['phone', 'course_id']), 'Missing index: demo_requests(phone, course_id)');
    assert.ok(hasIndexOn('demo_requests', ['email', 'course_id']), 'Missing index: demo_requests(email, course_id)');
    assert.ok(hasIndexOn('course_enrollments', ['user_id', 'course_id']), 'Missing index: course_enrollments(user_id, course_id)');
    assert.ok(hasIndexOn('course_views', ['course_id', 'viewed_at']), 'Missing index: course_views(course_id, viewed_at)');
    assert.ok(hasIndexOn('users', ['email']), 'Missing index: users(email)');
    assert.ok(hasIndexOn('users', ['google_id']), 'Missing index: users(google_id)');
  });
});
