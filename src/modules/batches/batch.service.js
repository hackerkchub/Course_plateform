import * as batchRepo from './batch.repository.js';
import * as courseRepo from '../courses/course.repository.js';
import { recordAuditLog } from '../../utils/auditLogger.js';

export async function getUpcomingBatches(courseId) {
  return batchRepo.findUpcomingBatches(courseId);
}

export async function getAllBatchesAdmin(courseId) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  return batchRepo.findAllBatchesAdmin(courseId);
}

export async function createBatch(courseId, data, actorId, ipAddress) {
  const course = await courseRepo.findCourseByIdAdmin(courseId);
  if (!course) {
    const error = new Error('Course not found');
    error.statusCode = 404;
    throw error;
  }

  const batch = await batchRepo.createBatch(courseId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'CREATE_BATCH',
    entity_type: 'course_batch',
    entity_id: batch.id,
    new_value: batch,
    ip_address: ipAddress,
  });

  return batch;
}

export async function updateBatch(batchId, data, actorId, ipAddress) {
  const existing = await batchRepo.findBatchById(batchId);
  if (!existing) {
    const error = new Error('Batch not found');
    error.statusCode = 404;
    throw error;
  }

  const updated = await batchRepo.updateBatch(batchId, data);

  await recordAuditLog({
    actor_id: actorId,
    action: 'UPDATE_BATCH',
    entity_type: 'course_batch',
    entity_id: batchId,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteBatch(batchId, actorId, ipAddress) {
  const existing = await batchRepo.findBatchById(batchId);
  if (!existing) {
    const error = new Error('Batch not found');
    error.statusCode = 404;
    throw error;
  }

  const activeEnrollments = await batchRepo.countActiveEnrollments(batchId);
  if (activeEnrollments > 0) {
    const error = new Error('Batch has active enrollments; cannot delete');
    error.statusCode = 409;
    throw error;
  }

  await batchRepo.deleteBatch(batchId);

  await recordAuditLog({
    actor_id: actorId,
    action: 'DELETE_BATCH',
    entity_type: 'course_batch',
    entity_id: batchId,
    old_value: existing,
    ip_address: ipAddress,
  });

  return { id: batchId, deleted: true };
}
