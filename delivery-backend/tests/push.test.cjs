const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
Object.assign(process.env, { DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test', JWT_SECRET: 'push-tests-secret-at-least-thirty-two-characters' });
const pool = require('../dist/config/database.js').default;
const push = require('../dist/services/push.service.js');
const originalFetch = global.fetch;
let clock = 0, jobs, devices, deliveries, requests, server, base, fakeResponse;
const pushToken = 'ExpoPushToken[abcdefghijklmno12345]';
const sql = input => input.replace(/\s+/g, ' ').trim();

pool.getConnection = async () => ({
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  query: async statement => {
    assert.match(statement, /FOR UPDATE/);
    return [[...jobs.values()].filter(job => ['pending', 'receipt'].includes(job.state) && job.available <= clock && job.lockedUntil <= clock)
      .map(job => ({ ...job }))];
  },
  execute: async (statement, [lease, id]) => {
    assert.match(statement, /locked_until = CURRENT_TIMESTAMP \+ INTERVAL 60 SECOND/);
    const job = jobs.get(id);
    Object.assign(job, { lease_id: lease, lockedUntil: clock + 60, attempts: job.attempts + 1 });
    return [{ affectedRows: 1 }];
  },
});
pool.execute = async (statement, params) => {
  const query = sql(statement);
  if (query.includes('FROM users WHERE id')) {
    const id = Number(params[0]);
    return [[{ id, phone: '09000000000', full_name: 'Test', role: id === 1 ? 'ADMIN' : 'DRIVER', is_active: id === 4 ? 0 : 1 }]];
  }
  if (query.startsWith('INSERT INTO push_devices')) {
    devices.set(params[1], { userId: params[0], platform: params[2] }); return [{ affectedRows: 1 }];
  }
  if (query.startsWith('DELETE FROM push_devices')) {
    if (devices.get(params[1])?.userId === params[0]) {
      devices.delete(params[1]);
      for (const [id, delivery] of deliveries) if (delivery.token === params[1]) jobs.delete(id);
    }
    return [{ affectedRows: 1 }];
  }
  if (query.startsWith('SELECT d.expo_token')) return [[deliveries.get(params[0])].filter(Boolean)];
  if (query.startsWith('UPDATE task_push_jobs SET state')) {
    const [state, delay, error, ticket, id, lease] = params;
    const job = jobs.get(id);
    if (job?.lease_id === lease) Object.assign(job, { state, available: clock + delay, lockedUntil: 0, lease_id: null, last_error: error, ticket_id: ticket });
    return [{ affectedRows: 1 }];
  }
  throw new Error('Unexpected query: ' + query);
};

function seed(overrides = {}) {
  jobs.set(1, { id: 1, state: 'pending', attempts: 0, ticket_id: null, lease_id: null, available: 0, lockedUntil: 0, ...overrides.job });
  devices.set(pushToken, { userId: 2, platform: 'android' });
  deliveries.set(1, { token: pushToken, deviceUserId: 2, driverId: 2, active: 1, status: 'pending', taskId: 10, revision: 3, expectedRevision: 3, placeName: 'آریا پارت', deviceId: 1, ...overrides.delivery });
}
before(async () => {
  const app = express(); app.use(express.json());
  app.use('/api/notifications', require('../dist/routes/notifications.routes.js').default);
  server = await new Promise(resolve => { const result = app.listen(0, '127.0.0.1', () => resolve(result)); });
  base = `http://127.0.0.1:${server.address().port}/api/notifications`;
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://exp.host/')) return originalFetch(url, options);
    requests.push({ path: new URL(url).pathname, body: JSON.parse(options.body) });
    return fakeResponse(url, options);
  };
});
beforeEach(() => {
  clock = 0; jobs = new Map(); devices = new Map(); deliveries = new Map(); requests = [];
  fakeResponse = async () => Response.json({ data: [{ status: 'ok', id: 'ticket-1' }] });
});
after(async () => { global.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); await pool.end(); });
async function request(userId, method, body) {
  return fetch(base + '/device', { method, headers: { 'Content-Type': 'application/json',
    ...(userId === null ? {} : { Authorization: `Bearer ${jwt.sign({ sub: userId }, process.env.JWT_SECRET)}` }) }, body: JSON.stringify(body) });
}

test('device registration uses authenticated driver identity and validates tokens/platforms', async () => {
  const body = { expoPushToken: pushToken, platform: 'android', userId: 3 };
  assert.equal((await request(null, 'POST', body)).status, 401);
  assert.equal((await request(1, 'POST', body)).status, 403);
  assert.equal((await request(4, 'POST', body)).status, 401);
  for (const token of ['plain-token', 'ExpoPushToken[bad token]', 1, 'a'.repeat(300)]) {
    assert.equal((await request(2, 'POST', { ...body, expoPushToken: token })).status, 400);
  }
  assert.equal((await request(2, 'POST', { ...body, platform: 'web' })).status, 400);
  assert.equal((await request(2, 'POST', body)).status, 200);
  assert.deepEqual(devices.get(pushToken), { userId: 2, platform: 'android' });
  assert.equal((await request(3, 'DELETE', body)).status, 200);
  assert.equal(devices.has(pushToken), true);
  await request(3, 'POST', body);
  await request(2, 'DELETE', body);
  assert.equal(devices.get(pushToken).userId, 3);
  await request(3, 'DELETE', body);
  assert.equal(devices.size, 0);
});

test('assignment push preserves its destination and revision, uses high-priority channel and deduplicates OS notifications', async () => {
  seed(); await push.processPushJobs();
  const message = requests[0].body[0];
  assert.equal(message.body, 'مقصد «آریا پارت» به شما اختصاص داده شد.');
  assert.equal(message.to, pushToken);
  assert.equal(message.priority, 'high'); assert.equal(message.channelId, 'tasks');
  assert.equal(message.tag, 'task-10'); assert.equal(message.collapseId, 'task-10');
  assert.deepEqual(message.data, { type: 'task.assigned', taskId: 10, revision: 3 });
  assert.equal(jobs.get(1).state, 'receipt');
  assert.equal(jobs.get(1).available, 900);
  await push.processPushJobs(); assert.equal(requests.length, 1);
});

test('successful receipts finish the job; a send ticket alone is not treated as delivery', async () => {
  seed(); await push.processPushJobs(); clock = 900;
  fakeResponse = async () => Response.json({ data: { 'ticket-1': { status: 'ok' } } });
  deliveries.get(1).status = 'completed';
  await push.processPushJobs();
  assert.equal(jobs.get(1).state, 'done');
  assert.deepEqual(requests.at(-1).body, { ids: ['ticket-1'] });
});

test('stale, cancelled, disabled and reassigned-device jobs are discarded without leaking a notification', async () => {
  for (const delivery of [{ revision: 4 }, { status: 'cancelled' }, { active: 0 }, { deviceUserId: 3 }]) {
    seed({ delivery }); await push.processPushJobs(); assert.equal(jobs.get(1).state, 'done');
  }
  assert.equal(requests.length, 0);
});

test('temporary transport errors retry with backoff and permanent credential errors do not loop', async () => {
  seed(); fakeResponse = async () => new Response('', { status: 503 });
  await push.processPushJobs();
  assert.equal(jobs.get(1).state, 'pending'); assert.equal(jobs.get(1).available, 10);
  await push.processPushJobs(); assert.equal(requests.length, 1);
  clock = 10;
  fakeResponse = async () => Response.json({ data: [{ status: 'error', details: { error: 'InvalidCredentials' } }] });
  await push.processPushJobs();
  assert.equal(jobs.get(1).state, 'failed'); assert.equal(jobs.get(1).last_error, 'InvalidCredentials');
});

test('unregistered devices are removed on both tickets and receipts', async () => {
  for (const state of ['pending', 'receipt']) {
    seed({ job: { state, ticket_id: state === 'receipt' ? 'ticket-1' : null } });
    const result = { status: 'error', details: { error: 'DeviceNotRegistered' } };
    fakeResponse = async () => Response.json({ data: state === 'receipt' ? { 'ticket-1': result } : [result] });
    await push.processPushJobs();
    assert.equal(devices.size, 0); assert.equal(jobs.size, 0);
  }
});

test('missing tickets retry rather than silently losing an assignment notification', async () => {
  seed(); fakeResponse = async () => Response.json({ data: [] });
  await push.processPushJobs();
  assert.equal(jobs.get(1).state, 'pending'); assert.equal(jobs.get(1).last_error, 'MissingTickets');
});

test('concurrent wakeups in the same API process run one delivery batch', async () => {
  seed(); let release;
  fakeResponse = async () => { await new Promise(resolve => { release = resolve; }); return Response.json({ data: [{ status: 'ok', id: 'ticket-1' }] }); };
  const first = push.wakePushWorker();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await push.wakePushWorker(); assert.equal(requests.length, 1);
  release(); await first;
});
