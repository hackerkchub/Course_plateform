import multer from 'multer';
import env from '../../config/env.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { processUpload, deleteUploadedFile } from './upload.service.js';
import { uploadPurposeEnum, deleteUploadSchema } from './upload.validation.js';

// Multer memory storage configuration
const storage = multer.memoryStorage();
const maxBytes = Math.max(env.MAX_UPLOAD_MB || 10, 10) * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: maxBytes,
    files: 1,
  },
});

/**
 * Express middleware wrapper around multer.single('file') to format errors consistently.
 */
export function handleSingleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return sendError(res, `File size exceeds the maximum limit of ${env.MAX_UPLOAD_MB} MB`, [], 400);
      }
      return sendError(res, `Upload error: ${err.message}`, [], 400);
    } else if (err) {
      return sendError(res, err.message, [], 400);
    }
    next();
  });
}

/**
 * Controller: POST /api/admin/uploads
 */
export async function uploadFile(req, res, next) {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded. Please attach a file under the "file" field', [], 400);
    }

    const purposeParse = uploadPurposeEnum.safeParse(req.body.purpose);
    if (!purposeParse.success) {
      return sendError(res, purposeParse.error.errors[0]?.message || 'Invalid upload purpose', [], 400);
    }

    const purpose = purposeParse.data;
    const ip = req.ip || req.socket?.remoteAddress;

    const result = await processUpload({
      file: req.file,
      purpose,
      user: req.user,
      ip,
    });

    return sendSuccess(res, 'File uploaded successfully', result, 201);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: DELETE /api/admin/uploads
 */
export async function deleteUpload(req, res, next) {
  try {
    const parseResult = deleteUploadSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid delete request', [], 400);
    }

    const { path: filePath } = parseResult.data;
    const ip = req.ip || req.socket?.remoteAddress;

    await deleteUploadedFile({
      filePath,
      user: req.user,
      ip,
    });

    return sendSuccess(res, 'File deleted successfully', {});
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export default {
  handleSingleUpload,
  uploadFile,
  deleteUpload,
};
