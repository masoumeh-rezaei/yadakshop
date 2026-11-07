import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/database.js';

export interface TaskRow extends RowDataPacket {
  id: number;
  driverId: number;
  driverName: string | null;
  driverPhone: string;
  placeId: number;
  placeName: string;
  latitude: string | number;
  longitude: string | number;
  status: 'pending' | 'completed' | 'cancelled';
  revision: number;
  assignedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

export class TaskError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const taskSelect = `SELECT t.id, t.driver_id AS driverId, u.full_name AS driverName,
  u.phone AS driverPhone, t.place_id AS placeId, p.name AS placeName,
  p.latitude, p.longitude, t.status, t.revision, t.assigned_at AS assignedAt,
  t.completed_at AS completedAt, t.updated_at AS updatedAt
  FROM driver_tasks t INNER JOIN users u ON u.id = t.driver_id
  INNER JOIN saved_places p ON p.id = t.place_id`;

export async function listTasks(driverId?: number): Promise<TaskRow[]> {
  const [rows] = await pool.execute<TaskRow[]>(
    `${taskSelect} WHERE t.status <> 'cancelled' AND u.role = 'DRIVER'
      ${driverId === undefined ? '' : 'AND t.driver_id = ?'}
      ORDER BY t.assigned_at DESC, t.id DESC`,
    driverId === undefined ? [] : [driverId],
  );
  return rows;
}

async function readTask(connection: PoolConnection, driverId: number, placeId: number) {
  const [rows] = await connection.execute<TaskRow[]>(
    `${taskSelect} WHERE t.driver_id = ? AND t.place_id = ?`, [driverId, placeId],
  );
  return rows[0] ?? null;
}

export async function setAssignment(driverId: number, placeId: number, assigned: boolean, adminId: number) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Lock parents in a consistent order, also serializing requests from either popup.
    const [drivers] = await connection.execute<(RowDataPacket & { role: string; isActive: number })[]>(
      'SELECT role, is_active AS isActive FROM users WHERE id = ? FOR UPDATE', [driverId],
    );
    if (!drivers[0] || drivers[0].role !== 'DRIVER') throw new TaskError(404, 'پیک پیدا نشد.');
    if (assigned && !drivers[0].isActive) throw new TaskError(409, 'برای پیک غیرفعال نمی‌توان وظیفهٔ جدید ثبت کرد.');
    const [places] = await connection.execute<RowDataPacket[]>(
      'SELECT id FROM saved_places WHERE id = ? FOR UPDATE', [placeId],
    );
    if (!places.length) throw new TaskError(404, 'مکان پیدا نشد.');

    if (assigned) {
      // Preserve the original assignment on duplicate retries; reopen a completed/cancelled pair.
      await connection.execute(
        `INSERT INTO driver_tasks (driver_id, place_id, assigned_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           assigned_at = IF(status = 'pending', assigned_at, CURRENT_TIMESTAMP),
           completed_at = IF(status = 'pending', completed_at, NULL),
           revision = IF(status = 'pending', revision, revision + 1),
           assigned_by = IF(status = 'pending', assigned_by, ?), status = 'pending'`,
        [driverId, placeId, adminId, adminId],
      );
    } else {
      await connection.execute(
        `UPDATE driver_tasks SET status = 'cancelled', completed_at = NULL, revision = revision + 1
         WHERE driver_id = ? AND place_id = ? AND status = 'pending'`, [driverId, placeId],
      );
    }
    const task = await readTask(connection, driverId, placeId);
    await connection.commit();
    return task;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function completeTask(id: number, revision: number, actor: { id: number; role: string }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & { driverId: number; placeId: number; status: string; revision: number })[]>(
      `SELECT driver_id AS driverId, place_id AS placeId, status, revision FROM driver_tasks
       WHERE id = ? ${actor.role === 'DRIVER' ? 'AND driver_id = ?' : ''} FOR UPDATE`,
      actor.role === 'DRIVER' ? [id, actor.id] : [id],
    );
    const task = rows[0];
    if (!task) throw new TaskError(404, 'وظیفه پیدا نشد.');
    if (task.status === 'cancelled') throw new TaskError(409, 'این وظیفه لغو شده است.');
    if (task.revision !== revision && !(task.status === 'completed' && task.revision === revision + 1)) {
      throw new TaskError(409, 'این وظیفه تغییر کرده است؛ فهرست را به‌روز کنید.');
    }
    await connection.execute(
      `UPDATE driver_tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = ? AND status = 'pending'`, [id],
    );
    const updated = await readTask(connection, task.driverId, task.placeId);
    await connection.commit();
    return updated!;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
