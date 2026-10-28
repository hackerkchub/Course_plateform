import { sendSuccess, sendError } from '../../utils/response.js';
import {
  createMaterialSchema,
  updateMaterialSchema,
} from './material.validation.js';
import {
  getMaterialsForUser,
  getDownloadFile,
  adminGetMaterials,
  adminCreateMaterial,
  adminUpdateMaterial,
  adminDeleteMaterial,
} from './material.service.js';

/**
 * Controller: GET /api/courses/:id/materials
 * Public / optionalAuth: returns materials filtered by user enrollment / preview rules
 */
export async function getMaterials(req, res, next) {
  try {
    const { id } = req.params;
    const materials = await getMaterialsForUser(id, req.user);
    return sendSuccess(res, 'Course materials retrieved successfully', materials);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: GET /api/courses/:id/materials/:materialId/download
 * Public or signed link: streams material file to client
 */
export async function downloadMaterial(req, res, next) {
  try {
    const { id, materialId } = req.params;
    const { token, expires } = req.query;

    const fileInfo = await getDownloadFile({
      courseIdOrSlug: id,
      materialId: Number(materialId),
      token,
      expires,
      user: req.user,
    });

    return res.download(fileInfo.diskPath, fileInfo.downloadFilename);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: GET /api/admin/courses/:id/materials
 */
export async function adminListMaterials(req, res, next) {
  try {
    const { id } = req.params;
    const materials = await adminGetMaterials(id);
    return sendSuccess(res, 'Course materials retrieved successfully', materials);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: POST /api/admin/courses/:id/materials
 */
export async function adminAddMaterial(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = createMaterialSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid material data', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const material = await adminCreateMaterial(id, parseResult.data, req.user, ip);

    return sendSuccess(res, 'Course material created successfully', material, 201);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: PATCH /api/admin/materials/:materialId
 */
export async function adminPatchMaterial(req, res, next) {
  try {
    const { materialId } = req.params;
    const parseResult = updateMaterialSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid update data', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const material = await adminUpdateMaterial(Number(materialId), parseResult.data, req.user, ip);

    return sendSuccess(res, 'Course material updated successfully', material);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

/**
 * Controller: DELETE /api/admin/materials/:materialId
 */
export async function adminRemoveMaterial(req, res, next) {
  try {
    const { materialId } = req.params;
    const ip = req.ip || req.socket?.remoteAddress;

    await adminDeleteMaterial(Number(materialId), req.user, ip);
    return sendSuccess(res, 'Course material deleted successfully', {});
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export default {
  getMaterials,
  downloadMaterial,
  adminListMaterials,
  adminAddMaterial,
  adminPatchMaterial,
  adminRemoveMaterial,
};
