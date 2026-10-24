import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'course_platform_db',
  multipleStatements: true,
};

async function runMigrations() {
  console.log('\n=============================================');
  console.log('   Course Platform Database Migration Runner ');
  console.log('=============================================\n');

  // Safety check 1: Target database must strictly be course_platform_db
  if (config.database !== 'course_platform_db') {
    console.error(`❌ FATAL SAFETY ABORT: Configured database is '${config.database}'.`);
    console.error(`   Migrations are restricted strictly to 'course_platform_db'.`);
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection(config);
    console.log(`Connected to MySQL server at ${config.host}:${config.port}`);

    // Safety check 2: Verify active database from server session
    const [dbRows] = await connection.query('SELECT DATABASE() AS current_db');
    const activeDb = dbRows[0]?.current_db;
    if (activeDb !== 'course_platform_db') {
      console.error(`❌ FATAL SAFETY ABORT: Server session database is '${activeDb}'. Expected 'course_platform_db'.`);
      process.exit(1);
    }
    console.log(`Verified active database: ${activeDb}\n`);

    // Ensure migration tracking table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        batch INT UNSIGNED NOT NULL DEFAULT 1,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Get list of already applied migrations
    const [appliedRows] = await connection.query('SELECT migration_name FROM schema_migrations ORDER BY id ASC');
    const appliedSet = new Set(appliedRows.map(r => r.migration_name));

    // Determine current batch number
    const [batchRows] = await connection.query('SELECT COALESCE(MAX(batch), 0) + 1 AS next_batch FROM schema_migrations');
    const currentBatch = batchRows[0]?.next_batch || 1;

    // Read and sort all .sql files in migrations directory
    const migrationsDir = path.resolve(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let appliedCount = 0;

    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ⏩ Skipping already applied: ${file}`);
        continue;
      }

      console.log(`  🚀 Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute migration SQL statements
      await connection.query(sql);

      // Record in schema_migrations
      await connection.query(
        'INSERT INTO schema_migrations (migration_name, batch) VALUES (?, ?)',
        [file, currentBatch]
      );

      console.log(`  ✅ Successfully applied:  ${file}`);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log('\n✨ Database is already up to date. No new migrations applied.');
    } else {
      console.log(`\n🎉 Successfully applied ${appliedCount} migration file(s) in batch ${currentBatch}.`);
    }

    // Report final table count in course_platform_db
    const [tableRows] = await connection.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'course_platform_db' AND table_type = 'BASE TABLE' AND table_name != 'schema_migrations'
      ORDER BY table_name ASC
    `);

    console.log(`\nVerified Table Count in 'course_platform_db': ${tableRows.length} tables (excluding schema_migrations)`);

    await connection.end();
    return { appliedCount, tableCount: tableRows.length, tables: tableRows.map(t => t.table_name) };
  } catch (error) {
    console.error('\n❌ Migration execution failed:');
    console.error(`   Error Code: ${error.code || 'UNKNOWN'}`);
    console.error(`   Message:    ${error.message}`);
    if (connection) await connection.end();
    throw error;
  }
}

const isDirectCall = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectCall) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { runMigrations };
export default runMigrations;

