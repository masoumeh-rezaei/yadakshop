import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { registerPushDevice, unregisterPushDevice, validPushToken, sendPushTest, PushTestError, wakePushWorker } from '../services/push.service.js';

const router = Router();
router.use(authenticate, authorize('DRIVER'));
router.post('/test', asyncHandler(async (req, res) => {
  if (!validPushToken(req.body?.expoPushToken)) {
    res.status(400).json({ success: false, message: 'شناسهٔ اعلان دستگاه معتبر نیست.' }); return;
  }
  try { res.json({ success: true, data: await sendPushTest(req.user!.id, req.body.expoPushToken) }); }
  catch (error) {
    if (error instanceof PushTestError) res.status(error.status).json({ success: false, message: error.message });
    else throw error;
  }
}));
router.post('/device', asyncHandler(async (req, res) => {
  const { expoPushToken, platform } = req.body ?? {};
  if (!validPushToken(expoPushToken) || !['android', 'ios'].includes(platform)) {
    res.status(400).json({ success: false, message: 'اطلاعات دستگاه برای دریافت اعلان معتبر نیست.' }); return;
  }
  await registerPushDevice(req.user!.id, expoPushToken, platform);
  void wakePushWorker();
  res.json({ success: true, data: null });
}));
router.delete('/device', asyncHandler(async (req, res) => {
  if (!validPushToken(req.body?.expoPushToken)) {
    res.status(400).json({ success: false, message: 'شناسهٔ اعلان دستگاه معتبر نیست.' }); return;
  }
  await unregisterPushDevice(req.user!.id, req.body.expoPushToken);
  res.json({ success: true, data: null });
}));
export default router;
