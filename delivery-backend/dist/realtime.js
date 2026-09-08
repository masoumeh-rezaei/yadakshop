"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitLocationUpdate = exports.initializeRealtime = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const socket_io_1 = require("socket.io");
const database_js_1 = __importDefault(require("./config/database.js"));
const env_js_1 = require("./config/env.js");
let io = null;
const initializeRealtime = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: env_js_1.env.corsOrigins, methods: ['GET', 'POST'] },
    });
    io.use(async (socket, next) => {
        try {
            const rawToken = socket.handshake.auth?.token;
            if (typeof rawToken !== 'string' || !rawToken)
                return next(new Error('unauthorized'));
            const payload = jsonwebtoken_1.default.verify(rawToken, env_js_1.env.jwtSecret);
            const [rows] = await database_js_1.default.execute('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1', [payload.sub]);
            const user = rows[0];
            if (!user || !user.is_active || user.role !== 'ADMIN')
                return next(new Error('forbidden'));
            socket.data.userId = Number(user.id);
            next();
        }
        catch {
            next(new Error('unauthorized'));
        }
    });
    io.on('connection', (socket) => socket.join('admins'));
    return io;
};
exports.initializeRealtime = initializeRealtime;
const emitLocationUpdate = (location) => {
    io?.to('admins').emit('location:update', location);
};
exports.emitLocationUpdate = emitLocationUpdate;
