import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import env from '../../config/env.js';
import { recordAuditLog } from '../../utils/auditLogger.js';

class UploadError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
  }
}

/**
 * Inspects initial bytes of buffer to detect real file signature.
 * Prevents disguised files (e.g., .exe renamed to .png).
 */
export function detectMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return null;

  // JPEG (FF D8 FF)
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  // WEBP (RIFF....WEBP)
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }

  // PDF (%PDF-)
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }

  // ZIP / DOCX / XLSX (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return { ext: 'zip', mime: 'application/zip' };
  }

  // MP4 (....ftyp)
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return { ext: 'mp4', mime: 'video/mp4' };
  }

  return null;
}

export function getUploadRootDir() {
  return path.resolve(process.cwd(), env.UPLOAD_DIR);
}

/**
 * Validates uploaded file against purpose rules and magic-byte inspection.
 * Saves file to local disk under appropriate public or private layout.
 */
export async function processUpload({ file, purpose, user, ip }) {
  if (!file || !file.buffer) {
    throw new UploadError('No file uploaded or file payload is empty', 400);
  }

  const rawExt = path.extname(file.originalname).toLowerCase();
  const detected = detectMagicBytes(file.buffer);

  if (!detected) {
    throw new UploadError('Unsupported or invalid file signature (magic bytes mismatch)', 400);
  }

  let targetSubdir;
  let urlPrefix;
  let finalMime = file.mimetype;

  if (purpose === 'image') {
    // 1. Image validation: max 2 MB, jpg/png/webp
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new UploadError('Image file size exceeds maximum limit of 2 MB', 400);
    }

    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedExts.includes(rawExt)) {
      throw new UploadError('Invalid image extension. Only .jpg, .png, and .webp are allowed', 400);
    }

    if (!['jpg', 'png', 'webp'].includes(detected.ext)) {
      throw new UploadError('File content does not match a valid image format', 400);
    }

    targetSubdir = path.join('public', 'images');
    urlPrefix = '/files/images/';
    finalMime = detected.mime;
  } else if (purpose === 'document') {
    // 2. Document validation: max 10 MB, pdf only
    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new UploadError('Document file size exceeds maximum limit of 10 MB', 400);
    }

    if (rawExt !== '.pdf') {
      throw new UploadError('Invalid document extension. Only .pdf documents are allowed', 400);
    }

    if (detected.ext !== 'pdf') {
      throw new UploadError('File content is not a valid PDF document', 400);
    }

    targetSubdir = path.join('public', 'docs');
    urlPrefix = '/files/docs/';
    finalMime = 'application/pdf';
  } else if (purpose === 'material') {
    // 3. Material validation: max MAX_UPLOAD_MB, pdf/zip/docx/xlsx/mp4
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new UploadError(`Material file size exceeds maximum limit of ${env.MAX_UPLOAD_MB} MB`, 400);
    }

    const allowedExts = ['.pdf', '.zip', '.docx', '.xlsx', '.mp4'];
    if (!allowedExts.includes(rawExt)) {
      throw new UploadError('Invalid material extension. Only .pdf, .zip, .docx, .xlsx, and .mp4 are allowed', 400);
    }

    // Verify magic bytes
    if (rawExt === '.pdf' && detected.ext !== 'pdf') {
      throw new UploadError('File content does not match PDF format', 400);
    } else if (['.zip', '.docx', '.xlsx'].includes(rawExt) && detected.ext !== 'zip') {
      throw new UploadError('File content does not match expected archive format', 400);
    } else if (rawExt === '.mp4' && detected.ext !== 'mp4') {
      throw new UploadError('File content does not match MP4 video format', 400);
    }

    targetSubdir = path.join('private', 'materials');
    urlPrefix = '/private/materials/';
    
    // Assign proper mime type
    if (rawExt === '.pdf') finalMime = 'application/pdf';
    else if (rawExt === '.zip') finalMime = 'application/zip';
    else if (rawExt === '.docx') finalMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (rawExt === '.xlsx') finalMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (rawExt === '.mp4') finalMime = 'video/mp4';
  } else {
    throw new UploadError("Invalid purpose. Must be 'image', 'document', or 'material'", 400);
  }

  // Safe server-side filename generation: UUID + sanitized alphanumeric name
  const uuid = crypto.randomUUID();
  const safeBase = path.basename(file.originalname, rawExt)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 40);
  const safeFilename = `${uuid}-${safeBase}${rawExt}`;

  const uploadRoot = getUploadRootDir();
  const destDir = path.join(uploadRoot, targetSubdir);
  const destPath = path.join(destDir, safeFilename);

  // Ensure directory exists
  await fs.promises.mkdir(destDir, { recursive: true });

  // Write file to disk
  await fs.promises.writeFile(destPath, file.buffer);

  const returnedPath = `${urlPrefix}${safeFilename}`;

  // Record audit log for admin write
  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'upload.create',
      entity_type: 'upload',
      entity_id: null,
      old_value: null,
      new_value: {
        path: returnedPath,
        purpose,
        file_size_bytes: file.size,
        file_type: finalMime,
      },
      ip_address: ip,
    });
  }

  return {
    path: returnedPath,
    file_type: finalMime,
    file_size_bytes: file.size,
  };
}

/**
 * Resolves a public or private upload path to an absolute disk path.
 * Guarantees that the path stays strictly within UPLOAD_DIR.
 */
export function resolveDiskPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  // Prevent path traversal
  if (filePath.includes('..') || filePath.includes('\0')) {
    throw new UploadError('Path traversal detected in file path', 400);
  }

  const uploadRoot = getUploadRootDir();
  let relPath = filePath.trim();

  if (relPath.startsWith('/files/images/')) {
    relPath = path.join('public', 'images', relPath.replace('/files/images/', ''));
  } else if (relPath.startsWith('/files/docs/')) {
    relPath = path.join('public', 'docs', relPath.replace('/files/docs/', ''));
  } else if (relPath.startsWith('/files/')) {
    relPath = path.join('public', relPath.replace('/files/', ''));
  } else if (relPath.startsWith('/private/materials/')) {
    relPath = path.join('private', 'materials', relPath.replace('/private/materials/', ''));
  } else if (relPath.startsWith('/private/')) {
    relPath = path.join('private', relPath.replace('/private/', ''));
  } else if (relPath.startsWith('uploads/')) {
    relPath = relPath.replace(/^uploads[\\/]/, '');
  }

  const resolved = path.resolve(uploadRoot, relPath);

  // Security guard: must stay within uploadRoot
  if (!resolved.startsWith(uploadRoot)) {
    throw new UploadError('Access denied: Path traversal outside upload root', 403);
  }

  return resolved;
}

/**
 * Removes an uploaded file from disk.
 */
export async function deleteUploadedFile({ filePath, user, ip }) {
  const diskPath = resolveDiskPath(filePath);

  if (diskPath && fs.existsSync(diskPath)) {
    await fs.promises.unlink(diskPath);
  }

  if (user) {
    await recordAuditLog({
      actor_id: user.id,
      action: 'upload.delete',
      entity_type: 'upload',
      entity_id: null,
      old_value: { path: filePath },
      new_value: null,
      ip_address: ip,
    });
  }

  return true;
}

export default {
  processUpload,
  deleteUploadedFile,
  resolveDiskPath,
  detectMagicBytes,
  getUploadRootDir,
};
