import { getPool } from '../src/config/db.js';

async function checkTables() {
  const pool = getPool();
  try {
    const [tables] = await pool.query('SHOW TABLES');
    console.log('All tables in course_platform_db:', tables.map(t => Object.values(t)[0]));

    for (const tableName of ['course_views', 'course_analytics_daily', 'courses', 'notifications', 'audit_logs']) {
      const [cols] = await pool.query(`DESCRIBE ${tableName}`);
      console.log(`\n=== Columns of ${tableName} ===`);
      console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));
    }
  } catch (err) {
    console.error('Error checking DB tables:', err);
  } finally {
    await pool.end();
  }
}

checkTables();
