import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { emitLocationUpdate } from '../realtime.js';

interface LocationRow extends RowDataPacket {
  id: number; userId: number; phone: string; fullName: string | null;
  latitude: string; longitude: string; accuracy: string | null; recordedAt: Date;
}

const router = Router();

router.post('/', authenticate, authorize('DRIVER'), asyncHandler(async (req, res) => {
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
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO locations (user_id, latitude, longitude, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)',
    [req.user!.id, latitude, longitude, accuracy, recordedAt],
  );
  const location = {
    id: Number(result.insertId),
    userId: req.user!.id,
    phone: req.user!.phone,
    fullName: req.user!.fullName,
    latitude,
    longitude,
    accuracy,
    recordedAt: recordedAt.toISOString(),
  };
  emitLocationUpdate(location);
  res.status(201).json({ success: true, data: location });
}));

router.get('/latest', authenticate, authorize('ADMIN'), asyncHandler(async (_req, res) => {
  const [rows] = await pool.query<LocationRow[]>(
    `SELECT l.id, l.user_id AS userId, u.phone, u.full_name AS fullName,
            l.latitude, l.longitude, l.accuracy, l.recorded_at AS recordedAt
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     INNER JOIN (SELECT user_id, MAX(id) AS latest_id FROM locations GROUP BY user_id) latest ON latest.latest_id = l.id
     WHERE u.role = 'DRIVER' AND u.is_active = 1 ORDER BY l.recorded_at DESC`,
  );
  res.json({ success: true, data: rows });
}));

router.get('/:userId/history', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ success: false, message: 'شناسه پیک معتبر نیست' });
    return;
  }
  const [rows] = await pool.execute<LocationRow[]>(
    `SELECT l.id, l.user_id AS userId, u.phone, u.full_name AS fullName,
            l.latitude, l.longitude, l.accuracy, l.recorded_at AS recordedAt
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     WHERE l.user_id = ? AND u.role = 'DRIVER' ORDER BY l.recorded_at DESC LIMIT ${limit}`,
    [userId],
  );
  res.json({ success: true, data: rows });
}));

export default router;
