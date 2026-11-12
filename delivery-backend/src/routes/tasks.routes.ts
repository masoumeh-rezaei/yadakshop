import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { completeTask, listTasks, setAssignment, TaskError } from '../services/tasks.service.js';
import { emitTasksChanged } from '../realtime.js';
import { wakePushWorker } from '../services/push.service.js';

const router = Router();
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
router.use(authenticate);

router.get('/capabilities', authorize('ADMIN'), (_req, res) => {
  res.json({ success: true, data: { descriptions: true } });
});

router.get('/mine', authorize('DRIVER'), asyncHandler(async (req, res) => {
  // Never accept a client-provided driver ID for the mobile endpoint.
  res.json({ success: true, data: await listTasks(req.user!.id) });
}));

router.get('/', authorize('ADMIN'), asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await listTasks() });
}));

router.put('/assignment', authorize('ADMIN'), asyncHandler(async (req, res) => {
  const { driverId, placeId, assigned, description, revision } = req.body ?? {};
  if (!validId(driverId) || !validId(placeId) || typeof assigned !== 'boolean') {
    res.status(400).json({ success: false, message: 'پیک، مکان یا وضعیت انتخاب معتبر نیست.' });
    return;
  }
  if ((description != null && (typeof description !== 'string' || description.length > 2000))
    || (revision !== undefined && !validId(revision))) {
    res.status(400).json({ success: false, message: 'توضیحات باید متنی و حداکثر ۲۰۰۰ نویسه باشد و نسخهٔ وظیفه معتبر باشد.' });
    return;
  }
  const task = await setAssignment(driverId, placeId, assigned, req.user!.id, description?.trim() || null, revision);
  emitTasksChanged({ driverId, placeId });
  if (assigned) void wakePushWorker();
  res.json({ success: true, data: task });
}));

router.patch('/:id/complete', authorize('DRIVER'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const revision = req.body?.revision;
  if (!validId(id) || !validId(revision)) {
    res.status(400).json({ success: false, message: 'شناسه وظیفه معتبر نیست.' });
    return;
  }
  const task = await completeTask(id, revision, req.user!);
  emitTasksChanged({ driverId: task.driverId, placeId: task.placeId });
  res.json({ success: true, data: task });
}));

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof TaskError) {
    res.status(error.status).json({ success: false, message: error.message });
  } else if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes((error as { code?: string })?.code || '')) {
    res.status(503).json({ success: false, message: 'بخش وظایف هنوز روی سرور آماده نشده است؛ Migration وظایف باید اجرا شود.' });
  } else next(error);
});
export default router;
