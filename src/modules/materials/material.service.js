import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import env from '../../config/env.js';
import { recordAuditLog } from '../../utils/auditLogger.js';
import { resolveDiskPath } from '../uploads/upload.service.js';
import {
  findCourseByIdOrSlug,
  findMaterialsByCourseId,
  findMaterialById,
  checkUserActiveEnrollment,
  createMaterial,
  updateMaterial,
  deleteMaterial,
} from './material.repository.js';

class MaterialServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'MaterialServiceError';
    this.statusCode = statusCode;
  }
}

/**
 * Generates an HMAC-signed download link expiring in 10 minutes.
 * Aligns with Section 12.2:
 * "signed, expiring link hai (HMAC token + expires 10 minute)"
 */
export function generateSignedDownloadUrl(courseId, materialId, expiresInSeconds = 600) {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const signature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`${courseId}:${materialId}:${expires}`)
    .digest('hex');

  return `/api/courses/${courseId}/materials/${materialId}/download?token=${signature}&expires=${expires}`;
}

/**
 * Verifies the validity and expiration of an HMAC-signed download token.
 */
export function verifySignedDownloadToken(courseId, materialId, token, expires) {
  if (!token || !expires) {
    return { valid: false, reason: 'MISSING' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Number(expires) < nowSeconds) {
    return { valid: false, reason: 'EXPIRED' };
  }

  const expectedSig = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(`${courseId}:${materialId}:${expires}`)
    .digest('hex');

  if (token !== expectedSig) {
    return { valid: false, reason: 'INVALID' };
  }

  return { valid: true };
}

/**
 * Service: Retrieves permitted course materials for the current user.
 * Guests / unenrolled students receive only public / preview materials.
 * Enrolled students and admins receive all materials with signed download URLs.
 */
export async function getMaterialsForUser(courseIdOrSlug, user = null) {
  const course = await findCourseByIdOrSlug(courseIdOrSlug);
  if (!course) {
    throw new MaterialServiceError('Course not found', 404);
  }

  const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
  const isEnrolled = user ? await checkUserActiveEnrollment(user.id, course.id) : false;
  const canAccessPrivate = isAdmin || isEnrolled;

  const rawMaterials = await findMaterialsByCourseId(course.id, canAccessPrivate);

  return rawMaterials.map((mat) => {
    let downloadUrl;
    if (mat.requires_enrollment && !mat.is_preview) {
      downloadUrl = generateSignedDownloadUrl(course.id, mat.id, 600);
    } else {
      downloadUrl = `/api/courses/${course.id}/materials/${mat.id}/download`;
    }

    return {
      ...mat,
      download_url: downloadUrl,
    };
  });
}

/**
 * Service: Validates authorization and prepares file for streaming download.
 */
export async function getDownloadFile({ courseIdOrSlug, materialId, token, expires, user }) {
  const course = await findCourseByIdOrSlug(courseIdOrSlug);
  if (!course) {
    throw new MaterialServiceError('Course not found', 404);
  }

  const material = await findMaterialById(materialId);
  if (!material || material.course_id !== course.id) {
    throw new MaterialServiceError('Material not found for this course', 404);
  }

  // 1. If signed token provided, verify signature and expiry
  if (token && expires) {
    const verification = verifySignedDownloadToken(course.id, material.id, token, expires);
    if (!verification.valid) {
      if (verification.reason === 'EXPIRED') {
        throw new MaterialServiceError('Download link has expired', 403);
      }
      throw new MaterialServiceError('Invalid download token', 403);
    }
  } else {
    // 2. No signed link: check public preview or user enrollment
    const isPublic = !material.requires_enrollment || material.is_preview;

    if (!isPublic) {
      if (!user) {
        throw new MaterialServiceError('Authentication required to download this material', 401);
      }

      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const isEnrolled = await checkUserActiveEnrollment(user.id, course.id);

      if (!isAdmin && !isEnrolled) {
        throw new MaterialServiceError('Active enrollment required to download this material', 403);
      }
    }
  }

  // 3. Resolve file path on disk securely
  const diskPath = resolveDiskPath(material.file_path);
  if (!diskPath || !fs.existsSync(diskPath)) {
    throw new MaterialServiceError('Material file not found on disk', 404);
  }

  const stat = await fs.promises.stat(diskPath);
  const ext = path.extname(diskPath);
  const sanitizedTitle = material.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const downloadFilename = `${sanitizedTitle}${ext}`;

  return {
    diskPath,
    downloadFilename,
    fileSize: stat.size,
    mimeType: material.file_type || 'application/octet-stream',
  };
}

/**
 * Service: Admin list of all materials for a course.
 */
export async function adminGetMaterials(courseId) {
  const course = await findCourseByIdOrSlug(courseId);
  if (!course) {
    throw new MaterialServiceError('Course not found', 404);
  }

  return findMaterialsByCourseId(course.id, true);
}

/**
 * Service: Admin create course material metadata.
 */
export async function adminCreateMaterial(courseId, data, user, ip) {
  const course = await findCourseByIdOrSlug(courseId);
  if (!course) {
    throw new MaterialServiceError('Course not found', 404);
  }

  // Auto-detect file size and type if omitted and file is present on disk
  let autoSize = data.file_size_bytes || 0;
  let autoType = data.file_type || null;

  try {
    const diskPath = resolveDiskPath(data.file_path);
    if (diskPath && fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      if (!autoSize) autoSize = stat.size;
      if (!autoType) {
        const ext = path.extname(diskPath).toLowerCase().replace('.', '');
        autoType = ext;
      }
    }
  } catch {
    // Fall back to provided values
  }

  const material = await createMaterial(
    course.id,
    {
      ...data,
      file_size_bytes: autoSize,
      file_type: autoType,
    },
    user?.id
  );

  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'material.create',
      entity_type: 'course_material',
      entity_id: material.id,
      old_value: null,
      new_value: material,
      ip_address: ip,
    });
  }

  return material;
}

/**
 * Service: Admin update course material metadata.
 */
export async function adminUpdateMaterial(materialId, data, user, ip) {
  const current = await findMaterialById(materialId);
  if (!current) {
    throw new MaterialServiceError('Material not found', 404);
  }

  const updated = await updateMaterial(materialId, data);

  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'material.update',
      entity_type: 'course_material',
      entity_id: materialId,
      old_value: current,
      new_value: updated,
      ip_address: ip,
    });
  }

  return updated;
}

/**
 * Service: Admin delete course material metadata and unlink disk file.
 */
export async function adminDeleteMaterial(materialId, user, ip) {
  const current = await findMaterialById(materialId);
  if (!current) {
    throw new MaterialServiceError('Material not found', 404);
  }

  await deleteMaterial(materialId);

  // Remove file from disk if present (Section 12.2: "Delete (file bhi hatao)")
  try {
    const diskPath = resolveDiskPath(current.file_path);
    if (diskPath && fs.existsSync(diskPath)) {
      await fs.promises.unlink(diskPath);
    }
  } catch {
    // Continue even if disk unlink fails (file might have been moved or previously removed)
  }

  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'material.delete',
      entity_type: 'course_material',
      entity_id: materialId,
      old_value: current,
      new_value: null,
      ip_address: ip,
    });
  }

  return true;
}

export default {
  generateSignedDownloadUrl,
  verifySignedDownloadToken,
  getMaterialsForUser,
  getDownloadFile,
  adminGetMaterials,
  adminCreateMaterial,
  adminUpdateMaterial,
  adminDeleteMaterial,
};
