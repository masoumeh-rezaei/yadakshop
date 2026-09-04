"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_js_1 = require("../middleware/auth.js");
const async_handler_js_1 = require("../utils/async-handler.js");
const router = (0, express_1.Router)();
router.post('/', auth_js_1.authenticate, (0, auth_js_1.authorize)('DRIVER'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const accuracy = req.body.accuracy == null ? null : Number(req.body.accuracy);
    const recordedAt = req.body.recordedAt ? new Date(req.body.recordedAt) : new Date();
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
        (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) ||
        Number.isNaN(recordedAt.getTime())) {
        res.status(400).json({ success: false, message: 'اطلاعات موقعیت مکانی معتبر نیست' });
        return;
    }
    const [result] = await database_js_1.default.execute('INSERT INTO locations (user_id, latitude, longitude, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)', [req.user.id, latitude, longitude, accuracy, recordedAt]);
    res.status(201).json({ success: true, data: { id: result.insertId, recordedAt } });
}));
router.get('/latest', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const [rows] = await database_js_1.default.query(`SELECT l.id, l.user_id, u.phone, u.full_name, l.latitude, l.longitude, l.accuracy, l.recorded_at
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     INNER JOIN (SELECT user_id, MAX(id) AS latest_id FROM locations GROUP BY user_id) latest ON latest.latest_id = l.id
     WHERE u.role = 'DRIVER' AND u.is_active = 1 ORDER BY l.recorded_at DESC`);
    res.json({ success: true, data: rows });
}));
router.get('/:userId/history', auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'), (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const userId = Number(req.params.userId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        res.status(400).json({ success: false, message: 'شناسه پیک معتبر نیست' });
        return;
    }
    const [rows] = await database_js_1.default.execute(`SELECT l.id, l.user_id, u.phone, u.full_name, l.latitude, l.longitude, l.accuracy, l.recorded_at
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     WHERE l.user_id = ? AND u.role = 'DRIVER' ORDER BY l.recorded_at DESC LIMIT ${limit}`, [userId]);
    res.json({ success: true, data: rows });
}));
exports.default = router;
