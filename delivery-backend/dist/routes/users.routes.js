"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_js_1 = __importDefault(require("../config/database.js"));
const auth_js_1 = require("../middleware/auth.js");
const async_handler_js_1 = require("../utils/async-handler.js");
const router = (0, express_1.Router)();
router.use(auth_js_1.authenticate, (0, auth_js_1.authorize)('ADMIN'));
router.get('/', (0, async_handler_js_1.asyncHandler)(async (_req, res) => {
    const [rows] = await database_js_1.default.query(`SELECT id, phone, full_name, role, is_active, created_at, updated_at
     FROM users ORDER BY created_at DESC`);
    res.json({ success: true, data: rows });
}));
router.post('/', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : null;
    const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'DRIVER';
    if (!/^\+?[0-9]{10,15}$/.test(phone)) {
        res.status(400).json({ success: false, message: 'شماره موبایل معتبر نیست' });
        return;
    }
    if (password.length < 8) {
        res.status(400).json({ success: false, message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' });
        return;
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    try {
        const [result] = await database_js_1.default.execute('INSERT INTO users (phone, password_hash, full_name, role) VALUES (?, ?, ?, ?)', [phone, passwordHash, fullName, role]);
        res.status(201).json({ success: true, data: {
                id: result.insertId, phone, fullName, role, isActive: true,
            } });
    }
    catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ success: false, message: 'این شماره موبایل قبلاً ثبت شده است' });
            return;
        }
        throw error;
    }
}));
router.patch('/:id/status', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const id = Number(req.params.id);
    const isActive = req.body.isActive;
    if (!Number.isSafeInteger(id) || id <= 0 || typeof isActive !== 'boolean') {
        res.status(400).json({ success: false, message: 'شناسه یا وضعیت نامعتبر است' });
        return;
    }
    if (id === req.user?.id && !isActive) {
        res.status(400).json({ success: false, message: 'نمی‌توانید حساب خودتان را غیرفعال کنید' });
        return;
    }
    const [result] = await database_js_1.default.execute('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    if (!result.affectedRows) {
        res.status(404).json({ success: false, message: 'کاربر پیدا نشد' });
        return;
    }
    res.json({ success: true, data: { id, isActive } });
}));
exports.default = router;
