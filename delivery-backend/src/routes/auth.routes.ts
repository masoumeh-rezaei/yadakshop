import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import type { UserRole } from '../types/auth.js';
import { asyncHandler } from '../utils/async-handler.js';

interface LoginUserRow extends RowDataPacket {
  id: number;
  phone: string;
  password_hash: string;
  full_name: string | null;
  role: UserRole;
  is_active: number;
}

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!phone || !password) {
    res.status(400).json({ success: false, message: 'شماره موبایل و رمز عبور الزامی است' });
    return;
  }

  const [rows] = await pool.execute<LoginUserRow[]>(
    'SELECT id, phone, password_hash, full_name, role, is_active FROM users WHERE phone = ? LIMIT 1',
    [phone],
  );
  const user = rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ success: false, message: 'شماره موبایل یا رمز عبور اشتباه است' });
    return;
  }

  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'] };
  const token = jwt.sign({ phone: user.phone, role: user.role }, env.jwtSecret, {
    ...options, subject: String(user.id),
  });
  res.json({ success: true, data: {
    token,
    user: { id: Number(user.id), phone: user.phone, fullName: user.full_name, role: user.role },
  } });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
