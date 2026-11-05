"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_js_1 = require("../middleware/auth.js");
const async_handler_js_1 = require("../utils/async-handler.js");
const tasks_service_js_1 = require("../services/tasks.service.js");
const realtime_js_1 = require("../realtime.js");
const router = (0, express_1.Router)();
const validId = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
router.use(auth_js_1.authenticate);
router.get('/mine', (0, auth_js_1.authorize)('DRIVER'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    // Never accept a client-provided driver ID for the mobile endpoint.
    res.json({ success: true, data: await (0, tasks_service_js_1.listTasks)(req.user.id) });
}));
router.get('/', (0, auth_js_1.authorize)('ADMIN'), (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    res.json({ success: true, data: await (0, tasks_service_js_1.listTasks)() });
}));
router.put('/assignment', (0, auth_js_1.authorize)('ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const { driverId, placeId, assigned } = req.body ?? {};
    if (!validId(driverId) || !validId(placeId) || typeof assigned !== 'boolean') {
        res.status(400).json({ success: false, message: 'پیک، مکان یا وضعیت انتخاب معتبر نیست.' });
        return;
    }
    const task = await (0, tasks_service_js_1.setAssignment)(driverId, placeId, assigned, req.user.id);
    (0, realtime_js_1.emitTasksChanged)({ driverId, placeId });
    res.json({ success: true, data: task });
}));
router.patch('/:id/complete', (0, auth_js_1.authorize)('ADMIN', 'DRIVER'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const revision = req.body?.revision;
    if (!validId(id) || !validId(revision)) {
        res.status(400).json({ success: false, message: 'شناسه وظیفه معتبر نیست.' });
        return;
    }
    const task = await (0, tasks_service_js_1.completeTask)(id, revision, req.user);
    (0, realtime_js_1.emitTasksChanged)({ driverId: task.driverId, placeId: task.placeId });
    res.json({ success: true, data: task });
}));
router.use((error, _req, res, next) => {
    if (error instanceof tasks_service_js_1.TaskError) {
        res.status(error.status).json({ success: false, message: error.message });
    }
    else if (error?.code === 'ER_NO_SUCH_TABLE') {
        res.status(503).json({ success: false, message: 'بخش وظایف هنوز روی سرور آماده نشده است؛ Migration وظایف باید اجرا شود.' });
    }
    else
        next(error);
});
exports.default = router;
