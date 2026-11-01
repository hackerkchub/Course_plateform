import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

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

const ALLOWED_DATABASES = Object.freeze([
  'course_platform_db',
  'softmaxs_course_platform_db',
]);

async function seedSuperAdmin() {
  console.log('\n--- Super Admin Idempotent Seeder ---');

  if (!ALLOWED_DATABASES.includes(config.database)) {
    throw new Error(`Safety abort: Target database must be one of: ${ALLOWED_DATABASES.join(', ')}. Got: ${config.database}`);
  }

  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!superAdminEmail || !superAdminEmail.includes('@')) {
    throw new Error(`Invalid or missing SUPER_ADMIN_EMAIL in environment: '${process.env.SUPER_ADMIN_EMAIL}'`);
  }

  const connection = await mysql.createConnection(config);

  try {
    const [dbRows] = await connection.query('SELECT DATABASE() AS current_db');
    if (!ALLOWED_DATABASES.includes(dbRows[0]?.current_db)) {
      throw new Error(`Safety abort: active db is not in approved database allowlist: ${dbRows[0]?.current_db}`);
    }

    // Check if user already exists
    const [existing] = await connection.query(
      'SELECT id, name, email, role, status, google_id FROM users WHERE email = ?',
      [superAdminEmail]
    );

    if (existing.length > 0) {
      const user = existing[0];
      if (user.role === 'super_admin' && user.status === 'active') {
        console.log(`✅ Super-admin account already active for ${superAdminEmail} (User ID: ${user.id}). No changes needed.`);
      } else {
        await connection.query(
          "UPDATE users SET role = 'super_admin', status = 'active', email_verified = TRUE WHERE id = ?",
          [user.id]
        );
        console.log(`✅ Promoted existing user ${superAdminEmail} (User ID: ${user.id}) to super_admin.`);
      }
    } else {
      // Pre-provision super admin record. google_id is NULL and will be linked upon first Google OAuth login.
      const [insertResult] = await connection.query(
        "INSERT INTO users (name, email, role, status, email_verified, google_id) VALUES (?, ?, 'super_admin', 'active', TRUE, NULL)",
        ['Super Administrator', superAdminEmail]
      );
      console.log(`✅ Pre-provisioned super_admin record for ${superAdminEmail} (New User ID: ${insertResult.insertId}).`);
      console.log('   Note: Upon first Google login with this email, google_id will be securely linked.');
    }

    return { email: superAdminEmail, success: true };
  } finally {
    await connection.end();
  }
}

const isDirectCall = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectCall) {
  seedSuperAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Super admin seed failed:', err.message);
      process.exit(1);
    });
}

export { seedSuperAdmin };
export default seedSuperAdmin;

