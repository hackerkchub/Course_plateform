import { getPool } from '../../config/db.js';
import { recordAuditLog } from '../../utils/auditLogger.js';
import {
  findCourseForEnrollment,
  findBatchForEnrollment,
  findExistingEnrollment,
  findLatestEligibilityCheck,
  executeEnrollmentTransaction,
  findStudentEnrollments,
  findEnrolledCurriculum,
  findLessonAndCourse,
  saveLessonProgress,
  findAdminEnrollments,
  findEnrollmentById,
  updateAdminEnrollment as repoUpdateAdminEnrollment,
} from './enrollment.repository.js';

export class EnrollmentServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'EnrollmentServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Service: Self-enroll student into a free course (Section 15.1, Section 18.5)
 */
export async function selfEnrollStudent(courseId, { batch_id = null } = {}, user, ip) {
  // 1. Verify course existence and status
  const course = await findCourseForEnrollment(courseId);
  if (!course || course.status !== 'published') {
    throw new EnrollmentServiceError('Course not found or is not published', 400);
  }

  // 2. Enforce course must be free for self-enrollment (Section 15.1: "Sirf free course par self enroll")
  if (!course.is_free && Number(course.price) > 0) {
    throw new EnrollmentServiceError('Self-enrollment is only permitted for free courses', 400);
  }

  // 3. Enforce enrollment date window
  const now = new Date();
  if (course.enrollment_start_at && now < new Date(course.enrollment_start_at)) {
    throw new EnrollmentServiceError('Course enrollment has not opened yet', 400);
  }
  if (course.enrollment_end_at && now > new Date(course.enrollment_end_at)) {
    throw new EnrollmentServiceError('Course enrollment window has closed', 400);
  }

  // 4. Enforce overall course enrollment limit
  if (course.enrollment_limit && Number(course.enrollment_count) >= Number(course.enrollment_limit)) {
    throw new EnrollmentServiceError('Course enrollment limit has been reached', 400);
  }

  // 5. If batch selected, validate batch eligibility and seats
  if (batch_id) {
    const batch = await findBatchForEnrollment(batch_id, courseId);
    if (!batch) {
      throw new EnrollmentServiceError('Selected batch does not belong to this course', 400);
    }
    if (batch.status !== 'open') {
      throw new EnrollmentServiceError(`Cannot enroll into ${batch.status} batch`, 400);
    }
    if (batch.enrollment_deadline && now > new Date(batch.enrollment_deadline)) {
      throw new EnrollmentServiceError('Batch enrollment deadline has passed', 400);
    }
    if (Number(batch.seats_available) <= 0) {
      throw new EnrollmentServiceError('Selected batch is fully booked (0 seats available)', 409);
    }
  }

  // 6. Enforce server-side eligibility evaluation (Section 15.1: "eligibility pass (agar enabled)")
  if (course.eligibility_enabled) {
    const latestCheck = await findLatestEligibilityCheck(user.id, courseId);
    if (!latestCheck) {
      throw new EnrollmentServiceError(
        'You must complete the course eligibility assessment before enrolling',
        400
      );
    }
    if (latestCheck.result !== 'eligible') {
      throw new EnrollmentServiceError(
        'You are not eligible to enroll in this course based on your eligibility assessment',
        400
      );
    }
  }

  // 7. Duplicate enrollment check
  const existing = await findExistingEnrollment(user.id, courseId);
  if (existing) {
    throw new EnrollmentServiceError('You are already enrolled in this course', 409);
  }

  // 8. Compute access expiration from course_benefits
  let accessExpiresAt = null;
  if (!course.lifetime_access && course.access_duration_days && Number(course.access_duration_days) > 0) {
    accessExpiresAt = new Date(Date.now() + Number(course.access_duration_days) * 86400000);
  }

  // 9. Execute transaction with row locks
  const enrollmentId = await executeEnrollmentTransaction({
    userId: user.id,
    courseId: course.id,
    batchId: batch_id || null,
    enrolledBy: user.id,
    source: 'free',
    status: 'active',
    accessExpiresAt,
  });

  // 10. Audit log for self-enrollment
  await recordAuditLog({
    actor_id: user.id,
    action: 'enrollment.self_enroll',
    entity_type: 'course_enrollment',
    entity_id: enrollmentId,
    old_value: null,
    new_value: {
      user_id: user.id,
      course_id: course.id,
      batch_id: batch_id || null,
      enrollment_source: 'free',
    },
    ip_address: ip,
  });

  return {
    enrollment_id: enrollmentId,
    course_id: course.id,
    batch_id: batch_id || null,
    enrollment_status: 'active',
    enrolled_at: new Date().toISOString(),
    access_expires_at: accessExpiresAt ? accessExpiresAt.toISOString() : null,
  };
}

/**
 * Service: Get authenticated student's enrolled courses (Section 15.1: GET /api/me/enrollments)
 */
export async function getStudentEnrollments(user, query) {
  return findStudentEnrollments(user.id, query);
}

/**
 * Service: Get enrolled course curriculum with personal progress (Section 15.1: GET /api/me/courses/:id/curriculum)
 */
export async function getStudentCurriculum(courseId, user) {
  const result = await findEnrolledCurriculum(user.id, courseId);
  if (!result.enrolled) {
    if (result.reason === 'NOT_ENROLLED') {
      throw new EnrollmentServiceError('You are not enrolled in this course', 403);
    }
    if (result.reason === 'CANCELLED') {
      throw new EnrollmentServiceError('Your enrollment in this course has been cancelled', 403);
    }
    if (result.reason === 'EXPIRED') {
      throw new EnrollmentServiceError('Your access to this course has expired', 403);
    }
  }

  return {
    course_id: Number(courseId),
    enrollment: {
      id: Number(result.enrollment.id),
      status: result.enrollment.enrollment_status,
      access_expires_at: result.enrollment.access_expires_at,
    },
    modules: result.modules,
  };
}

/**
 * Service: Save lesson progress and auto-complete course if all lessons done (Section 15.1)
 */
export async function recordStudentProgress(lessonId, body, user) {
  const lessonInfo = await findLessonAndCourse(lessonId);
  if (!lessonInfo || !lessonInfo.is_published) {
    throw new EnrollmentServiceError('Lesson not found', 404);
  }

  return saveLessonProgress(user.id, lessonId, lessonInfo.course_id, body);
}

/**
 * Service: Admin listing of enrollments (Section 15.1: GET /api/admin/enrollments)
 */
export async function getAdminEnrollments(filters, pagination) {
  return findAdminEnrollments(filters, pagination);
}

/**
 * Service: Admin manual enrollment (Section 15.1: POST /api/admin/enrollments)
 */
export async function createAdminEnrollment(data, user, ip) {
  const pool = getPool();

  // 1. Verify target user exists and is not deleted
  const [userRows] = await pool.query(
    'SELECT id, name, email, status FROM users WHERE id = ? AND deleted_at IS NULL',
    [data.user_id]
  );
  if (userRows.length === 0) {
    throw new EnrollmentServiceError('User not found', 404);
  }

  // 2. Verify course exists and not deleted
  const course = await findCourseForEnrollment(data.course_id);
  if (!course) {
    throw new EnrollmentServiceError('Course not found', 404);
  }

  // 3. Duplicate check
  const existing = await findExistingEnrollment(data.user_id, data.course_id);
  if (existing) {
    throw new EnrollmentServiceError('User is already enrolled in this course', 409);
  }

  // 4. Batch verification if provided
  if (data.batch_id) {
    const batch = await findBatchForEnrollment(data.batch_id, data.course_id);
    if (!batch) {
      throw new EnrollmentServiceError('Selected batch does not belong to this course', 400);
    }
    if (batch.status !== 'open') {
      throw new EnrollmentServiceError(`Cannot enroll into ${batch.status} batch`, 400);
    }
    if (Number(batch.seats_available) <= 0) {
      throw new EnrollmentServiceError('Selected batch is fully booked (0 seats available)', 409);
    }
  }

  // 5. Compute default access expiration if not manually provided
  let accessExpiresAt = data.access_expires_at ? new Date(data.access_expires_at) : null;
  if (!data.access_expires_at && !course.lifetime_access && course.access_duration_days) {
    accessExpiresAt = new Date(Date.now() + Number(course.access_duration_days) * 86400000);
  }

  // 6. Execute enrollment transaction
  const enrollmentId = await executeEnrollmentTransaction({
    userId: data.user_id,
    courseId: data.course_id,
    batchId: data.batch_id || null,
    enrolledBy: user.id,
    source: 'admin_manual',
    status: 'active',
    accessExpiresAt,
    notes: data.notes || null,
  });

  // 7. Audit log for administrative creation
  await recordAuditLog({
    actor_id: user.id,
    action: 'enrollment.admin_create',
    entity_type: 'course_enrollment',
    entity_id: enrollmentId,
    old_value: null,
    new_value: {
      user_id: data.user_id,
      course_id: data.course_id,
      batch_id: data.batch_id || null,
      source: 'admin_manual',
      notes: data.notes || null,
    },
    ip_address: ip,
  });

  return findEnrollmentById(enrollmentId);
}

/**
 * Service: Admin update enrollment status, batch, or access (Section 15.1: PATCH /api/admin/enrollments/:id)
 */
export async function updateAdminEnrollment(id, updates, user, ip) {
  const current = await findEnrollmentById(id);
  if (!current) {
    throw new EnrollmentServiceError('Enrollment not found', 404);
  }

  let updated;
  try {
    updated = await repoUpdateAdminEnrollment(id, updates);
  } catch (err) {
    if (err.statusCode) {
      throw new EnrollmentServiceError(err.message, err.statusCode);
    }
    throw err;
  }

  await recordAuditLog({
    actor_id: user.id,
    action: 'enrollment.admin_update',
    entity_type: 'course_enrollment',
    entity_id: id,
    old_value: current,
    new_value: updates,
    ip_address: ip,
  });

  return updated;
}
