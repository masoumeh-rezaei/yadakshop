"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = __importDefault(require("../config/database.js"));
const env_js_1 = require("../config/env.js");
const auth_js_1 = require("../middleware/auth.js");
const async_handler_js_1 = require("../utils/async-handler.js");
const router = (0, express_1.Router)();
router.post('/login', (0, async_handler_js_1.asyncHandler)(async (req, res) => {
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!phone || !password) {
        res.status(400).json({ success: false, message: 'شماره موبایل و رمز عبور الزامی است' });
        return;
    }
    const [rows] = await database_js_1.default.execute('SELECT id, phone, password_hash, full_name, role, is_active FROM users WHERE phone = ? LIMIT 1', [phone]);
    const user = rows[0];
    if (!user || !user.is_active || !(await bcryptjs_1.default.compare(password, user.password_hash))) {
        res.status(401).json({ success: false, message: 'شماره موبایل یا رمز عبور اشتباه است' });
        return;
    }
    const options = { expiresIn: env_js_1.env.jwtExpiresIn };
    const token = jsonwebtoken_1.default.sign({ phone: user.phone, role: user.role }, env_js_1.env.jwtSecret, {
        ...options, subject: String(user.id),
    });
    res.json({ success: true, data: {
            token,
            user: { id: Number(user.id), phone: user.phone, fullName: user.full_name, role: user.role },
        } });
}));
router.get('/me', auth_js_1.authenticate, (req, res) => {
    res.json({ success: true, data: req.user });
});
exports.default = router;
