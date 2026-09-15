import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import { Server } from 'socket.io';
import pool from './config/database.js';
import { env } from './config/env.js';
import type { TokenPayload } from './types/auth.js';

export interface RealtimeLocation {
  id: number;
  userId: number;
  phone: string;
  fullName: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
}

interface AdminRow extends RowDataPacket {
  id: number;
  role: 'ADMIN' | 'DRIVER';
  is_active: number;
}

let io: Server | null = null;

export const initializeRealtime = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, methods: ['GET', 'POST'] },
  });

  io.use(async (socket, next) => {
    try {
      // اتصال WebSocket هم مانند REST مستقل احراز هویت می‌شود و فقط مدیر اجازه اتصال دارد.
      const rawToken = socket.handshake.auth?.token;
      if (typeof rawToken !== 'string' || !rawToken) return next(new Error('unauthorized'));
      const payload = jwt.verify(rawToken, env.jwtSecret) as TokenPayload;
      const [rows] = await pool.execute<AdminRow[]>(
        'SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1',
        [payload.sub],
      );
      const user = rows[0];
      if (!user || !user.is_active || user.role !== 'ADMIN') return next(new Error('forbidden'));
      socket.data.userId = Number(user.id);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => socket.join('admins'));
  return io;
};

export const emitLocationUpdate = (location: RealtimeLocation) => {
  // room باعث می‌شود اطلاعات مکانی فقط برای پنل‌های مدیر broadcast شود.
  io?.to('admins').emit('location:update', location);
};
