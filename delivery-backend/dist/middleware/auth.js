"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_js_1 = __importDefault(require("../config/database.js"));
const env_js_1 = require("../config/env.js");
const authenticate = async (req, res, next) => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        res.status(401).json({ success: false, message: 'توکن ورود ارسال نشده است' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, env_js_1.env.jwtSecret);
        const [rows] = await database_js_1.default.execute('SELECT id, phone, full_name, role, is_active FROM users WHERE id = ? LIMIT 1', [payload.sub]);
        const user = rows[0];
        if (!user || !user.is_active) {
            res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال یا حذف شده است' });
            return;
        }
        req.user = {
            id: Number(user.id), phone: user.phone, fullName: user.full_name, role: user.role,
        };
        next();
    }
    catch {
        res.status(401).json({ success: false, message: 'توکن نامعتبر یا منقضی شده است' });
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        res.status(403).json({ success: false, message: 'اجازه انجام این عملیات را ندارید' });
        return;
    }
    next();
};
exports.authorize = authorize;
