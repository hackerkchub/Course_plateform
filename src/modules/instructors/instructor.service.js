import { AppError } from '../../middleware/errorHandler.js';
import { createAuditLog } from '../../utils/auditLogger.js';
import {
  findActiveInstructors,
  findInstructorById,
  findInstructorsAdmin,
  createInstructor as repoCreateInstructor,
  updateInstructor as repoUpdateInstructor,
  deleteInstructor as repoDeleteInstructor,
} from './instructor.repository.js';

export async function getActiveInstructors() {
  return findActiveInstructors();
}

export async function getInstructorById(id) {
  const instructor = await findInstructorById(id);
  if (!instructor) {
    throw new AppError('Instructor not found', 404);
  }
  return instructor;
}

export async function getInstructorsAdmin(filters) {
  return findInstructorsAdmin(filters);
}

export async function createInstructor(data, actorId = null, ipAddress = null) {
  const newInstructor = await repoCreateInstructor(data);

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.create',
    entity_type: 'instructor',
    entity_id: newInstructor.id,
    new_value: newInstructor,
    ip_address: ipAddress,
  });

  return newInstructor;
}

export async function updateInstructor(id, data, actorId = null, ipAddress = null) {
  const existing = await findInstructorById(id);
  if (!existing) {
    throw new AppError('Instructor not found', 404);
  }

  const updated = await repoUpdateInstructor(id, data);

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.update',
    entity_type: 'instructor',
    entity_id: id,
    old_value: existing,
    new_value: updated,
    ip_address: ipAddress,
  });

  return updated;
}

export async function deleteInstructor(id, actorId = null, ipAddress = null) {
  const existing = await findInstructorById(id);
  if (!existing) {
    throw new AppError('Instructor not found', 404);
  }

  await repoDeleteInstructor(id);

  await createAuditLog({
    actor_id: actorId,
    action: 'instructor.deactivate',
    entity_type: 'instructor',
    entity_id: id,
    old_value: existing,
    ip_address: ipAddress,
  });
}

export default {
  getActiveInstructors,
  getInstructorById,
  getInstructorsAdmin,
  createInstructor,
  updateInstructor,
  deleteInstructor,
};
