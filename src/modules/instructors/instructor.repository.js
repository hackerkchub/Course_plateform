import { getPool } from '../../config/db.js';

export async function findActiveInstructors() {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, name, designation, experience_years, bio, photo_url, social_links, status
    FROM instructors
    WHERE status = 'active'
    ORDER BY name ASC
  `);
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
  }));
}

export async function findInstructorById(id) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, name, designation, experience_years, bio, photo_url, social_links, status, created_at, updated_at
    FROM instructors
    WHERE id = ?
  `, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    ...r,
    id: Number(r.id),
    experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
    social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
  };
}

export async function findInstructorsAdmin({ status, search, limit = 20, offset = 0 }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(name LIKE ? OR designation LIKE ? OR bio LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows] = await pool.query(
    `SELECT COUNT(*) as total FROM instructors ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const [rows] = await pool.query(`
    SELECT id, name, designation, experience_years, bio, photo_url, social_links, status, created_at, updated_at
    FROM instructors
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    instructors: rows.map(r => ({
      ...r,
      id: Number(r.id),
      experience_years: r.experience_years !== null ? Number(r.experience_years) : null,
      social_links: typeof r.social_links === 'string' ? JSON.parse(r.social_links) : r.social_links,
    })),
    total,
  };
}

export async function createInstructor(data) {
  const pool = getPool();
  const socialLinksJson = data.social_links ? JSON.stringify(data.social_links) : null;

  const [result] = await pool.query(`
    INSERT INTO instructors (name, designation, experience_years, bio, photo_url, social_links, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    data.name,
    data.designation || null,
    data.experience_years || null,
    data.bio || null,
    data.photo_url || null,
    socialLinksJson,
    data.status || 'active',
  ]);

  return findInstructorById(result.insertId);
}

export async function updateInstructor(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  const allowed = ['name', 'designation', 'experience_years', 'bio', 'photo_url', 'status'];
  for (const col of allowed) {
    if (data[col] !== undefined) {
      fields.push(`${col} = ?`);
      params.push(data[col]);
    }
  }

  if (data.social_links !== undefined) {
    fields.push('social_links = ?');
    params.push(data.social_links ? JSON.stringify(data.social_links) : null);
  }

  if (fields.length === 0) {
    return findInstructorById(id);
  }

  params.push(id);
  await pool.query(
    `UPDATE instructors SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findInstructorById(id);
}

export async function deleteInstructor(id) {
  const pool = getPool();
  await pool.query('UPDATE instructors SET status = "inactive" WHERE id = ?', [id]);
}

export default {
  findActiveInstructors,
  findInstructorById,
  findInstructorsAdmin,
  createInstructor,
  updateInstructor,
  deleteInstructor,
};
