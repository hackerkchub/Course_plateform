import { recordAuditLog } from '../../utils/auditLogger.js';
import {
  findCourseById,
  findDemoSettingsByCourseId,
  upsertDemoSettings,
  countDemoRequestsByIpInPastHour,
  countSlotBookings,
  findExistingActiveDemoRequest,
  createDemoRequest,
  createDemoRequestTransaction,
  findDemoRequestById,
  findDemoRequestsByUserId,
  updateDemoRequest,
  softDeleteDemoRequest,
  createActivityLog,
  getActivityLogsByRequestId,
  findFilteredDemoRequests,
  createEnrollmentFromDemo,
  findEnrollmentByUserAndCourse,
  queueNotification,
} from './demo.repository.js';

class DemoServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DemoServiceError';
    this.statusCode = statusCode;
  }
}

const STATUS_RANK = {
  pending: 1,
  contacted: 2,
  scheduled: 3,
  completed: 4,
  cancelled: 99,
};

/**
 * Service: Fetch current course demo settings
 */
export async function getDemoSettings(courseId) {
  const course = await findCourseById(courseId);
  if (!course) {
    throw new DemoServiceError('Course not found', 404);
  }

  const settings = await findDemoSettingsByCourseId(courseId);
  return settings || {
    course_id: Number(courseId),
    demo_enabled: false,
    demo_request_enabled: false,
    demo_type: null,
    demo_duration_minutes: 45,
    demo_schedule: null,
    time_slots: [],
    accepting_requests: true,
    request_start_at: null,
    request_end_at: null,
    max_requests_per_slot: 10,
    allowed_demo_types: ['live', 'recorded'],
    meeting_platform: null,
    requires_approval: false,
    form_title: null,
    submit_button_text: null,
    success_message: null,
    form_fields: [],
    custom_questions: [],
    honeypot_enabled: true,
    rate_limit_per_hour: 5,
  };
}

/**
 * Service: Admin upsert course demo settings
 */
export async function saveDemoSettings(courseId, data, user, ip) {
  const course = await findCourseById(courseId);
  if (!course) {
    throw new DemoServiceError('Course not found', 404);
  }

  const oldSettings = await findDemoSettingsByCourseId(courseId);
  const updated = await upsertDemoSettings(courseId, data);

  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'demo_settings.update',
      entity_type: 'course_demo_settings',
      entity_id: updated.id || Number(courseId),
      old_value: oldSettings,
      new_value: updated,
      ip_address: ip,
    });
  }

  return updated;
}

/**
 * Service: Submit a demo request as student
 * Follows exact backend checks sequence mandated by Section 13.2
 */
export async function submitDemoRequest(courseId, data, user, ip) {
  // 1. Course exists and is published
  const course = await findCourseById(courseId);
  if (!course || course.status !== 'published' || course.deleted_at) {
    throw new DemoServiceError('Course not found or is not currently published', 400);
  }

  // 2. Demo settings check (demo_enabled & demo_request_enabled)
  const settings = await findDemoSettingsByCourseId(courseId);
  if (!settings || !settings.demo_enabled || !settings.demo_request_enabled) {
    throw new DemoServiceError('Demo requests are not currently enabled for this course', 400);
  }

  // 3. Accepting requests flag check
  if (!settings.accepting_requests) {
    throw new DemoServiceError('We are not currently accepting demo requests for this course', 400);
  }

  // 4. Request date range check
  const now = new Date();
  if (settings.request_start_at && now < new Date(settings.request_start_at)) {
    throw new DemoServiceError('Demo requests have not opened yet for this course', 400);
  }
  if (settings.request_end_at && now > new Date(settings.request_end_at)) {
    throw new DemoServiceError('Demo requests are closed for this course', 400);
  }

  // 5. Slot capacity check
  if (data.preferred_date && data.preferred_time) {
    const bookedCount = await countSlotBookings(courseId, data.preferred_date, data.preferred_time);
    if (bookedCount >= settings.max_requests_per_slot) {
      throw new DemoServiceError('Selected time slot is fully booked. Please choose another date or time', 400);
    }
  }

  // 6. Honeypot bot submission prevention
  if (settings.honeypot_enabled && data.honeypot) {
    throw new DemoServiceError('Bot submission detected', 400);
  }

  // 7. IP rate limiting (default 5 requests per hour)
  const ipCount = await countDemoRequestsByIpInPastHour(ip);
  if (ipCount >= settings.rate_limit_per_hour) {
    throw new DemoServiceError('Rate limit exceeded: Too many demo requests submitted from this IP. Please try again later', 429);
  }

  // 8. Consent verification
  if (data.consent !== true) {
    throw new DemoServiceError('Consent is required to submit a demo request', 400);
  }

  // 9. Duplicate check (same user or phone for same course in pending/contacted/scheduled)
  const activeDuplicate = await findExistingActiveDemoRequest(courseId, user.id, data.phone);
  if (activeDuplicate) {
    throw new DemoServiceError('You already have an active demo request for this course', 409);
  }

  // Generate reference number: DEMO-YYYY-XXXX (with 4-6 digits to ensure uniqueness)
  const year = new Date().getFullYear();
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  const referenceNo = `DEMO-${year}-${randomPart}`;

  // Execute atomic transactional save (request + activity log + counter increment + notification)
  try {
    const result = await createDemoRequestTransaction({
      requestData: {
        ...data,
        reference_no: referenceNo,
        course_id: Number(courseId),
        user_id: user.id,
        ip_address: ip,
      },
      activityLogData: {
        action: 'submitted',
        old_status: null,
        new_status: 'pending',
        note: 'Demo request submitted by student',
        performed_by: user.id,
      },
      notificationData: {
        user_id: null,
        type: 'demo_request_received',
        channel: 'inapp',
        recipient: 'admin',
        payload: {
          reference_no: referenceNo,
          course_id: Number(courseId),
          student_name: data.student_name,
          email: data.email,
          phone: data.phone,
        },
      },
    });

    return result;
  } catch (err) {
    if (err.statusCode) {
      throw new DemoServiceError(err.message, err.statusCode);
    }
    throw err;
  }
}

/**
 * Service: Get demo requests for authenticated student
 */
export async function getStudentDemoRequests(userId) {
  return findDemoRequestsByUserId(userId);
}

/**
 * Service: Student cancel their own demo request
 */
export async function cancelStudentDemoRequest(userId, requestId) {
  const request = await findDemoRequestById(requestId);
  if (!request || request.user_id !== userId) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  if (request.status !== 'pending' && request.status !== 'contacted') {
    throw new DemoServiceError('Only pending or contacted demo requests can be cancelled', 400);
  }

  await updateDemoRequest(requestId, { status: 'cancelled' });

  await createActivityLog({
    demoRequestId: requestId,
    action: 'cancelled_by_student',
    oldStatus: request.status,
    newStatus: 'cancelled',
    note: 'Cancelled by student',
    performedBy: userId,
  });

  return true;
}

/**
 * Service: Admin / Counsellor filtered leads list
 */
export async function getAdminDemoRequests(filters = {}) {
  return findFilteredDemoRequests(filters);
}

/**
 * Service: Admin / Counsellor single lead detail with activity history
 */
export async function getAdminDemoRequestDetails(requestId) {
  const request = await findDemoRequestById(requestId);
  if (!request) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  const activityLogs = await getActivityLogsByRequestId(requestId);
  return {
    ...request,
    activity_history: activityLogs,
  };
}

/**
 * Service: Admin / Counsellor update demo request
 */
export async function updateAdminDemoRequest(requestId, data, user, ip) {
  const current = await findDemoRequestById(requestId);
  if (!current) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  // Status transition validation
  if (data.status && data.status !== current.status) {
    const oldRank = STATUS_RANK[current.status] || 0;
    const newRank = STATUS_RANK[data.status] || 0;

    // Rule: Reverting status backward is restricted to admin/super_admin
    const isRevert = newRank < oldRank && data.status !== 'cancelled';
    if (isRevert && user.role !== 'admin' && user.role !== 'super_admin') {
      throw new DemoServiceError('Only administrators can revert demo request status', 403);
    }

    // Rule: scheduled status requires scheduled_at
    if (data.status === 'scheduled' && !data.scheduled_at && !current.scheduled_at) {
      throw new DemoServiceError('scheduled_at is required when status is scheduled', 400);
    }
  }

  const updated = await updateDemoRequest(requestId, data);

  // Activity log entry
  const action = data.status && data.status !== current.status ? 'status_updated' : 'updated';
  const note = data.admin_notes || `Demo request updated by ${user.role}`;

  await createActivityLog({
    demoRequestId: requestId,
    action,
    oldStatus: current.status,
    newStatus: updated.status,
    note,
    performedBy: user.id,
  });

  // Audit log for staff operation
  await recordAuditLog({
    actor_id: user.id,
    action: 'demo_request.update',
    entity_type: 'demo_request',
    entity_id: requestId,
    old_value: current,
    new_value: updated,
    ip_address: ip,
  });

  return updated;
}

/**
 * Service: Admin / Counsellor bulk update demo requests
 */
export async function bulkUpdateAdminDemoRequests({ ids, status, assigned_to, admin_notes }, user, ip) {
  let updatedCount = 0;

  for (const id of ids) {
    const current = await findDemoRequestById(id);
    if (!current) continue;

    if (status && status !== current.status) {
      const oldRank = STATUS_RANK[current.status] || 0;
      const newRank = STATUS_RANK[status] || 0;
      if (newRank < oldRank && status !== 'cancelled' && user.role !== 'admin' && user.role !== 'super_admin') {
        continue;
      }
    }

    const payload = {};
    if (status) payload.status = status;
    if (assigned_to !== undefined) payload.assigned_to = assigned_to;
    if (admin_notes) payload.admin_notes = admin_notes;

    await updateDemoRequest(id, payload);

    await createActivityLog({
      demoRequestId: id,
      action: 'bulk_updated',
      oldStatus: current.status,
      newStatus: status || current.status,
      note: admin_notes || 'Bulk update by staff',
      performedBy: user.id,
    });

    updatedCount++;
  }

  await recordAuditLog({
    actor_id: user.id,
    action: 'demo_request.bulk_update',
    entity_type: 'demo_request',
    entity_id: 0,
    old_value: null,
    new_value: { ids, status, assigned_to, updatedCount },
    ip_address: ip,
  });

  return { updated_count: updatedCount };
}

/**
 * Service: Admin / Counsellor add follow-up note
 */
export async function addAdminDemoNote(requestId, noteText, user, ip) {
  const current = await findDemoRequestById(requestId);
  if (!current) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  const timestampStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const appendedNotes = current.admin_notes
    ? `${current.admin_notes}\n[${timestampStr}] ${noteText}`
    : `[${timestampStr}] ${noteText}`;

  await updateDemoRequest(requestId, { admin_notes: appendedNotes });

  await createActivityLog({
    demoRequestId: requestId,
    action: 'note_added',
    oldStatus: current.status,
    newStatus: current.status,
    note: noteText,
    performedBy: user.id,
  });

  return findDemoRequestById(requestId);
}

/**
 * Service: Admin convert demo request to enrollment
 */
export async function convertAdminDemoRequest(requestId, { batch_id = null, access_expires_at = null }, user, ip) {
  const current = await findDemoRequestById(requestId);
  if (!current) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  if (current.converted_to_enrollment) {
    throw new DemoServiceError('Demo request is already converted to an enrollment', 400);
  }

  const existingEnrollment = await findEnrollmentByUserAndCourse(current.user_id, current.course_id);
  if (existingEnrollment) {
    throw new DemoServiceError('Student is already enrolled in this course', 400);
  }

  let enrollmentId;
  try {
    enrollmentId = await createEnrollmentFromDemo(
      requestId,
      current.course_id,
      current.user_id,
      batch_id,
      access_expires_at
    );
  } catch (err) {
    if (err.statusCode) {
      throw new DemoServiceError(err.message, err.statusCode);
    }
    throw err;
  }

  await createActivityLog({
    demoRequestId: requestId,
    action: 'converted_to_enrollment',
    oldStatus: current.status,
    newStatus: 'completed',
    note: `Converted to enrollment ID ${enrollmentId}`,
    performedBy: user.id,
  });

  await recordAuditLog({
    actor_id: user.id,
    action: 'demo_request.convert',
    entity_type: 'demo_request',
    entity_id: requestId,
    old_value: { converted_to_enrollment: false },
    new_value: { converted_to_enrollment: true, enrollment_id: enrollmentId },
    ip_address: ip,
  });

  return { enrollment_id: enrollmentId };
}

/**
 * Neutralizes dangerous characters at the start of a CSV cell to prevent CSV formula injection (CWE-1236)
 */
function escapeCsvValue(val) {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  // Neutralize CSV formula injection characters: =, +, -, @, tab, CR
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Service: Admin export demo requests to CSV
 */
export async function exportAdminDemoRequestsToCsv(filters = {}) {
  const result = await findFilteredDemoRequests({ ...filters, limit: 10000 });
  const rows = result.requests;

  const headers = [
    'ID', 'Reference No', 'Course ID', 'Course Name', 'Student Name',
    'Email', 'Phone', 'City', 'Qualification', 'Experience',
    'Demo Type', 'Preferred Date', 'Preferred Time', 'Status',
    'Assigned To', 'Scheduled At', 'Meeting Link', 'Attended', 'Converted', 'Created At'
  ];

  const csvRows = [headers.join(',')];

  for (const r of rows) {
    const values = [
      escapeCsvValue(r.id),
      escapeCsvValue(r.reference_no),
      escapeCsvValue(r.course_id),
      escapeCsvValue(r.course_name),
      escapeCsvValue(r.student_name),
      escapeCsvValue(r.email),
      escapeCsvValue(r.phone),
      escapeCsvValue(r.city),
      escapeCsvValue(r.current_qualification),
      escapeCsvValue(r.experience_level),
      escapeCsvValue(r.preferred_demo_type),
      escapeCsvValue(r.preferred_date),
      escapeCsvValue(r.preferred_time),
      escapeCsvValue(r.status),
      escapeCsvValue(r.assigned_to),
      escapeCsvValue(r.scheduled_at),
      escapeCsvValue(r.meeting_link),
      escapeCsvValue(r.attended !== null ? (r.attended ? 'Yes' : 'No') : ''),
      escapeCsvValue(r.converted_to_enrollment ? 'Yes' : 'No'),
      escapeCsvValue(r.created_at),
    ];
    csvRows.push(values.join(','));
  }

  const filename = `demo_requests_export_${Date.now()}.csv`;
  return {
    csv: csvRows.join('\n'),
    filename,
  };
}

/**
 * Service: Admin soft delete demo request
 */
export async function deleteAdminDemoRequest(requestId, user, ip) {
  const current = await findDemoRequestById(requestId);
  if (!current) {
    throw new DemoServiceError('Demo request not found', 404);
  }

  await softDeleteDemoRequest(requestId);

  await createActivityLog({
    demoRequestId: requestId,
    action: 'soft_deleted',
    oldStatus: current.status,
    newStatus: null,
    note: 'Demo request soft deleted by administrator',
    performedBy: user.id,
  });

  await recordAuditLog({
    actor_id: user.id,
    action: 'demo_request.delete',
    entity_type: 'demo_request',
    entity_id: requestId,
    old_value: current,
    new_value: null,
    ip_address: ip,
  });

  return true;
}

export default {
  getDemoSettings,
  saveDemoSettings,
  submitDemoRequest,
  getStudentDemoRequests,
  cancelStudentDemoRequest,
  getAdminDemoRequests,
  getAdminDemoRequestDetails,
  updateAdminDemoRequest,
  bulkUpdateAdminDemoRequests,
  addAdminDemoNote,
  convertAdminDemoRequest,
  exportAdminDemoRequestsToCsv,
  deleteAdminDemoRequest,
};
