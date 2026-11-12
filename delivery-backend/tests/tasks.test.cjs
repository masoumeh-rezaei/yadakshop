const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test', JWT_SECRET: 'tasks-test-secret-at-least-thirty-two-characters' });
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../dist/config/database.js').default;
const events = [];
require('../dist/realtime.js').emitTasksChanged = change => events.push(change);
const completionEvents = [];
require('../dist/realtime.js').emitTaskCompleted = task => completionEvents.push({ ...task });
require('../dist/services/push.service.js').wakePushWorker = async () => {};
const users = new Map([
  [1, { id: 1, role: 'ADMIN', is_active: 1, phone: '09120000001', full_name: 'Admin' }],
  [2, { id: 2, role: 'DRIVER', is_active: 1, phone: '09120000002', full_name: 'Driver 2' }],
  [3, { id: 3, role: 'DRIVER', is_active: 1, phone: '09120000003', full_name: 'Driver 3' }],
  [4, { id: 4, role: 'DRIVER', is_active: 0, phone: '09120000004', full_name: 'Disabled' }],
]);
const places = new Map([[10, { id: 10, name: 'First place', latitude: 35.68, longitude: 51.38 }], [11, { id: 11, name: 'Second place', latitude: 35.69, longitude: 51.39 }]]);
let tasks = new Map();
let pushJobs = new Set();
let failEnqueue = false;
let nextId = 1;
let releases = 0;
let rollbacks = 0;
let tableAvailable = true;
let descriptionAvailable = true;
let server, base;
const sqlCalls = [];
const record = task => task && ({ ...task, driverName: users.get(task.driverId).full_name, driverPhone: users.get(task.driverId).phone, placeName: places.get(task.placeId).name, latitude: places.get(task.placeId).latitude, longitude: places.get(task.placeId).longitude });
function checkTable(sql) {
  sqlCalls.push(sql);
  if (!tableAvailable && sql.includes('driver_tasks')) throw Object.assign(new Error('missing test table'), { code: 'ER_NO_SUCH_TABLE' });
  if (!descriptionAvailable && sql.includes('description')) throw Object.assign(new Error('missing test column'), { code: 'ER_BAD_FIELD_ERROR' });
}
function read(sql, params, source) {
  checkTable(sql);
  if (sql.includes('FROM users WHERE id')) return [[users.get(Number(params[0]))].filter(Boolean)];
  if (sql.includes('WHERE t.driver_id = ? AND t.place_id = ?')) return [[...source.values()].filter(task => task.driverId === params[0] && task.placeId === params[1]).map(record)];
  if (sql.includes("t.status <> 'cancelled'")) return [[...source.values()].filter(task => task.status !== 'cancelled' && (!params.length || task.driverId === params[0])).map(record)];
  throw new Error('Unexpected read query: ' + sql);
}
pool.execute = async (sql, params) => read(sql, params, tasks);
pool.query = async (sql) => { checkTable(sql); return [[]]; };
pool.getConnection = async () => {
  let working;
  let workingPushJobs;
  return {
    beginTransaction: async () => { working = new Map([...tasks].map(([id, task]) => [id, { ...task }])); workingPushJobs = new Set(pushJobs); },
    commit: async () => { tasks = working; pushJobs = workingPushJobs; },
    rollback: async () => { rollbacks += 1; },
    release: () => { releases += 1; },
    execute: async (rawSql, params) => {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      checkTable(sql);
      if (sql.startsWith('INSERT IGNORE INTO task_push_jobs')) {
        if (failEnqueue) throw new Error('Simulated outbox failure');
        workingPushJobs.add(`${params[0]}:${params[1]}`);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT role,')) {
        assert.match(sql, /FOR UPDATE$/);
        const user = users.get(params[0]);
        return [user ? [{ role: user.role, isActive: user.is_active }] : []];
      }
      if (sql.startsWith('SELECT id FROM saved_places')) {
        assert.match(sql, /FOR UPDATE$/);
        return [places.has(params[0]) ? [{ id: params[0] }] : []];
      }
      if (sql.startsWith('INSERT INTO driver_tasks')) {
        let task = [...working.values()].find(item => item.driverId === params[0] && item.placeId === params[1]);
        if (!task) {
          task = { id: nextId++, driverId: params[0], placeId: params[1], assignedBy: params[2], description: params[3], status: 'pending', revision: 1, assignedAt: new Date(), completedAt: null, updatedAt: new Date() };
          working.set(task.id, task);
        } else if (task.status !== 'pending') Object.assign(task, { status: 'pending', revision: task.revision + 1, assignedBy: params[5], description: params[4], assignedAt: new Date(), completedAt: null });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("UPDATE driver_tasks SET status = 'cancelled'")) {
        const task = [...working.values()].find(item => item.driverId === params[0] && item.placeId === params[1] && item.status === 'pending');
        if (task) Object.assign(task, { status: 'cancelled', completedAt: null, revision: task.revision + 1 });
        return [{ affectedRows: task ? 1 : 0 }];
      }
      if (sql.startsWith('SELECT driver_id AS driverId')) {
        assert.match(sql, /FOR UPDATE$/);
        const task = working.get(params[0]);
        return [task && (params.length === 1 || task.driverId === params[1]) ? [{ ...task }] : []];
      }
      if (sql.startsWith("UPDATE driver_tasks SET status = 'completed'")) {
        const task = working.get(params[0]);
        if (task?.status === 'pending') Object.assign(task, { status: 'completed', completedAt: new Date(), revision: task.revision + 1 });
        return [{ affectedRows: 1 }];
      }
      return read(sql, params, working);
    },
  };
};
before(async () => {
  const app = require('../dist/app.js').default;
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/tasks`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
async function request(path, userId = 1, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(userId === null ? {} : { Authorization: 'Bearer ' + jwt.sign({ sub: userId }, process.env.JWT_SECRET) }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const assign = (driverId, placeId, assigned = true, userId = 1, description, revision) => request('/assignment', userId, 'PUT', { driverId, placeId, assigned, description, revision });

test('task APIs require authentication and drivers cannot administer assignments', async () => {
  assert.equal((await request('', null)).status, 401);
  assert.equal((await request('', 2)).status, 403);
  assert.equal((await assign(2, 10, true, 2)).status, 403);
  assert.equal((await request('/mine', 1)).status, 403);
  assert.equal((await request('/mine', 4)).status, 401);
  assert.equal((await request('/1/complete', 1, 'PATCH', { revision: 1 })).status, 403);
});
test('task description capabilities are explicit and restricted to authenticated administrators', async () => {
  assert.equal((await request('/capabilities', null)).status, 401);
  assert.equal((await request('/capabilities', 2)).status, 403);
  const result = await request('/capabilities');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.data, { descriptions: true });
});
test('reject malformed, non-driver, inactive-driver and missing-place assignments', async () => {
  for (const body of [{ driverId: '2', placeId: 10, assigned: true }, { driverId: 2, placeId: 10, assigned: 'true' }, { driverId: 0, placeId: 10, assigned: true }]) {
    assert.equal((await request('/assignment', 1, 'PUT', body)).status, 400);
  }
  const count = events.length;
  assert.equal((await assign(1, 10)).status, 404);
  assert.equal((await assign(4, 10)).status, 409);
  assert.equal((await assign(2, 99)).status, 404);
  assert.equal(events.length, count);
  assert.ok(rollbacks >= 3);
});

test('reject non-text or oversized descriptions and invalid cancellation revisions before mutations', async () => {
  const count = events.length;
  for (const description of [12, false, {}, [], 'a'.repeat(2001)]) {
    assert.equal((await assign(2, 10, true, 1, description)).status, 400);
  }
  for (const revision of [0, -1, '1', null, 1.5]) {
    assert.equal((await assign(2, 10, false, 1, undefined, revision)).status, 400);
  }
  assert.equal(events.length, count);
  assert.equal(tasks.size, 0);
});
test('assignment from either selector is idempotent and emits after commit', async () => {
  const first = await assign(2, 10, true, 1, '  بسته را از نگهبانی دریافت کنید.\nقبل از رسیدن تماس بگیرید.  ');
  assert.equal(first.status, 200);
  assert.equal(first.body.data.placeName, 'First place');
  assert.equal(first.body.data.revision, 1);
  assert.equal(first.body.data.description, 'بسته را از نگهبانی دریافت کنید.\nقبل از رسیدن تماس بگیرید.');
  const second = await assign(2, 10, true, 1, 'A duplicate request must preserve the original instructions');
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(second.body.data.revision, 1);
  assert.equal(second.body.data.description, first.body.data.description);
  assert.equal(tasks.size, 1);
  assert.equal(pushJobs.size, 1);
  assert.deepEqual(events.at(-1), { driverId: 2, placeId: 10 });
});
test('mobile list is scoped to the authenticated driver, ignoring forged query IDs', async () => {
  await assign(3, 11);
  const own = await request('/mine?driverId=3', 2);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.data.map(task => task.driverId), [2]);
  assert.equal(own.body.data[0].description, 'بسته را از نگهبانی دریافت کنید.\nقبل از رسیدن تماس بگیرید.');
  assert.equal((await request('/mine', 3)).body.data[0].description, null);
  assert.equal((await request('')).body.data.length, 2);
});
test('a driver cannot complete another driver task or supply an invalid revision', async () => {
  const ownTask = [...tasks.values()].find(task => task.driverId === 2);
  assert.equal((await request(`/${ownTask.id}/complete`, 3, 'PATCH', { revision: ownTask.revision })).status, 404);
  assert.equal((await request(`/${ownTask.id}/complete`, 2, 'PATCH', {})).status, 400);
  assert.equal(tasks.get(ownTask.id).status, 'pending');
});
test('completion is idempotent and completed tasks remain visible on both clients', async () => {
  const before = completionEvents.length;
  const task = [...tasks.values()].find(item => item.driverId === 2);
  const result = await request(`/${task.id}/complete`, 2, 'PATCH', { revision: 1 });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'completed');
  assert.equal(result.body.data.revision, 2);
  const repeated = await request(`/${task.id}/complete`, 2, 'PATCH', { revision: 1 });
  assert.equal(repeated.body.data.revision, 2);
  assert.equal(repeated.body.data.completedAt, result.body.data.completedAt);
  assert.equal(completionEvents.length, before + 1);
  assert.equal(completionEvents.at(-1).id, task.id);
  assert.equal(tasks.get(task.id).status, 'completed');
  assert.equal((await request('/mine', 2)).body.data[0].status, 'completed');
  assert.equal((await request('/mine', 2)).body.data[0].description, result.body.data.description);
});
test('reassignment increments revision and a stale phone cannot complete the new task', async () => {
  const result = await assign(2, 10);
  assert.equal(result.body.data.status, 'pending');
  assert.equal(result.body.data.revision, 3);
  assert.equal(result.body.data.description, null);
  assert.equal((await request(`/${result.body.data.id}/complete`, 2, 'PATCH', { revision: 1 })).status, 409);
  assert.equal(tasks.get(result.body.data.id).status, 'pending');
});

test('stale cancellation cannot remove a newly assigned revision', async () => {
  const task = [...tasks.values()].find(item => item.driverId === 2);
  const result = await assign(2, 10, false, 1, undefined, 1);
  assert.equal(result.status, 409);
  assert.equal(tasks.get(task.id).status, 'pending');
});
test('unchecking cancels a pending task and removes its destination from the mobile list', async () => {
  const revision = [...tasks.values()].find(item => item.driverId === 2).revision;
  const result = await assign(2, 10, false, 1, undefined, revision);
  assert.equal(result.body.data.status, 'cancelled');
  assert.equal((await request('/mine', 2)).body.data.length, 0);
  assert.equal((await request(`/${result.body.data.id}/complete`, 2, 'PATCH', { revision: result.body.data.revision })).status, 409);
  assert.equal((await assign(2, 10, false, 1, undefined, revision)).body.data.revision, result.body.data.revision);
});

test('reopening a cancelled task stores fresh instructions and supports an optional blank description', async () => {
  const reopened = await assign(2, 10, true, 1, 'توضیحات جدید');
  assert.equal(reopened.body.data.description, 'توضیحات جدید');
  assert.equal((await request('/mine', 2)).body.data[0].description, 'توضیحات جدید');
  await assign(2, 10, false);
  const blank = await assign(2, 10, true, 1, '   \n  ');
  assert.equal(blank.body.data.description, null);
  assert.equal(blank.body.data.status, 'pending');
});

test('missing description migration fails clearly instead of dropping instructions', async () => {
  descriptionAvailable = false;
  try {
    const response = await request('/mine', 2);
    assert.equal(response.status, 503);
    assert.match(response.body.message, /Migration/);
    const originalError = console.error;
    console.error = () => {};
    try { assert.equal((await fetch(base.replace('/api/tasks', '/api/health'))).status, 503); }
    finally { console.error = originalError; }
  } finally { descriptionAvailable = true; }
});
test('missing required migration returns a clear service-unavailable response', async () => {
  tableAvailable = false;
  const result = await request('/mine', 2);
  assert.equal(result.status, 503);
  assert.match(result.body.message, /Migration/);
  tableAvailable = true;
  assert.ok(releases >= 8);
  assert.ok(sqlCalls.every(sql => !/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)/i.test(sql)));
});

test('deployment health requires the task schema and refuses an unprepared database', async () => {
  const healthUrl = base.replace('/api/tasks', '/api/health');
  assert.equal((await fetch(healthUrl)).status, 200);
  tableAvailable = false;
  const originalError = console.error;
  console.error = () => {};
  try { assert.equal((await fetch(healthUrl)).status, 503); }
  finally { tableAvailable = true; console.error = originalError; }
});

test('assignment and its notification outbox commit atomically', async () => {
  const count = tasks.size;
  const jobCount = pushJobs.size;
  const eventCount = events.length;
  failEnqueue = true;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await assign(3, 10)).status, 500);
    assert.equal(tasks.size, count);
    assert.equal(pushJobs.size, jobCount);
    assert.equal(events.length, eventCount);
  } finally { failEnqueue = false; console.error = originalError; }
});
