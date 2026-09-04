import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

interface UserRow extends RowDataPacket {
  id: number;
  phone: string;
  full_name: string | null;
  role: 'ADMIN' | 'DRIVER';
  is_active: number;
  created_at: Date;
  updated_at: Date;
}

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/', asyncHandler(async (_req, res) => {
  const [rows] = await pool.query<UserRow[]>(
    `SELECT id, phone, full_name, role, is_active, created_at, updated_at
     FROM users ORDER BY created_at DESC`,
  );
  res.json({ success: true, data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
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

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (phone, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [phone, passwordHash, fullName, role],
    );
    res.status(201).json({ success: true, data: {
      id: result.insertId, phone, fullName, role, isActive: true,
    } });
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      res.status(409).json({ success: false, message: 'این شماره موبایل قبلاً ثبت شده است' });
      return;
    }
    throw error;
  }
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
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
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id],
  );
  if (!result.affectedRows) {
    res.status(404).json({ success: false, message: 'کاربر پیدا نشد' });
    return;
  }
  res.json({ success: true, data: { id, isActive } });
}));

export default router;
