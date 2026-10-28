import { sendSuccess } from '../../utils/response.js';
import * as batchService from './batch.service.js';

export async function getUpcomingBatches(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const batches = await batchService.getUpcomingBatches(courseId);
    return sendSuccess(res, 'Upcoming batches fetched successfully', batches);
  } catch (error) {
    next(error);
  }
}

export async function getAllBatchesAdmin(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const batches = await batchService.getAllBatchesAdmin(courseId);
    return sendSuccess(res, 'All course batches fetched successfully', batches);
  } catch (error) {
    next(error);
  }
}

export async function createBatch(req, res, next) {
  try {
    const courseId = Number(req.params.id);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const batch = await batchService.createBatch(courseId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Batch created successfully', batch, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateBatch(req, res, next) {
  try {
    const batchId = Number(req.params.batchId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const batch = await batchService.updateBatch(batchId, req.body, actorId, ipAddress);
    return sendSuccess(res, 'Batch updated successfully', batch);
  } catch (error) {
    next(error);
  }
}

export async function deleteBatch(req, res, next) {
  try {
    const batchId = Number(req.params.batchId);
    const actorId = req.user?.id;
    const ipAddress = req.ip || req.connection.remoteAddress;

    const result = await batchService.deleteBatch(batchId, actorId, ipAddress);
    return sendSuccess(res, 'Batch deleted successfully', result);
  } catch (error) {
    next(error);
  }
}
