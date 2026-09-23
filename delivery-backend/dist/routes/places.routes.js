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
router.use(auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'));
const parsePlace = (body) => {
    const input = body;
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const latitude = Number(input?.latitude);
    const longitude = Number(input?.longitude);
    if (!name || name.length > 100)
        return null;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
        return null;
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
        return null;
    return { name, latitude, longitude };
};
router.get('/', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const [rows] = await database_js_1.default.query(`SELECT id, name, latitude, longitude,
            created_at AS createdAt, updated_at AS updatedAt
     FROM saved_places ORDER BY name ASC, id ASC`);
    res.json({ success: true, data: rows });
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const place = parsePlace(req.body);
    if (!place) {
        res.status(400).json({ success: false, message: 'نام یا مختصات مکان معتبر نیست.' });
        return;
    }
    const [result] = await database_js_1.default.execute('INSERT INTO saved_places (name, latitude, longitude) VALUES (?, ?, ?)', [place.name, place.latitude, place.longitude]);
    const now = new Date().toISOString();
    res.status(201).json({ success: true, data: {
            id: Number(result.insertId), ...place, createdAt: now, updatedAt: now,
        } });
}));
router.put('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const place = parsePlace(req.body);
    if (!Number.isSafeInteger(id) || id <= 0 || !place) {
        res.status(400).json({ success: false, message: 'شناسه، نام یا مختصات مکان معتبر نیست.' });
        return;
    }
    const [result] = await database_js_1.default.execute('UPDATE saved_places SET name = ?, latitude = ?, longitude = ? WHERE id = ?', [place.name, place.latitude, place.longitude, id]);
    if (!result.affectedRows) {
        res.status(404).json({ success: false, message: 'مکان پیدا نشد.' });
        return;
    }
    res.json({ success: true, data: { id, ...place, updatedAt: new Date().toISOString() } });
}));
router.delete('/:id', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'شناسه مکان معتبر نیست.' });
        return;
    }
    const [result] = await database_js_1.default.execute('DELETE FROM saved_places WHERE id = ?', [id]);
    if (!result.affectedRows) {
        res.status(404).json({ success: false, message: 'مکان پیدا نشد.' });
        return;
    }
    res.status(204).send();
}));
exports.default = router;
