import { getPool } from '../src/config/db.js';

async function checkViewsAndAnalytics() {
  const pool = getPool();
  try {
    for (const tableName of ['course_views', 'course_analytics_daily']) {
      const [cols] = await pool.query(`DESCRIBE ${tableName}`);
      console.log(`\n=== Columns of ${tableName} ===`);
      console.table(cols.map(c => ({ Field: c.Field, Type: c.Type, Null: c.Null, Key: c.Key, Default: c.Default })));
      const [indexes] = await pool.query(`SHOW INDEX FROM ${tableName}`);
      console.log(`=== Indexes of ${tableName} ===`);
      console.table(indexes.map(idx => ({ Key_name: idx.Key_name, Column_name: idx.Column_name, Non_unique: idx.Non_unique })));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkViewsAndAnalytics();
