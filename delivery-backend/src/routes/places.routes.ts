import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

interface PlaceRow extends RowDataPacket {
  id: number;
  name: string;
  latitude: string;
  longitude: string;
  createdAt: Date;
  updatedAt: Date;
}

const router = Router();
router.use(authenticate, authorize('ADMIN'));

const parsePlace = (body: unknown) => {
  const input = body as Record<string, unknown> | null;
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const latitude = Number(input?.latitude);
  const longitude = Number(input?.longitude);

  if (!name || name.length > 100) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { name, latitude, longitude };
};

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query<PlaceRow[]>(
    `SELECT id, name, latitude, longitude,
            created_at AS createdAt, updated_at AS updatedAt
     FROM saved_places ORDER BY name ASC, id ASC`,
  );
  res.json({ success: true, data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
  const place = parsePlace(req.body);
  if (!place) {
    res.status(400).json({ success: false, message: 'نام یا مختصات مکان معتبر نیست.' });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO saved_places (name, latitude, longitude) VALUES (?, ?, ?)',
    [place.name, place.latitude, place.longitude],
  );
  const now = new Date().toISOString();
  res.status(201).json({ success: true, data: {
    id: Number(result.insertId), ...place, createdAt: now, updatedAt: now,
  } });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const place = parsePlace(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !place) {
    res.status(400).json({ success: false, message: 'شناسه، نام یا مختصات مکان معتبر نیست.' });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE saved_places SET name = ?, latitude = ?, longitude = ? WHERE id = ?',
    [place.name, place.latitude, place.longitude, id],
  );
  if (!result.affectedRows) {
    res.status(404).json({ success: false, message: 'مکان پیدا نشد.' });
    return;
  }
  res.json({ success: true, data: { id, ...place, updatedAt: new Date().toISOString() } });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'شناسه مکان معتبر نیست.' });
    return;
  }
  const [result] = await pool.execute<ResultSetHeader>('DELETE FROM saved_places WHERE id = ?', [id]);
  if (!result.affectedRows) {
    res.status(404).json({ success: false, message: 'مکان پیدا نشد.' });
    return;
  }
  res.status(204).send();
}));

export default router;
