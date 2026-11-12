import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { registerPushDevice, unregisterPushDevice, validPushToken } from '../services/push.service.js';

const router = Router();
router.use(authenticate, authorize('DRIVER'));
router.post('/device', asyncHandler(async (req, res) => {
  const { expoPushToken, platform } = req.body ?? {};
  if (!validPushToken(expoPushToken) || !['android', 'ios'].includes(platform)) {
    res.status(400).json({ success: false, message: 'اطلاعات دستگاه برای دریافت اعلان معتبر نیست.' }); return;
  }
  await registerPushDevice(req.user!.id, expoPushToken, platform);
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
