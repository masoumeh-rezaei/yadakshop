import bcrypt from 'bcryptjs';
import pool from '../config/database.js';

const phone = process.env.ADMIN_PHONE?.trim();
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_FULL_NAME?.trim() || 'مدیر سیستم';
if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) throw new Error('Set a valid ADMIN_PHONE in .env');
if (!password || password.length < 8) throw new Error('ADMIN_PASSWORD must contain at least 8 characters');

const createAdmin = async () => {
try {
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users (phone, password_hash, full_name, role, is_active) VALUES (?, ?, ?, 'ADMIN', 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), role = 'ADMIN', is_active = 1`,
    [phone, passwordHash, fullName],
  );
  console.log(`Admin ${phone} is ready.`);
} finally {
  await pool.end();
}
};

createAdmin().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
