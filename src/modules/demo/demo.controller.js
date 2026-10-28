import { sendSuccess, sendError } from '../../utils/response.js';
import {
  demoSettingsSchema,
  createDemoRequestSchema,
  updateDemoRequestSchema,
  bulkUpdateDemoRequestsSchema,
  addDemoNoteSchema,
  convertDemoRequestSchema,
} from './demo.validation.js';
import {
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
} from './demo.service.js';

export async function getSettings(req, res, next) {
  try {
    const { id } = req.params;
    const settings = await getDemoSettings(Number(id));
    return sendSuccess(res, 'Demo settings retrieved successfully', settings);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = demoSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid demo settings payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const updated = await saveDemoSettings(Number(id), parseResult.data, req.user, ip);

    return sendSuccess(res, 'Demo settings updated successfully', updated);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function createRequest(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = createDemoRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid demo request payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const result = await submitDemoRequest(Number(id), parseResult.data, req.user, ip);

    return sendSuccess(res, 'Aapki demo request mil gayi hai. Hamari team jaldi contact karegi.', result, 201);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function getMyRequests(req, res, next) {
  try {
    const requests = await getStudentDemoRequests(req.user.id);
    return sendSuccess(res, 'Demo requests retrieved successfully', requests);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function cancelMyRequest(req, res, next) {
  try {
    const { id } = req.params;
    await cancelStudentDemoRequest(req.user.id, Number(id));
    return sendSuccess(res, 'Demo request cancelled successfully', {});
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function listAdminRequests(req, res, next) {
  try {
    const result = await getAdminDemoRequests(req.query);
    return res.status(200).json({
      success: true,
      message: 'Demo requests retrieved successfully',
      data: {
        summary: result.summary,
        requests: result.requests,
        pagination: result.pagination,
      },
      pagination: result.pagination,
    });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function getCourseDemoRequests(req, res, next) {
  try {
    const { id } = req.params;
    const result = await getAdminDemoRequests({ ...req.query, course_id: Number(id) });
    return res.status(200).json({
      success: true,
      message: 'Course demo requests retrieved successfully',
      data: {
        summary: result.summary,
        requests: result.requests,
        pagination: result.pagination,
      },
      pagination: result.pagination,
    });
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function getDemoRequestDetails(req, res, next) {
  try {
    const { id } = req.params;
    const requestDetails = await getAdminDemoRequestDetails(Number(id));
    return sendSuccess(res, 'Demo request details retrieved successfully', requestDetails);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function patchDemoRequest(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = updateDemoRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid update payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const updated = await updateAdminDemoRequest(Number(id), parseResult.data, req.user, ip);

    return sendSuccess(res, 'Demo request updated successfully', updated);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function bulkUpdateRequests(req, res, next) {
  try {
    const parseResult = bulkUpdateDemoRequestsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid bulk payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const result = await bulkUpdateAdminDemoRequests(parseResult.data, req.user, ip);

    return sendSuccess(res, 'Bulk demo requests updated successfully', result);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function addNote(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = addDemoNoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid note payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const updated = await addAdminDemoNote(Number(id), parseResult.data.note, req.user, ip);

    return sendSuccess(res, 'Note added successfully', updated);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function convertRequest(req, res, next) {
  try {
    const { id } = req.params;
    const parseResult = convertDemoRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return sendError(res, parseResult.error.errors[0]?.message || 'Invalid conversion payload', [], 400);
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const result = await convertAdminDemoRequest(Number(id), parseResult.data, req.user, ip);

    return sendSuccess(res, 'Demo request converted to active enrollment successfully', result);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function exportRequests(req, res, next) {
  try {
    const { csv, filename } = await exportAdminDemoRequestsToCsv(req.query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export async function deleteRequest(req, res, next) {
  try {
    const { id } = req.params;
    const ip = req.ip || req.socket?.remoteAddress;

    await deleteAdminDemoRequest(Number(id), req.user, ip);
    return sendSuccess(res, 'Demo request soft deleted successfully', {});
  } catch (error) {
    if (error.statusCode) {
      return sendError(res, error.message, [], error.statusCode);
    }
    next(error);
  }
}

export default {
  getSettings,
  updateSettings,
  createRequest,
  getMyRequests,
  cancelMyRequest,
  listAdminRequests,
  getCourseDemoRequests,
  getDemoRequestDetails,
  patchDemoRequest,
  bulkUpdateRequests,
  addNote,
  convertRequest,
  exportRequests,
  deleteRequest,
};
