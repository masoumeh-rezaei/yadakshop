import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import pool from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import locationRoutes from './routes/locations.routes.js';
import userRoutes from './routes/users.routes.js';
import { env } from './config/env.js';

const app = express();
app.disable('x-powered-by');

// Middlewareهای عمومی قبل از routeها اجرا می‌شوند تا ورودی تمام APIها یک‌دست باشد.
app.use(cors({ origin: env.corsOrigins }));
app.use(express.json({ limit: '100kb' }));
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Delivery API is running', database: 'connected' });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(503).json({ success: false, message: 'Database connection failed' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/locations', locationRoutes);

// این دو middleware باید آخر باشند: اول مسیر ناموجود و سپس خطاهای کنترل‌نشده.
app.use((_req, res) => res.status(404).json({ success: false, message: 'مسیر API پیدا نشد' }));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ success: false, message: 'خطای داخلی سرور' });
});
export default app;
