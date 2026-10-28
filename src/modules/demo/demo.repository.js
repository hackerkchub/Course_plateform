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

function formatSqlDatetime(dt) {
  if (!dt) return null;
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function formatSqlDate(dVal) {
  if (!dVal) return null;
  const d = new Date(dVal);
  if (isNaN(d.getTime())) return dVal;
  return d.toISOString().slice(0, 10);
}

export async function findCourseById(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, course_name, slug, status, deleted_at, demo_request_count FROM courses WHERE id = ?',
    [courseId]
  );
  return rows[0] || null;
}

export async function findDemoSettingsByCourseId(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM course_demo_settings WHERE course_id = ?',
    [courseId]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    demo_enabled: Boolean(r.demo_enabled),
    demo_request_enabled: Boolean(r.demo_request_enabled),
    demo_type: r.demo_type,
    demo_duration_minutes: Number(r.demo_duration_minutes),
    demo_schedule: r.demo_schedule,
    time_slots: parseJson(r.time_slots, []),
    accepting_requests: Boolean(r.accepting_requests),
    request_start_at: r.request_start_at,
    request_end_at: r.request_end_at,
    max_requests_per_slot: Number(r.max_requests_per_slot),
    allowed_demo_types: parseJson(r.allowed_demo_types, ['live', 'recorded']),
    meeting_platform: r.meeting_platform,
    requires_approval: Boolean(r.requires_approval),
    form_title: r.form_title,
    submit_button_text: r.submit_button_text,
    success_message: r.success_message,
    form_fields: parseJson(r.form_fields, []),
    custom_questions: parseJson(r.custom_questions, []),
    honeypot_enabled: Boolean(r.honeypot_enabled),
    rate_limit_per_hour: Number(r.rate_limit_per_hour),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function upsertDemoSettings(courseId, data) {
  const pool = getPool();
  const timeSlotsJson = data.time_slots ? JSON.stringify(data.time_slots) : null;
  const allowedTypesJson = data.allowed_demo_types ? JSON.stringify(data.allowed_demo_types) : null;
  const formFieldsJson = data.form_fields ? JSON.stringify(data.form_fields) : null;
  const customQuestionsJson = data.custom_questions ? JSON.stringify(data.custom_questions) : null;

  await pool.query(
    `INSERT INTO course_demo_settings (
      course_id, demo_enabled, demo_request_enabled, demo_type,
      demo_duration_minutes, demo_schedule, time_slots, accepting_requests,
      request_start_at, request_end_at, max_requests_per_slot, allowed_demo_types,
      meeting_platform, requires_approval, form_title, submit_button_text,
      success_message, form_fields, custom_questions, honeypot_enabled,
      rate_limit_per_hour
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      demo_enabled = VALUES(demo_enabled),
      demo_request_enabled = VALUES(demo_request_enabled),
      demo_type = VALUES(demo_type),
      demo_duration_minutes = VALUES(demo_duration_minutes),
      demo_schedule = VALUES(demo_schedule),
      time_slots = VALUES(time_slots),
      accepting_requests = VALUES(accepting_requests),
      request_start_at = VALUES(request_start_at),
      request_end_at = VALUES(request_end_at),
      max_requests_per_slot = VALUES(max_requests_per_slot),
      allowed_demo_types = VALUES(allowed_demo_types),
      meeting_platform = VALUES(meeting_platform),
      requires_approval = VALUES(requires_approval),
      form_title = VALUES(form_title),
      submit_button_text = VALUES(submit_button_text),
      success_message = VALUES(success_message),
      form_fields = VALUES(form_fields),
      custom_questions = VALUES(custom_questions),
      honeypot_enabled = VALUES(honeypot_enabled),
      rate_limit_per_hour = VALUES(rate_limit_per_hour),
      updated_at = NOW()`,
    [
      courseId,
      data.demo_enabled ? 1 : 0,
      data.demo_request_enabled ? 1 : 0,
      data.demo_type || null,
      data.demo_duration_minutes || 45,
      formatSqlDatetime(data.demo_schedule),
      timeSlotsJson,
      data.accepting_requests ? 1 : 0,
      formatSqlDatetime(data.request_start_at),
      formatSqlDatetime(data.request_end_at),
      data.max_requests_per_slot || 10,
      allowedTypesJson,
      data.meeting_platform || null,
      data.requires_approval ? 1 : 0,
      data.form_title || null,
      data.submit_button_text || null,
      data.success_message || null,
      formFieldsJson,
      customQuestionsJson,
      data.honeypot_enabled ? 1 : 0,
      data.rate_limit_per_hour || 5,
    ]
  );

  return findDemoSettingsByCourseId(courseId);
}

export async function countDemoRequestsByIpInPastHour(ipAddress) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM demo_requests
     WHERE ip_address = ?
       AND created_at >= NOW() - INTERVAL 1 HOUR`,
    [ipAddress]
  );
  return Number(rows[0]?.count || 0);
}

export async function countSlotBookings(courseId, date, time) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM demo_requests
     WHERE course_id = ?
       AND preferred_date = ?
       AND preferred_time = ?
       AND status IN ('pending', 'contacted', 'scheduled')
       AND deleted_at IS NULL`,
    [courseId, date, time]
  );
  return Number(rows[0]?.count || 0);
}

export async function findExistingActiveDemoRequest(courseId, userId, phone) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, reference_no, status
     FROM demo_requests
     WHERE course_id = ?
       AND (user_id = ? OR phone = ?)
       AND status IN ('pending', 'contacted', 'scheduled')
       AND deleted_at IS NULL
     LIMIT 1`,
    [courseId, userId, phone]
  );
  return rows[0] || null;
}

export async function createDemoRequest(data) {
  const pool = getPool();
  const customAnswersJson = data.custom_answers ? JSON.stringify(data.custom_answers) : null;

  const [result] = await pool.query(
    `INSERT INTO demo_requests (
      reference_no, course_id, user_id, student_name, email, phone,
      city, current_qualification, experience_level, preferred_demo_type,
      preferred_date, preferred_time, message, custom_answers, consent_given,
      consent_at, source, utm_source, utm_medium, utm_campaign, ip_address, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, ?, ?, ?, 'pending')`,
    [
      data.reference_no,
      data.course_id,
      data.user_id,
      data.student_name,
      data.email,
      data.phone,
      data.city || null,
      data.current_qualification || null,
      data.experience_level || null,
      data.preferred_demo_type,
      formatSqlDate(data.preferred_date),
      data.preferred_time || null,
      data.message || null,
      customAnswersJson,
      data.source || null,
      data.utm_source || null,
      data.utm_medium || null,
      data.utm_campaign || null,
      data.ip_address || null,
    ]
  );

  // Increment course demo_request_count
  await pool.query(
    'UPDATE courses SET demo_request_count = demo_request_count + 1 WHERE id = ?',
    [data.course_id]
  );

  return findDemoRequestById(result.insertId);
}

export async function findDemoRequestById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      dr.*,
      c.course_name, c.slug AS course_slug, c.thumbnail_url AS course_thumbnail_url,
      u.name AS student_user_name,
      au.name AS assigned_user_name
     FROM demo_requests dr
     JOIN courses c ON c.id = dr.course_id
     LEFT JOIN users u ON u.id = dr.user_id
     LEFT JOIN users au ON au.id = dr.assigned_to
     WHERE dr.id = ? AND dr.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    reference_no: r.reference_no,
    course_id: Number(r.course_id),
    course_name: r.course_name,
    course_slug: r.course_slug,
    course_thumbnail_url: r.course_thumbnail_url,
    user_id: Number(r.user_id),
    student_name: r.student_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    current_qualification: r.current_qualification,
    experience_level: r.experience_level,
    preferred_demo_type: r.preferred_demo_type,
    preferred_date: r.preferred_date,
    preferred_time: r.preferred_time,
    message: r.message,
    custom_answers: parseJson(r.custom_answers, {}),
    consent_given: Boolean(r.consent_given),
    consent_at: r.consent_at,
    source: r.source,
    utm_source: r.utm_source,
    utm_medium: r.utm_medium,
    utm_campaign: r.utm_campaign,
    ip_address: r.ip_address,
    status: r.status,
    assigned_to: r.assigned_to ? Number(r.assigned_to) : null,
    assigned_user_name: r.assigned_user_name || null,
    admin_notes: r.admin_notes,
    scheduled_at: r.scheduled_at,
    meeting_link: r.meeting_link,
    attended: r.attended !== null ? Boolean(r.attended) : null,
    completed_at: r.completed_at,
    follow_up_at: r.follow_up_at,
    converted_to_enrollment: Boolean(r.converted_to_enrollment),
    enrollment_id: r.enrollment_id ? Number(r.enrollment_id) : null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function findDemoRequestsByUserId(userId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      dr.id, dr.reference_no, dr.course_id, c.course_name, c.slug AS course_slug,
      c.thumbnail_url, dr.preferred_demo_type, dr.preferred_date, dr.preferred_time,
      dr.status, dr.scheduled_at, dr.meeting_link, dr.created_at
     FROM demo_requests dr
     JOIN courses c ON c.id = dr.course_id
     WHERE dr.user_id = ? AND dr.deleted_at IS NULL
     ORDER BY dr.created_at DESC`,
    [userId]
  );

  return rows.map(r => ({
    id: Number(r.id),
    reference_no: r.reference_no,
    course_id: Number(r.course_id),
    course_name: r.course_name,
    course_slug: r.course_slug,
    thumbnail_url: r.thumbnail_url,
    preferred_demo_type: r.preferred_demo_type,
    preferred_date: r.preferred_date,
    preferred_time: r.preferred_time,
    status: r.status,
    scheduled_at: r.scheduled_at,
    meeting_link: r.meeting_link,
    created_at: r.created_at,
  }));
}

export async function updateDemoRequest(id, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
    if (data.status === 'completed') {
      fields.push('completed_at = NOW()');
    }
  }
  if (data.assigned_to !== undefined) {
    fields.push('assigned_to = ?');
    params.push(data.assigned_to);
  }
  if (data.scheduled_at !== undefined) {
    fields.push('scheduled_at = ?');
    params.push(formatSqlDatetime(data.scheduled_at));
  }
  if (data.meeting_link !== undefined) {
    fields.push('meeting_link = ?');
    params.push(data.meeting_link);
  }
  if (data.admin_notes !== undefined) {
    fields.push('admin_notes = ?');
    params.push(data.admin_notes);
  }
  if (data.follow_up_at !== undefined) {
    fields.push('follow_up_at = ?');
    params.push(formatSqlDatetime(data.follow_up_at));
  }
  if (data.attended !== undefined) {
    fields.push('attended = ?');
    params.push(data.attended ? 1 : 0);
  }
  if (data.converted_to_enrollment !== undefined) {
    fields.push('converted_to_enrollment = ?');
    params.push(data.converted_to_enrollment ? 1 : 0);
  }
  if (data.enrollment_id !== undefined) {
    fields.push('enrollment_id = ?');
    params.push(data.enrollment_id);
  }

  if (fields.length === 0) return findDemoRequestById(id);

  fields.push('updated_at = NOW()');
  params.push(id);

  await pool.query(
    `UPDATE demo_requests SET ${fields.join(', ')} WHERE id = ?`,
    params
  );

  return findDemoRequestById(id);
}

export async function softDeleteDemoRequest(id) {
  const pool = getPool();
  const [result] = await pool.query(
    'UPDATE demo_requests SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

export async function createActivityLog({ demoRequestId, action, oldStatus = null, newStatus = null, note = null, performedBy = null }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO demo_request_activity_log (
      demo_request_id, action, old_status, new_status, note, performed_by
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [demoRequestId, action, oldStatus, newStatus, note, performedBy]
  );
  return result.insertId;
}

export async function getActivityLogsByRequestId(demoRequestId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT 
      al.id, al.demo_request_id, al.action, al.old_status, al.new_status,
      al.note, al.performed_by, u.name AS performed_by_name, al.created_at
     FROM demo_request_activity_log al
     LEFT JOIN users u ON u.id = al.performed_by
     WHERE al.demo_request_id = ?
     ORDER BY al.id ASC`,
    [demoRequestId]
  );

  return rows.map(r => ({
    id: Number(r.id),
    demo_request_id: Number(r.demo_request_id),
    action: r.action,
    old_status: r.old_status,
    new_status: r.new_status,
    note: r.note,
    performed_by: r.performed_by ? Number(r.performed_by) : null,
    performed_by_name: r.performed_by_name || null,
    created_at: r.created_at,
  }));
}

export async function getDemoRequestsSummary(courseId = null) {
  const pool = getPool();
  let query = `
    SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM demo_requests
    WHERE deleted_at IS NULL
  `;
  const params = [];
  if (courseId) {
    query += ' AND course_id = ?';
    params.push(courseId);
  }

  const [rows] = await pool.query(query, params);
  const r = rows[0] || {};
  return {
    total: Number(r.total || 0),
    pending: Number(r.pending || 0),
    contacted: Number(r.contacted || 0),
    scheduled: Number(r.scheduled || 0),
    completed: Number(r.completed || 0),
    cancelled: Number(r.cancelled || 0),
  };
}

export async function findFilteredDemoRequests(filters = {}) {
  const pool = getPool();
  const conditions = ['dr.deleted_at IS NULL'];
  const params = [];

  if (filters.course_id) {
    conditions.push('dr.course_id = ?');
    params.push(filters.course_id);
  }
  if (filters.status) {
    conditions.push('dr.status = ?');
    params.push(filters.status);
  }
  if (filters.demo_type) {
    conditions.push('dr.preferred_demo_type = ?');
    params.push(filters.demo_type);
  }
  if (filters.assigned_to) {
    conditions.push('dr.assigned_to = ?');
    params.push(filters.assigned_to);
  }
  if (filters.source) {
    conditions.push('dr.source = ?');
    params.push(filters.source);
  }
  if (filters.from_date) {
    conditions.push('dr.created_at >= ?');
    params.push(formatSqlDatetime(filters.from_date));
  }
  if (filters.to_date) {
    conditions.push('dr.created_at <= ?');
    params.push(formatSqlDatetime(filters.to_date));
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push('(dr.student_name LIKE ? OR dr.phone LIKE ? OR dr.email LIKE ? OR dr.reference_no LIKE ?)');
    params.push(s, s, s, s);
  }

  const whereClause = conditions.join(' AND ');

  // Count total matching
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM demo_requests dr WHERE ${whereClause}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  // Sort support
  let orderBy = 'ORDER BY dr.created_at DESC';
  if (filters.sort === 'oldest' || filters.sort === 'created_at_asc') {
    orderBy = 'ORDER BY dr.created_at ASC';
  } else if (filters.sort === 'name_asc') {
    orderBy = 'ORDER BY dr.student_name ASC';
  } else if (filters.sort === 'name_desc') {
    orderBy = 'ORDER BY dr.student_name DESC';
  } else if (filters.sort === 'status') {
    orderBy = 'ORDER BY dr.status ASC';
  }

  // Fetch paginated rows
  const [rows] = await pool.query(
    `SELECT 
      dr.*,
      c.course_name, c.slug AS course_slug,
      au.name AS assigned_user_name
     FROM demo_requests dr
     JOIN courses c ON c.id = dr.course_id
     LEFT JOIN users au ON au.id = dr.assigned_to
     WHERE ${whereClause}
     ${orderBy}
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const requests = rows.map(r => ({
    id: Number(r.id),
    reference_no: r.reference_no,
    course_id: Number(r.course_id),
    course_name: r.course_name,
    student_name: r.student_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    current_qualification: r.current_qualification,
    experience_level: r.experience_level,
    preferred_demo_type: r.preferred_demo_type,
    preferred_date: r.preferred_date,
    preferred_time: r.preferred_time,
    message: r.message,
    custom_answers: parseJson(r.custom_answers, {}),
    consent_given: Boolean(r.consent_given),
    source: r.source,
    status: r.status,
    assigned_to: r.assigned_to ? Number(r.assigned_to) : null,
    assigned_user_name: r.assigned_user_name || null,
    admin_notes: r.admin_notes,
    scheduled_at: r.scheduled_at,
    meeting_link: r.meeting_link,
    attended: r.attended !== null ? Boolean(r.attended) : null,
    follow_up_at: r.follow_up_at,
    converted_to_enrollment: Boolean(r.converted_to_enrollment),
    created_at: r.created_at,
  }));

  const summary = await getDemoRequestsSummary(filters.course_id || null);

  return {
    summary,
    requests,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function findEnrollmentByUserAndCourse(userId, courseId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, enrollment_status FROM course_enrollments WHERE user_id = ? AND course_id = ?',
    [userId, courseId]
  );
  return rows[0] || null;
}

export async function createEnrollmentFromDemo(demoRequestId, courseId, userId, batchId = null, accessExpiresAt = null) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock demo_requests row to prevent concurrent conversions
    const [demoRows] = await connection.query(
      'SELECT id, converted_to_enrollment FROM demo_requests WHERE id = ? FOR UPDATE',
      [demoRequestId]
    );
    if (demoRows.length === 0) {
      const err = new Error('Demo request not found');
      err.statusCode = 404;
      throw err;
    }
    if (demoRows[0].converted_to_enrollment) {
      const err = new Error('Demo request is already converted to an enrollment');
      err.statusCode = 400;
      throw err;
    }

    // 2. Lock and check existing enrollment
    const [existing] = await connection.query(
      'SELECT id FROM course_enrollments WHERE user_id = ? AND course_id = ? FOR UPDATE',
      [userId, courseId]
    );
    if (existing.length > 0) {
      const err = new Error('Student is already enrolled in this course');
      err.statusCode = 400;
      throw err;
    }

    // 3. If batchId is supplied, lock and verify batch within the transaction
    if (batchId) {
      const [batchRows] = await connection.query(
        `SELECT id, seats_available, status, enrollment_deadline 
         FROM course_batches 
         WHERE id = ? AND course_id = ? 
         FOR UPDATE`,
        [batchId, courseId]
      );
      if (batchRows.length === 0) {
        const err = new Error('Selected batch does not exist for this course');
        err.statusCode = 400;
        throw err;
      }
      const batch = batchRows[0];
      if (batch.status !== 'open') {
        const err = new Error(`Cannot enroll into ${batch.status} batch`);
        err.statusCode = 400;
        throw err;
      }
      if (Number(batch.seats_available) <= 0) {
        const err = new Error('Selected batch is fully booked (0 seats available)');
        err.statusCode = 409;
        throw err;
      }

      // Decrement batch seats
      await connection.query(
        `UPDATE course_batches SET seats_available = seats_available - 1, updated_at = NOW() WHERE id = ?`,
        [batchId]
      );
    }

    const [result] = await connection.query(
      `INSERT INTO course_enrollments (
        user_id, course_id, batch_id, enrollment_source, enrollment_status,
        enrolled_at, access_expires_at
      ) VALUES (?, ?, ?, 'demo_convert', 'active', NOW(), ?)`,
      [userId, courseId, batchId || null, formatSqlDatetime(accessExpiresAt)]
    );

    const enrollmentId = result.insertId;

    await connection.query(
      `UPDATE demo_requests
       SET converted_to_enrollment = 1,
           enrollment_id = ?,
           status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = ?`,
      [enrollmentId, demoRequestId]
    );

    await connection.query(
      `UPDATE courses SET enrollment_count = enrollment_count + 1, updated_at = NOW() WHERE id = ?`,
      [courseId]
    );

    await connection.commit();
    return enrollmentId;

  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY' && (err.message?.includes('uq_enrollments_user_course') || err.sqlMessage?.includes('uq_enrollments_user_course'))) {
      const dupErr = new Error('Student is already enrolled in this course');
      dupErr.statusCode = 400;
      throw dupErr;
    }
    throw err;
  } finally {
    connection.release();
  }
}

export async function createDemoRequestTransaction({ requestData, activityLogData, notificationData }) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Lock course_demo_settings row for concurrency serialization
    const [settingsRows] = await connection.query(
      'SELECT id, max_requests_per_slot, accepting_requests, request_start_at, request_end_at, rate_limit_per_hour FROM course_demo_settings WHERE course_id = ? FOR UPDATE',
      [requestData.course_id]
    );

    // 2. Lock check for active duplicate
    const [duplicateRows] = await connection.query(
      `SELECT id FROM demo_requests
       WHERE course_id = ?
         AND (user_id = ? OR phone = ?)
         AND status IN ('pending', 'contacted', 'scheduled')
         AND deleted_at IS NULL
       LIMIT 1
       FOR UPDATE`,
      [requestData.course_id, requestData.user_id, requestData.phone]
    );
    if (duplicateRows.length > 0) {
      const err = new Error('You already have an active demo request for this course');
      err.statusCode = 409;
      throw err;
    }

    // 3. Slot capacity check under lock
    if (requestData.preferred_date && requestData.preferred_time) {
      const [slotRows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM demo_requests
         WHERE course_id = ?
           AND preferred_date = ?
           AND preferred_time = ?
           AND status IN ('pending', 'contacted', 'scheduled')
           AND deleted_at IS NULL
         FOR UPDATE`,
        [requestData.course_id, formatSqlDate(requestData.preferred_date), requestData.preferred_time]
      );
      const bookedCount = Number(slotRows[0]?.count || 0);
      const maxRequests = settingsRows[0] ? Number(settingsRows[0].max_requests_per_slot) : 10;
      if (bookedCount >= maxRequests) {
        const err = new Error('Selected time slot is fully booked. Please choose another date or time');
        err.statusCode = 400;
        throw err;
      }
    }

    // 4. Insert demo request
    const customAnswersJson = requestData.custom_answers ? JSON.stringify(requestData.custom_answers) : null;
    const [result] = await connection.query(
      `INSERT INTO demo_requests (
        reference_no, course_id, user_id, student_name, email, phone,
        city, current_qualification, experience_level, preferred_demo_type,
        preferred_date, preferred_time, message, custom_answers, consent_given,
        consent_at, source, utm_source, utm_medium, utm_campaign, ip_address, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), ?, ?, ?, ?, ?, 'pending')`,
      [
        requestData.reference_no,
        requestData.course_id,
        requestData.user_id,
        requestData.student_name,
        requestData.email,
        requestData.phone,
        requestData.city || null,
        requestData.current_qualification || null,
        requestData.experience_level || null,
        requestData.preferred_demo_type,
        formatSqlDate(requestData.preferred_date),
        requestData.preferred_time || null,
        requestData.message || null,
        customAnswersJson,
        requestData.source || null,
        requestData.utm_source || null,
        requestData.utm_medium || null,
        requestData.utm_campaign || null,
        requestData.ip_address || null,
      ]
    );
    const newId = result.insertId;

    // 5. Increment course demo_request_count
    await connection.query(
      'UPDATE courses SET demo_request_count = demo_request_count + 1 WHERE id = ?',
      [requestData.course_id]
    );

    // 6. Insert activity log
    await connection.query(
      `INSERT INTO demo_request_activity_log (
        demo_request_id, action, old_status, new_status, note, performed_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        newId,
        activityLogData.action || 'submitted',
        activityLogData.old_status || null,
        activityLogData.new_status || 'pending',
        activityLogData.note || 'Demo request submitted by student',
        activityLogData.performed_by || requestData.user_id,
      ]
    );

    // 7. Insert queued notification
    const payloadJson = typeof notificationData.payload === 'object'
      ? JSON.stringify(notificationData.payload)
      : String(notificationData.payload);
    await connection.query(
      `INSERT INTO notifications (user_id, type, channel, recipient, payload, status)
       VALUES (?, ?, ?, ?, ?, 'queued')`,
      [
        notificationData.user_id || null,
        notificationData.type || 'demo_request_received',
        notificationData.channel || 'inapp',
        notificationData.recipient || 'admin',
        payloadJson,
      ]
    );

    await connection.commit();

    return {
      id: newId,
      reference_no: requestData.reference_no,
      course_id: Number(requestData.course_id),
      status: 'pending',
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function queueNotification({ userId = null, type, channel = 'inapp', recipient = null, payload }) {
  const pool = getPool();
  const payloadJson = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
  const targetRecipient = recipient || (userId ? `user_${userId}` : 'admin');

  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, type, channel, recipient, payload, status)
     VALUES (?, ?, ?, ?, ?, 'queued')`,
    [userId, type, channel, targetRecipient, payloadJson]
  );

  return result.insertId;
}

export default {
  findCourseById,
  findDemoSettingsByCourseId,
  upsertDemoSettings,
  countDemoRequestsByIpInPastHour,
  countSlotBookings,
  findExistingActiveDemoRequest,
  createDemoRequest,
  findDemoRequestById,
  findDemoRequestsByUserId,
  updateDemoRequest,
  softDeleteDemoRequest,
  createActivityLog,
  getActivityLogsByRequestId,
  getDemoRequestsSummary,
  findFilteredDemoRequests,
  createEnrollmentFromDemo,
  findEnrollmentByUserAndCourse,
  createDemoRequestTransaction,
  queueNotification,
};
