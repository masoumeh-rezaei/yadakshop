import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { emitLocationUpdate } from '../realtime.js';
import { historyWindow, tehranDayKey, tehranDayStart } from '../utils/location-history.js';

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

  const connection = await pool.getConnection();
  let locationId: number;
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute<(RowDataPacket & { id: number })[]>(
      'SELECT id FROM users WHERE id = ? AND role = ? AND is_active = 1 LOCK IN SHARE MODE',
      [req.user!.id, 'DRIVER'],
    );
    if (!users.length) {
      await connection.rollback();
      res.status(401).json({ success: false, message: 'حساب پیک فعال نیست یا حذف شده است' });
      return;
    }

    const [result] = await connection.execute<ResultSetHeader>(
      'INSERT INTO locations (user_id, latitude, longitude, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)',
      [req.user!.id, latitude, longitude, accuracy, recordedAt],
    );
    locationId = Number(result.insertId);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const location = {
    id: locationId,
    userId: req.user!.id,
    phone: req.user!.phone,
    fullName: req.user!.fullName,
    latitude,
    longitude,
    accuracy,
    recordedAt: recordedAt.toISOString(),
  };
  // پس از ثبت قطعی در دیتابیس، همان رکورد برای پنل‌های مدیر متصل ارسال می‌شود.
  emitLocationUpdate(location);
  res.status(201).json({ success: true, data: location });
}));

router.get('/latest', authenticate, authorize('ADMIN'), asyncHandler(async (_req, res) => {
  // زیرپرس‌وجو آخرین id هر پیک را پیدا می‌کند تا نقشه فقط یک marker برای هر نفر داشته باشد.
  const [rows] = await pool.query<LocationRow[]>(
    `SELECT l.id, l.user_id AS userId, u.phone, u.full_name AS fullName,
            l.latitude, l.longitude, l.accuracy, l.recorded_at AS recordedAt
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     INNER JOIN (SELECT user_id, MAX(id) AS latest_id FROM locations GROUP BY user_id) latest ON latest.latest_id = l.id
     WHERE u.role = 'DRIVER' AND u.is_active = 1 ORDER BY l.recorded_at DESC`,
  );
  res.json({ success: true, data: rows });
}));

router.get('/:userId/history/days', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ success: false, message: 'شناسه پیک معتبر نیست' });
    return;
  }
  const days: { date: string }[] = [];
  const connection = await pool.getConnection();
  try {
    let before = new Date();
    // Seek to the last record before each day instead of scanning/grouping the entire history.
    // An existing (user_id, recorded_at) index makes these seeks efficient;
    // the endpoint also works without it and never creates indexes at runtime.
    while (days.length < 10) {
      const [rows] = await connection.execute<LocationRow[]>(
        `SELECT l.recorded_at AS recordedAt FROM locations l
         INNER JOIN users u ON u.id = l.user_id
         WHERE l.user_id = ? AND u.role = 'DRIVER' AND l.recorded_at < ?
         ORDER BY l.recorded_at DESC LIMIT 1`,
        [userId, before],
      );
      if (!rows.length) break;
      const date = tehranDayKey(rows[0].recordedAt);
      days.push({ date });
      before = tehranDayStart(date);
    }
  } finally {
    connection.release();
  }
  res.json({ success: true, data: days });
}));

router.get('/:userId/history', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    res.status(400).json({ success: false, message: 'شناسه پیک معتبر نیست' });
    return;
  }
  const window = historyWindow(req.query.from, req.query.to);
  if (!window) {
    res.status(400).json({ success: false, message: 'بازه زمانی باید معتبر و حداکثر ۲۴ ساعت باشد' });
    return;
  }
  const [rows] = await pool.execute<LocationRow[]>(
    `SELECT l.id, l.user_id AS userId, u.phone, u.full_name AS fullName,
            l.latitude, l.longitude, l.accuracy, l.recorded_at AS recordedAt
     FROM locations l INNER JOIN users u ON u.id = l.user_id
     WHERE l.user_id = ? AND u.role = 'DRIVER'
       AND l.recorded_at >= ? AND l.recorded_at < ?
     ORDER BY l.recorded_at ASC, l.id ASC`,
    [userId, window.from, window.to],
  );
  res.json({ success: true, data: rows });
}));

export default router;
