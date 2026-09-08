"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_js_1 = __importDefault(require("./config/database.js"));
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const locations_routes_js_1 = __importDefault(require("./routes/locations.routes.js"));
const users_routes_js_1 = __importDefault(require("./routes/users.routes.js"));
const env_js_1 = require("./config/env.js");
const app = (0, express_1.default)();
app.disable('x-powered-by');
app.use((0, cors_1.default)({ origin: env_js_1.env.corsOrigins }));
app.use(express_1.default.json({ limit: '100kb' }));
app.get('/api/health', async (_req, res) => {
    try {
        await database_js_1.default.query('SELECT 1');
        res.json({ success: true, message: 'Delivery API is running', database: 'connected' });
    }
    catch (error) {
        console.error('Database connection error:', error);
        res.status(503).json({ success: false, message: 'Database connection failed' });
    }
});
app.use('/api/auth', auth_routes_js_1.default);
app.use('/api/users', users_routes_js_1.default);
app.use('/api/locations', locations_routes_js_1.default);
app.use((_req, res) => res.status(404).json({ success: false, message: 'مسیر API پیدا نشد' }));
app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
});
exports.default = app;
