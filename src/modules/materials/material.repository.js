import { getPool } from '../../config/db.js';

export async function findCourseByIdOrSlug(idOrSlug) {
  const pool = getPool();
  const isNumeric = !isNaN(Number(idOrSlug)) && Number(idOrSlug) > 0;

  const [rows] = await pool.query(
    `SELECT id, course_name, slug, status, deleted_at
     FROM courses
     WHERE (${isNumeric ? 'id = ? OR ' : ''}slug = ?)
       AND deleted_at IS NULL
     LIMIT 1`,
    isNumeric ? [Number(idOrSlug), String(idOrSlug)] : [String(idOrSlug)]
  );

  return rows[0] || null;
}

export async function findMaterialsByCourseId(courseId, includePrivate = false) {
  const pool = getPool();
  let query = `
    SELECT 
      id, course_id, title, material_type, file_path,
      file_type, file_size_bytes, is_preview, requires_enrollment,
      display_order, uploaded_by, created_at, updated_at
    FROM course_materials
    WHERE course_id = ?
  `;

  const params = [courseId];

  if (!includePrivate) {
    query += ' AND (requires_enrollment = 0 OR is_preview = 1)';
  }

  query += ' ORDER BY display_order ASC, id ASC';

  const [rows] = await pool.query(query, params);
  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    title: r.title,
    material_type: r.material_type,
    file_path: r.file_path,
    file_type: r.file_type,
    file_size_bytes: Number(r.file_size_bytes),
    is_preview: Boolean(r.is_preview),
    requires_enrollment: Boolean(r.requires_enrollment),
    display_order: Number(r.display_order),
    uploaded_by: r.uploaded_by ? Number(r.uploaded_by) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function findMaterialById(materialId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      id, course_id, title, material_type, file_path,
      file_type, file_size_bytes, is_preview, requires_enrollment,
      display_order, uploaded_by, created_at, updated_at
    FROM course_materials
    WHERE id = ?`,
    [materialId]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    title: r.title,
    material_type: r.material_type,
    file_path: r.file_path,
    file_type: r.file_type,
    file_size_bytes: Number(r.file_size_bytes),
    is_preview: Boolean(r.is_preview),
    requires_enrollment: Boolean(r.requires_enrollment),
    display_order: Number(r.display_order),
    uploaded_by: r.uploaded_by ? Number(r.uploaded_by) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function checkUserActiveEnrollment(userId, courseId) {
  if (!userId || !courseId) return false;
  const pool = getPool();

  const [rows] = await pool.query(
    `SELECT id
     FROM course_enrollments
     WHERE user_id = ?
       AND course_id = ?
       AND enrollment_status = 'active'
       AND (access_expires_at IS NULL OR access_expires_at > NOW())
     LIMIT 1`,
    [userId, courseId]
  );

  return rows.length > 0;
}

export async function createMaterial(courseId, data, uploadedBy) {
  const pool = getPool();

  const [result] = await pool.query(
    `INSERT INTO course_materials (
      course_id, title, material_type, file_path, file_type,
      file_size_bytes, is_preview, requires_enrollment, display_order, uploaded_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      data.title,
      data.material_type,
      data.file_path,
      data.file_type || null,
      data.file_size_bytes || 0,
      data.is_preview ? 1 : 0,
      data.requires_enrollment !== undefined ? (data.requires_enrollment ? 1 : 0) : 1,
      data.display_order || 0,
      uploadedBy || null,
    ]
  );

  return findMaterialById(result.insertId);
}

export async function updateMaterial(materialId, data) {
  const pool = getPool();
  const current = await findMaterialById(materialId);
  if (!current) return null;

  const fields = [];
  const params = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    params.push(data.title);
  }
  if (data.material_type !== undefined) {
    fields.push('material_type = ?');
    params.push(data.material_type);
  }
  if (data.file_path !== undefined) {
    fields.push('file_path = ?');
    params.push(data.file_path);
  }
  if (data.file_type !== undefined) {
    fields.push('file_type = ?');
    params.push(data.file_type);
  }
  if (data.file_size_bytes !== undefined) {
    fields.push('file_size_bytes = ?');
    params.push(data.file_size_bytes);
  }
  if (data.is_preview !== undefined) {
    fields.push('is_preview = ?');
    params.push(data.is_preview ? 1 : 0);
  }
  if (data.requires_enrollment !== undefined) {
    fields.push('requires_enrollment = ?');
    params.push(data.requires_enrollment ? 1 : 0);
  }
  if (data.display_order !== undefined) {
    fields.push('display_order = ?');
    params.push(data.display_order);
  }

  if (fields.length === 0) return current;

  fields.push('updated_at = NOW()');
  params.push(materialId);

  await pool.query(
    `UPDATE course_materials SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findMaterialById(materialId);
}

export async function deleteMaterial(materialId) {
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM course_materials WHERE id = ?',
    [materialId]
  );
  return result.affectedRows > 0;
}

export default {
  findCourseByIdOrSlug,
  findMaterialsByCourseId,
  findMaterialById,
  checkUserActiveEnrollment,
  createMaterial,
  updateMaterial,
  deleteMaterial,
};
