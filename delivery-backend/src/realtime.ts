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

interface RealtimeUserRow extends RowDataPacket {
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
      // Each connection is authenticated independently; clients cannot choose their room or driver ID.
      const rawToken = socket.handshake.auth?.token;
      if (typeof rawToken !== 'string' || !rawToken) return next(new Error('unauthorized'));
      const payload = jwt.verify(rawToken, env.jwtSecret) as TokenPayload;
      const [rows] = await pool.execute<RealtimeUserRow[]>(
        'SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1',
        [payload.sub],
      );
      const user = rows[0];
      if (!user || !user.is_active || !['ADMIN', 'DRIVER'].includes(user.role)) return next(new Error('forbidden'));
      socket.data.userId = Number(user.id);
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(socket.data.role === 'ADMIN' ? 'admins' : `driver:${socket.data.userId}`);
    if (socket.data.role === 'DRIVER') socket.join('drivers');
  });
  return io;
};

export const emitLocationUpdate = (location: RealtimeLocation) => {
  // room باعث می‌شود اطلاعات مکانی فقط برای پنل‌های مدیر broadcast شود.
  io?.to('admins').emit('location:update', location);
};

export const emitTasksChanged = (change: { driverId?: number; placeId?: number }) => {
  io?.to('admins').emit('tasks:changed', change);
  if (change.driverId) io?.to(`driver:${change.driverId}`).emit('tasks:changed', change);
  // Place edits/removal affect potentially several couriers; only invalidate, never send task data.
  else if (change.placeId) io?.to('drivers').emit('tasks:changed', {});
};

export interface CompletedTaskEvent {
  id: number; revision: number; driverId: number; driverName: string | null;
  driverPhone: string; placeId: number; placeName: string; completedAt: Date | string | null;
}
export const emitTaskCompleted = (task: CompletedTaskEvent) => {
  io?.to('admins').emit('task:completed', {
    id: task.id, revision: task.revision, driverId: task.driverId, driverName: task.driverName,
    driverPhone: task.driverPhone, placeId: task.placeId, placeName: task.placeName, completedAt: task.completedAt,
  });
};

export const disconnectUser = (userId: number) => io?.in(`user:${userId}`).disconnectSockets(true);
