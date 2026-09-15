import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { RowDataPacket } from 'mysql2';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import type { TokenPayload, UserRole } from '../types/auth.js';

interface UserRow extends RowDataPacket {
  id: number;
  phone: string;
  full_name: string | null;
  role: UserRole;
  is_active: number;
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ success: false, message: 'توکن ورود ارسال نشده است' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;

    // فقط امضای توکن کافی نیست؛ وضعیت فعلی کاربر نیز از دیتابیس بررسی می‌شود.
    // در نتیجه، غیرفعال‌کردن حساب بلافاصله دسترسی توکن قبلی را هم قطع می‌کند.
    const [rows] = await pool.execute<UserRow[]>(
      'SELECT id, phone, full_name, role, is_active FROM users WHERE id = ? LIMIT 1',
      [payload.sub],
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      res.status(401).json({ success: false, message: 'حساب کاربری غیرفعال یا حذف شده است' });
      return;
    }
    req.user = {
      id: Number(user.id), phone: user.phone, fullName: user.full_name, role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'توکن نامعتبر یا منقضی شده است' });
  }
};

export const authorize = (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    // authenticate کاربر را شناسایی می‌کند و authorize مجوز نقش او را می‌سنجد.
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'اجازه انجام این عملیات را ندارید' });
      return;
    }
    next();
  };
