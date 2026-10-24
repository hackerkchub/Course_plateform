const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// Always load the actual .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'course_platform_db',
  connectTimeout: 5000,
};

async function verifyDatabaseConnection() {
  console.log('\n--- Dedicated MySQL Read-Only Verification ---');
  console.log(`Target Host:     ${config.host}:${config.port}`);
  console.log(`Target User:     ${config.user}`);
  console.log(`Target Database: ${config.database}`);
  console.log('Password:        [PROTECTED - NOT DISPLAYED]');

  if (config.database !== 'course_platform_db') {
    console.error(`\n❌ ERROR: Target database is '${config.database}'. It must strictly be 'course_platform_db'.`);
    process.exit(1);
  }

  let connection;
  try {
    connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: config.connectTimeout,
    });

    console.log('\n✅ Connection established successfully.');

    // 1. Verify connected database name
    const [dbRows] = await connection.query('SELECT DATABASE() AS current_db, @@version AS mysql_version, @@character_set_database AS charset, @@collation_database AS collation');
    const currentDb = dbRows[0]?.current_db;
    const mysqlVersion = dbRows[0]?.mysql_version;
    const charset = dbRows[0]?.charset;
    const collation = dbRows[0]?.collation;

    if (currentDb !== 'course_platform_db') {
      console.error(`\n❌ ERROR: Connected to unexpected database '${currentDb}'. Expected 'course_platform_db'.`);
      process.exit(1);
    }

    console.log(`Verified Database: ${currentDb}`);
    console.log(`MySQL Version:     ${mysqlVersion}`);
    console.log(`Default Charset:   ${charset}`);
    console.log(`Default Collation: ${collation}`);

    // 2. Count existing tables in course_platform_db (strictly read-only)
    const [tableRows] = await connection.query(
      'SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = ?',
      [config.database]
    );
    const tableCount = tableRows[0]?.table_count || 0;
    console.log(`Existing Tables:   ${tableCount}`);

    if (tableCount === 0) {
      console.log('\n🎉 Verification Passed: Clean empty database ready for Phase 3 migrations.\n');
    } else {
      console.log(`\n⚠️ Note: Database already contains ${tableCount} table(s).\n`);
    }

    await connection.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection Verification Failed:');
    if (error.code === 'ECONNREFUSED') {
      console.error(`  Error Code: ECONNREFUSED`);
      console.error(`  Reason: Could not connect to MySQL at ${config.host}:${config.port}. Is MySQL running (e.g., in XAMPP/WAMP)?`);
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`  Error Code: ER_ACCESS_DENIED_ERROR`);
      console.error(`  Reason: Access denied for user '${config.user}'. Check your DB_PASSWORD in .env.`);
    } else if (error.code === 'ER_BAD_DB_ERROR') {
      console.error(`  Error Code: ER_BAD_DB_ERROR`);
      console.error(`  Reason: Database '${config.database}' does not exist yet. Please create an empty database named 'course_platform_db' in phpMyAdmin.`);
    } else {
      console.error(`  Error Code: ${error.code || 'UNKNOWN'}`);
      console.error(`  Message:    ${error.message}`);
    }
    console.log('');
    if (connection) await connection.end();
    process.exit(1);
  }
}

verifyDatabaseConnection();
