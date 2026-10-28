import { getPool } from '../../config/db.js';

export async function findUpcomingBatches(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, batch_name, start_date, end_date,
      class_days, class_timing, total_seats, seats_available,
      enrollment_deadline, location, status
    FROM course_batches
    WHERE course_id = ? AND start_date >= CURDATE() AND status = 'open'
    ORDER BY start_date ASC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    batch_name: r.batch_name,
    start_date: r.start_date,
    end_date: r.end_date,
    class_days: r.class_days,
    class_timing: r.class_timing,
    total_seats: Number(r.total_seats),
    seats_available: Number(r.seats_available),
    enrollment_deadline: r.enrollment_deadline,
    location: r.location,
    status: r.status,
  }));
}

export async function findAllBatchesAdmin(courseId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, batch_name, start_date, end_date,
      class_days, class_timing, total_seats, seats_available,
      enrollment_deadline, location, status, created_at, updated_at
    FROM course_batches
    WHERE course_id = ?
    ORDER BY start_date DESC
  `, [courseId]);

  return rows.map(r => ({
    id: Number(r.id),
    course_id: Number(r.course_id),
    batch_name: r.batch_name,
    start_date: r.start_date,
    end_date: r.end_date,
    class_days: r.class_days,
    class_timing: r.class_timing,
    total_seats: Number(r.total_seats),
    seats_available: Number(r.seats_available),
    enrollment_deadline: r.enrollment_deadline,
    location: r.location,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function findBatchById(batchId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      id, course_id, batch_name, start_date, end_date,
      class_days, class_timing, total_seats, seats_available,
      enrollment_deadline, location, status, created_at, updated_at
    FROM course_batches
    WHERE id = ?
  `, [batchId]);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    course_id: Number(r.course_id),
    batch_name: r.batch_name,
    start_date: r.start_date,
    end_date: r.end_date,
    class_days: r.class_days,
    class_timing: r.class_timing,
    total_seats: Number(r.total_seats),
    seats_available: Number(r.seats_available),
    enrollment_deadline: r.enrollment_deadline,
    location: r.location,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function countActiveEnrollments(batchId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT COUNT(*) AS count
    FROM course_enrollments
    WHERE batch_id = ? AND enrollment_status = 'active'
  `, [batchId]);

  return Number(rows[0]?.count || 0);
}

export async function createBatch(courseId, data) {
  const pool = getPool();
  const seatsAvailable = data.total_seats;
  const status = seatsAvailable <= 0 ? 'full' : (data.status || 'open');

  const [result] = await pool.query(`
    INSERT INTO course_batches (
      course_id, batch_name, start_date, end_date,
      class_days, class_timing, total_seats, seats_available,
      enrollment_deadline, location, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    courseId,
    data.batch_name,
    data.start_date,
    data.end_date || null,
    data.class_days || null,
    data.class_timing || null,
    data.total_seats,
    seatsAvailable,
    data.enrollment_deadline || null,
    data.location || null,
    status,
  ]);

  return findBatchById(result.insertId);
}

export async function updateBatch(batchId, data) {
  const pool = getPool();
  const current = await findBatchById(batchId);
  if (!current) return null;

  const activeEnrollments = await countActiveEnrollments(batchId);

  let newTotalSeats = current.total_seats;
  if (data.total_seats !== undefined) {
    newTotalSeats = data.total_seats;
  }

  const seatsAvailable = Math.max(newTotalSeats - activeEnrollments, 0);

  let newStatus = data.status || current.status;
  if (seatsAvailable <= 0 && newStatus === 'open') {
    newStatus = 'full';
  }

  const fields = [
    'batch_name = ?',
    'start_date = ?',
    'end_date = ?',
    'class_days = ?',
    'class_timing = ?',
    'total_seats = ?',
    'seats_available = ?',
    'enrollment_deadline = ?',
    'location = ?',
    'status = ?',
    'updated_at = NOW()',
  ];

  const params = [
    data.batch_name !== undefined ? data.batch_name : current.batch_name,
    data.start_date !== undefined ? data.start_date : current.start_date,
    data.end_date !== undefined ? data.end_date : current.end_date,
    data.class_days !== undefined ? data.class_days : current.class_days,
    data.class_timing !== undefined ? data.class_timing : current.class_timing,
    newTotalSeats,
    seatsAvailable,
    data.enrollment_deadline !== undefined ? data.enrollment_deadline : current.enrollment_deadline,
    data.location !== undefined ? data.location : current.location,
    newStatus,
    batchId,
  ];

  await pool.query(`
    UPDATE course_batches
    SET ${fields.join(', ')}
    WHERE id = ?
  `, params);

  return findBatchById(batchId);
}

export async function deleteBatch(batchId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM course_batches WHERE id = ?', [batchId]);
  return result.affectedRows > 0;
}
