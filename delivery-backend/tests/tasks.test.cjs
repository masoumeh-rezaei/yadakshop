const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test', JWT_SECRET: 'tasks-test-secret-at-least-thirty-two-characters' });
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../dist/config/database.js').default;
const events = [];
require('../dist/realtime.js').emitTasksChanged = change => events.push(change);
const users = new Map([
  [1, { id: 1, role: 'ADMIN', is_active: 1, phone: '09120000001', full_name: 'Admin' }],
  [2, { id: 2, role: 'DRIVER', is_active: 1, phone: '09120000002', full_name: 'Driver 2' }],
  [3, { id: 3, role: 'DRIVER', is_active: 1, phone: '09120000003', full_name: 'Driver 3' }],
  [4, { id: 4, role: 'DRIVER', is_active: 0, phone: '09120000004', full_name: 'Disabled' }],
]);
const places = new Map([[10, { id: 10, name: 'First place', latitude: 35.68, longitude: 51.38 }], [11, { id: 11, name: 'Second place', latitude: 35.69, longitude: 51.39 }]]);
let tasks = new Map();
let nextId = 1;
let releases = 0;
let rollbacks = 0;
let tableAvailable = true;
let server, base;
const sqlCalls = [];
const record = task => task && ({ ...task, driverName: users.get(task.driverId).full_name, driverPhone: users.get(task.driverId).phone, placeName: places.get(task.placeId).name, latitude: places.get(task.placeId).latitude, longitude: places.get(task.placeId).longitude });
function checkTable(sql) {
  sqlCalls.push(sql);
  if (!tableAvailable && sql.includes('driver_tasks')) throw Object.assign(new Error('missing test table'), { code: 'ER_NO_SUCH_TABLE' });
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
  return {
    beginTransaction: async () => { working = new Map([...tasks].map(([id, task]) => [id, { ...task }])); },
    commit: async () => { tasks = working; },
    rollback: async () => { rollbacks += 1; },
    release: () => { releases += 1; },
    execute: async (rawSql, params) => {
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      checkTable(sql);
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
          task = { id: nextId++, driverId: params[0], placeId: params[1], assignedBy: params[2], status: 'pending', revision: 1, assignedAt: new Date(), completedAt: null, updatedAt: new Date() };
          working.set(task.id, task);
        } else if (task.status !== 'pending') Object.assign(task, { status: 'pending', revision: task.revision + 1, assignedBy: params[3], assignedAt: new Date(), completedAt: null });
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
const assign = (driverId, placeId, assigned = true, userId = 1) => request('/assignment', userId, 'PUT', { driverId, placeId, assigned });

test('task APIs require authentication and drivers cannot administer assignments', async () => {
  assert.equal((await request('', null)).status, 401);
  assert.equal((await request('', 2)).status, 403);
  assert.equal((await assign(2, 10, true, 2)).status, 403);
  assert.equal((await request('/mine', 1)).status, 403);
  assert.equal((await request('/mine', 4)).status, 401);
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
test('assignment from either selector is idempotent and emits after commit', async () => {
  const first = await assign(2, 10);
  assert.equal(first.status, 200);
  assert.equal(first.body.data.placeName, 'First place');
  assert.equal(first.body.data.revision, 1);
  const second = await assign(2, 10);
  assert.equal(second.body.data.id, first.body.data.id);
  assert.equal(second.body.data.revision, 1);
  assert.equal(tasks.size, 1);
  assert.deepEqual(events.at(-1), { driverId: 2, placeId: 10 });
});
test('mobile list is scoped to the authenticated driver, ignoring forged query IDs', async () => {
  await assign(3, 11);
  const own = await request('/mine?driverId=3', 2);
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.data.map(task => task.driverId), [2]);
  assert.equal((await request('')).body.data.length, 2);
});
test('a driver cannot complete another driver task or supply an invalid revision', async () => {
  const ownTask = [...tasks.values()].find(task => task.driverId === 2);
  assert.equal((await request(`/${ownTask.id}/complete`, 3, 'PATCH', { revision: ownTask.revision })).status, 404);
  assert.equal((await request(`/${ownTask.id}/complete`, 2, 'PATCH', {})).status, 400);
  assert.equal(tasks.get(ownTask.id).status, 'pending');
});
test('completion is idempotent and completed tasks remain visible on both clients', async () => {
  const task = [...tasks.values()].find(item => item.driverId === 2);
  const result = await request(`/${task.id}/complete`, 2, 'PATCH', { revision: 1 });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.status, 'completed');
  assert.equal(result.body.data.revision, 2);
  const repeated = await request(`/${task.id}/complete`, 2, 'PATCH', { revision: 1 });
  assert.equal(repeated.body.data.revision, 2);
  assert.equal(repeated.body.data.completedAt, result.body.data.completedAt);
  assert.equal((await request('/mine', 2)).body.data[0].status, 'completed');
});
test('reassignment increments revision and a stale phone cannot complete the new task', async () => {
  const result = await assign(2, 10);
  assert.equal(result.body.data.status, 'pending');
  assert.equal(result.body.data.revision, 3);
  assert.equal((await request(`/${result.body.data.id}/complete`, 2, 'PATCH', { revision: 1 })).status, 409);
  assert.equal(tasks.get(result.body.data.id).status, 'pending');
});
test('unchecking cancels a pending task and removes its destination from the mobile list', async () => {
  const result = await assign(2, 10, false);
  assert.equal(result.body.data.status, 'cancelled');
  assert.equal((await request('/mine', 2)).body.data.length, 0);
  assert.equal((await request(`/${result.body.data.id}/complete`, 2, 'PATCH', { revision: result.body.data.revision })).status, 409);
  assert.equal((await assign(2, 10, false)).body.data.revision, result.body.data.revision);
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
