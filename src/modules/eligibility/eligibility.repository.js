import { getPool } from '../../config/db.js';

function parseJson(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function stringifyJson(val) {
  if (val === null || val === undefined) return null;
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
}

/**
 * Fetch course basic metadata
 */
export async function findCourseById(courseId) {
  if (!courseId || isNaN(courseId)) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, course_name, slug, status, deleted_at FROM courses WHERE id = ?',
    [courseId]
  );
  if (rows.length === 0) return null;
  return {
    id: Number(rows[0].id),
    course_name: rows[0].course_name,
    slug: rows[0].slug,
    status: rows[0].status,
    deleted_at: rows[0].deleted_at,
  };
}

/**
 * Fetch eligibility rules for a course
 */
export async function findEligibilityRulesByCourseId(courseId) {
  if (!courseId || isNaN(courseId)) return null;
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM course_eligibility_rules WHERE course_id = ?`,
    [courseId]
  );
  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    eligibility_enabled: Boolean(r.eligibility_enabled),
    minimum_qualification: r.minimum_qualification || null,
    minimum_percentage: r.minimum_percentage !== null ? Number(r.minimum_percentage) : null,
    eligible_streams: parseJson(r.eligible_streams, []),
    minimum_age: r.minimum_age !== null ? Number(r.minimum_age) : null,
    maximum_age: r.maximum_age !== null ? Number(r.maximum_age) : null,
    required_skills: parseJson(r.required_skills, []),
    experience_required: r.experience_required || null,
    custom_questions: parseJson(r.custom_questions, []),
    disclaimer: r.disclaimer || null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * Upsert eligibility rules for a course
 */
export async function upsertEligibilityRules(courseId, data) {
  const pool = getPool();
  const streamsJson = stringifyJson(data.eligible_streams || []);
  const skillsJson = stringifyJson(data.required_skills || []);
  const questionsJson = stringifyJson(data.custom_questions || []);

  const [result] = await pool.query(
    `INSERT INTO course_eligibility_rules (
      course_id, eligibility_enabled, minimum_qualification, minimum_percentage,
      eligible_streams, minimum_age, maximum_age, required_skills,
      experience_required, custom_questions, disclaimer
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      eligibility_enabled = VALUES(eligibility_enabled),
      minimum_qualification = VALUES(minimum_qualification),
      minimum_percentage = VALUES(minimum_percentage),
      eligible_streams = VALUES(eligible_streams),
      minimum_age = VALUES(minimum_age),
      maximum_age = VALUES(maximum_age),
      required_skills = VALUES(required_skills),
      experience_required = VALUES(experience_required),
      custom_questions = VALUES(custom_questions),
      disclaimer = VALUES(disclaimer),
      updated_at = NOW()`,
    [
      courseId,
      data.eligibility_enabled ? 1 : 0,
      data.minimum_qualification || null,
      data.minimum_percentage !== undefined && data.minimum_percentage !== null ? data.minimum_percentage : null,
      streamsJson,
      data.minimum_age !== undefined && data.minimum_age !== null ? data.minimum_age : null,
      data.maximum_age !== undefined && data.maximum_age !== null ? data.maximum_age : null,
      skillsJson,
      data.experience_required || null,
      questionsJson,
      data.disclaimer || null,
    ]
  );

  return findEligibilityRulesByCourseId(courseId);
}

/**
 * Record a student eligibility check attempt
 */
export async function createEligibilityCheck({ userId, courseId, answers, result, message }) {
  const pool = getPool();
  const answersJson = stringifyJson(answers);

  const [res] = await pool.query(
    `INSERT INTO eligibility_checks (
      user_id, course_id, answers, result, message, checked_at
    ) VALUES (?, ?, ?, ?, ?, NOW())`,
    [userId, courseId, answersJson, result, message]
  );

  const [rows] = await pool.query(
    'SELECT * FROM eligibility_checks WHERE id = ?',
    [res.insertId]
  );
  const r = rows[0];
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    course_id: Number(r.course_id),
    answers: parseJson(r.answers, {}),
    result: r.result,
    message: r.message,
    checked_at: r.checked_at,
  };
}

/**
 * Fetch latest eligibility check for user & course
 */
export async function findLatestEligibilityCheck(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM eligibility_checks
     WHERE user_id = ? AND course_id = ?
     ORDER BY checked_at DESC, id DESC
     LIMIT 1`,
    [userId, courseId]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    course_id: Number(r.course_id),
    answers: parseJson(r.answers, {}),
    result: r.result,
    message: r.message,
    checked_at: r.checked_at,
  };
}

/**
 * List paginated eligibility checks for a course (Admin)
 */
export async function findFilteredEligibilityChecks(courseId, { page = 1, limit = 20, result = null }) {
  const pool = getPool();
  const conditions = ['ec.course_id = ?'];
  const params = [courseId];

  if (result) {
    conditions.push('ec.result = ?');
    params.push(result);
  }

  const whereClause = conditions.join(' AND ');

  // Count total
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM eligibility_checks ec WHERE ${whereClause}`,
    params
  );
  const total = countRows[0]?.total || 0;
  const offset = (page - 1) * limit;

  // Fetch paginated rows with user name and email
  const [rows] = await pool.query(
    `SELECT 
      ec.id, ec.user_id, ec.course_id, ec.answers, ec.result, ec.message, ec.checked_at,
      u.name AS student_name, u.email AS student_email, u.avatar_url AS student_avatar_url
     FROM eligibility_checks ec
     LEFT JOIN users u ON u.id = ec.user_id
     WHERE ${whereClause}
     ORDER BY ec.checked_at DESC, ec.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const checks = rows.map((r) => ({
    id: Number(r.id),
    user_id: Number(r.user_id),
    student_name: r.student_name || null,
    student_email: r.student_email || null,
    student_avatar_url: r.student_avatar_url || null,
    course_id: Number(r.course_id),
    answers: parseJson(r.answers, {}),
    result: r.result,
    message: r.message,
    checked_at: r.checked_at,
  }));

  return {
    checks,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

export default {
  findCourseById,
  findEligibilityRulesByCourseId,
  upsertEligibilityRules,
  createEligibilityCheck,
  findLatestEligibilityCheck,
  findFilteredEligibilityChecks,
};
