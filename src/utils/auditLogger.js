import { getPool } from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Creates an immutable audit log entry in the audit_logs table.
 * Aligns with Section 4.7 of Course Platform Backend Plan:
 * "audit_logs: actor_id FK, action, entity_type, entity_id, old_value JSON, new_value JSON, ip_address"
 * 
 * @param {object} param0
 * @param {number|null} param0.actor_id - ID of user performing the action
 * @param {string} param0.action - Action name (e.g. 'category.create', 'course.publish')
 * @param {string} param0.entity_type - Entity type ('category', 'subcategory', 'course', 'instructor')
 * @param {number} param0.entity_id - ID of the entity
 * @param {object|null} [param0.old_value] - Previous state before modification
 * @param {object|null} [param0.new_value] - New state after modification
 * @param {string|null} [param0.ip_address] - Client IP address
 * @returns {Promise<number|null>} Inserted audit log ID
 */
export async function createAuditLog({
  actor_id = null,
  action,
  entity_type,
  entity_id,
  old_value = null,
  new_value = null,
  ip_address = null,
}) {
  try {
    const pool = getPool();
    const oldJson = old_value !== null ? JSON.stringify(old_value) : null;
    const newJson = new_value !== null ? JSON.stringify(new_value) : null;
    const safeEntityId = (entity_id !== null && entity_id !== undefined) ? Number(entity_id) : 0;

    const [result] = await pool.query(
      `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actor_id, action, entity_type, safeEntityId, oldJson, newJson, ip_address]
    );

    return result.insertId;
  } catch (error) {
    // Log error but avoid failing the main operational transaction if audit insert fails
    logger.error({
      msg: 'Failed to record audit log',
      action,
      entity_type,
      entity_id,
      error: error.message,
    });
    return null;
  }
}

export const recordAuditLog = createAuditLog;

export default {
  createAuditLog,
  recordAuditLog: createAuditLog,
};
