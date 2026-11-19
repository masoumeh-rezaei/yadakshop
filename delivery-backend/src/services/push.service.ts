import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import pool from '../config/database.js';

export const validPushToken = (token: unknown): token is string => typeof token === 'string'
  && token.length <= 255 && /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(token);

export async function registerPushDevice(userId: number, token: string, platform: 'android' | 'ios') {
  await pool.execute(`INSERT INTO push_devices (user_id, expo_token, platform) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE user_id = ?, platform = ?, updated_at = CURRENT_TIMESTAMP`,
  [userId, token, platform, userId, platform]);
  // Recover assignments made before this phone could register. The delivery key
  // makes resume/retry idempotent; the worker rechecks current ownership/revision.
  await pool.execute(`INSERT IGNORE INTO task_push_jobs (task_id, task_revision, device_id)
    SELECT t.id, t.revision, d.id FROM driver_tasks t INNER JOIN push_devices d ON d.user_id = t.driver_id
    WHERE d.user_id = ? AND d.expo_token = ? AND t.status = 'pending'`, [userId, token]);
}

export async function unregisterPushDevice(userId: number, token: string) {
  await pool.execute('DELETE FROM push_devices WHERE user_id = ? AND expo_token = ?', [userId, token]);
}

export async function queueAssignmentPush(connection: PoolConnection, task: { id: number; revision: number; driverId: number }) {
  await connection.execute(`INSERT IGNORE INTO task_push_jobs (task_id, task_revision, device_id)
    SELECT ?, ?, id FROM push_devices WHERE user_id = ?`,
  [task.id, task.revision, task.driverId]);
}

interface Job extends RowDataPacket {
  id: number; state: 'pending' | 'receipt'; attempts: number; ticket_id: string | null; lease_id: string;
}
interface Delivery extends RowDataPacket {
  token: string; deviceUserId: number; driverId: number; active: number; status: string;
  taskId: number; revision: number; expectedRevision: number; placeName: string; deviceId: number;
}
interface PushResult { status?: 'ok' | 'error'; id?: string; details?: { error?: string } }
export class PushTestError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const lastTest = new Map<number, number>();

/** Authenticated self-test: never accepts another courier's registration or an arbitrary recipient. */
export async function sendPushTest(userId: number, token: string) {
  const [devices] = await pool.execute<RowDataPacket[]>(`SELECT d.id FROM push_devices d
    INNER JOIN users u ON u.id = d.user_id WHERE d.user_id = ? AND d.expo_token = ? AND u.is_active = 1`, [userId, token]);
  if (!devices.length) throw new PushTestError(409, 'این گوشی برای حساب شما ثبت نشده است؛ دوباره فعال‌سازی اعلان‌ها را بزنید.');
  const now = Date.now();
  for (const [id, time] of lastTest) if (now - time >= 30_000) lastTest.delete(id);
  if (lastTest.has(userId) || lastTest.size >= 1000) throw new PushTestError(429, 'برای آزمایش دوباره، ۳۰ ثانیه صبر کنید.');
  lastTest.set(userId, now);
  let results: PushResult[];
  try {
    results = await expoRequest('send', [{ to: token, title: 'آزمایش اعلان از سرور',
      body: 'اتصال ارسال اعلان بررسی شد؛ وظایف جدید هم باید در نوار اعلان گوشی نمایش داده شوند.',
      sound: 'default', channelId: 'tasks', priority: 'high', ttl: 300,
      data: { type: 'push.remote-test' },
    }]) as PushResult[];
  } catch {
    throw new PushTestError(502, 'سرور به سرویس ارسال اعلان Expo دسترسی ندارد؛ مدیر سامانه باید اتصال سرور را بررسی کند.');
  }
  const result = Array.isArray(results) && results.length === 1 ? results[0] : undefined;
  if (result?.status === 'ok' && typeof result.id === 'string') return { accepted: true, receiptPending: true };
  const code = result?.details?.error;
  if (code === 'DeviceNotRegistered') {
    await unregisterPushDevice(userId, token);
    throw new PushTestError(409, 'شناسهٔ اعلان گوشی منقضی شده؛ دوباره فعال‌سازی اعلان‌ها را بزنید.');
  }
  if (code === 'InvalidCredentials' || code === 'MismatchSenderId') throw new PushTestError(502,
    'کلید Firebase/FCM این اپ در Expo معتبر نیست؛ تنظیمات ارسال اعلان باید روی سرور اصلاح شود.');
  throw new PushTestError(502, 'سرویس اعلان پیام آزمایشی را نپذیرفت؛ مدیر سامانه باید وضعیت ارسال را بررسی کند.');
}
class PushTransportError extends Error {
  constructor(readonly retryable: boolean, readonly code: string) { super(code); }
}

async function expoRequest(path: 'send' | 'getReceipts', body: unknown): Promise<unknown> {
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST', signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new PushTransportError(response.status === 429 || response.status >= 500, `HTTP_${response.status}`);
  const result = await response.json() as { data?: unknown; errors?: unknown[] };
  if (!result.data || result.errors?.length) throw new PushTransportError(true, 'InvalidPushResponse');
  return result.data;
}

async function claimJobs(): Promise<Job[]> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [jobs] = await connection.query<Job[]>(`SELECT id, state, attempts, ticket_id FROM task_push_jobs
      WHERE state IN ('pending', 'receipt') AND available_at <= CURRENT_TIMESTAMP
      AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP) ORDER BY id LIMIT 25 FOR UPDATE`);
    const lease = randomUUID();
    for (const job of jobs) {
      await connection.execute(`UPDATE task_push_jobs SET lease_id = ?, locked_until = CURRENT_TIMESTAMP + INTERVAL 60 SECOND,
        attempts = attempts + 1 WHERE id = ?`, [lease, job.id]);
      job.lease_id = lease;
      job.attempts += 1;
    }
    await connection.commit();
    return jobs;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function finish(job: Job, state: 'pending' | 'receipt' | 'done' | 'failed', delay: number, code: string | null = null, ticket: string | null = null) {
  await pool.execute(`UPDATE task_push_jobs SET state = ?, available_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND),
    locked_until = NULL, lease_id = NULL, last_error = ?, ticket_id = ? WHERE id = ? AND lease_id = ?`,
  [state, delay, code, ticket, job.id, job.lease_id]);
}

async function retry(job: Job, code: string, retryable = true) {
  const state = retryable && job.attempts < 8 ? job.state : 'failed';
  await finish(job, state, job.state === 'receipt' ? 900 : Math.min(3600, 5 * 2 ** job.attempts), code, job.ticket_id);
}

async function acceptResult(job: Job, delivery: Delivery, result: PushResult | undefined) {
  if (result?.status === 'ok') {
    if (job.state === 'receipt') await finish(job, 'done', 0);
    else if (typeof result.id === 'string') await finish(job, 'receipt', 900, null, result.id);
    else await retry(job, 'MissingTicket');
    return;
  }
  const code = result?.details?.error || 'MissingReceipt';
  if (code === 'DeviceNotRegistered') {
    await unregisterPushDevice(delivery.deviceUserId, delivery.token);
    // Device deletion also removes its outstanding jobs through the foreign key.
  } else await retry(job, code, ['MessageRateExceeded', 'ExpoServerError', 'MissingReceipt'].includes(code));
}

/** The durable queue is claimed before any external request; never hold a DB transaction during HTTP. */
export async function processPushJobs() {
  const jobs = await claimJobs();
  const sending: { job: Job; delivery: Delivery }[] = [];
  const receipts: { job: Job; delivery: Delivery }[] = [];
  for (const job of jobs) {
    const [rows] = await pool.execute<Delivery[]>(`SELECT d.expo_token AS token, d.user_id AS deviceUserId, d.id AS deviceId,
      t.id AS taskId, t.driver_id AS driverId, t.status, t.revision, j.task_revision AS expectedRevision,
      u.is_active AS active, p.name AS placeName FROM task_push_jobs j
      INNER JOIN push_devices d ON d.id = j.device_id INNER JOIN driver_tasks t ON t.id = j.task_id
      INNER JOIN users u ON u.id = t.driver_id INNER JOIN saved_places p ON p.id = t.place_id
      WHERE j.id = ?`, [job.id]);
    const delivery = rows[0];
    if (!delivery || !delivery.active || delivery.driverId !== delivery.deviceUserId
      || (job.state === 'pending' && (delivery.status !== 'pending' || delivery.revision !== delivery.expectedRevision))) {
      await finish(job, 'done', 0);
      continue;
    }
    (job.state === 'pending' ? sending : receipts).push({ job, delivery });
  }
  if (sending.length) {
    try {
      const results = await expoRequest('send', sending.map(({ delivery }) => ({
        to: delivery.token, title: 'وظیفهٔ جدید', body: `مقصد «${delivery.placeName}» به شما اختصاص داده شد.`,
        sound: 'default', channelId: 'tasks', priority: 'high', ttl: 3600,
        collapseId: `task-${delivery.taskId}`, tag: `task-${delivery.taskId}`,
        data: { type: 'task.assigned', taskId: delivery.taskId, revision: delivery.expectedRevision },
      }))) as PushResult[];
      if (!Array.isArray(results) || results.length !== sending.length) throw new PushTransportError(true, 'MissingTickets');
      for (let index = 0; index < sending.length; index++) await acceptResult(sending[index].job, sending[index].delivery, results[index]);
    } catch (error) {
      for (const { job } of sending) await retry(job, error instanceof PushTransportError ? error.code : 'PushNetworkError', !(error instanceof PushTransportError) || error.retryable);
    }
  }
  if (receipts.length) {
    try {
      const result = await expoRequest('getReceipts', { ids: receipts.map(({ job }) => job.ticket_id) }) as Record<string, PushResult>;
      for (const { job, delivery } of receipts) await acceptResult(job, delivery, result[job.ticket_id!]);
    } catch (error) {
      for (const { job } of receipts) await retry(job, error instanceof PushTransportError ? error.code : 'ReceiptNetworkError', !(error instanceof PushTransportError) || error.retryable);
    }
  }
}

let running = false;
let lastWarning = 0;
export async function wakePushWorker() {
  if (running) return;
  running = true;
  try { await processPushJobs(); }
  catch {
    if (Date.now() - lastWarning > 300_000) { console.warn('Push delivery queue unavailable; verify migration 004 and database connectivity.'); lastWarning = Date.now(); }
  } finally { running = false; }
}

export function startPushWorker() {
  const timer = setInterval(() => { void wakePushWorker(); }, 5000);
  timer.unref();
  void wakePushWorker();
  return () => clearInterval(timer);
}
