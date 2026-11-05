const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// These tests exercise HTTP routing and authorization without connecting to a real database.
Object.assign(process.env, {
  DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test',
  JWT_SECRET: 'location-history-test-secret-at-least-32-characters',
});
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../dist/config/database.js').default;
const { historyWindow, tehranDayKey, tehranDayStart } = require('../dist/utils/location-history.js');
let server, baseUrl;
let records = [];
let lookups = 0;
let releases = 0;
let historyQueries = 0;
let failSeek = false;

pool.execute = async (sql, params) => {
  if (sql.includes('FROM users WHERE id')) return [[{
    id: Number(params[0]), phone: '09000000000', full_name: 'Test', is_active: 1,
    role: Number(params[0]) === 1 ? 'ADMIN' : 'DRIVER',
  }]];
  historyQueries += 1;
  assert.match(sql, /recorded_at >= \? AND l.recorded_at < \?/);
  return [records.filter((record) => record.userId === params[0]
    && record.recordedAt >= params[1] && record.recordedAt < params[2])];
};
pool.getConnection = async () => ({
  execute: async (_sql, [userId, before]) => {
    lookups += 1;
    if (failSeek) throw new Error('Simulated query failure');
    return [records.filter((record) => record.userId === userId && record.recordedAt < before)
      .sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 1)];
  },
  release: () => { releases += 1; },
});

before(async () => {
  const app = express();
  app.use('/api/locations', require('../dist/routes/locations.routes.js').default);
  app.use((_error, _req, res, _next) => res.status(500).json({ success: false }));
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/locations`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});
const get = (path, role = 1) => fetch(`${baseUrl}${path}`, {
  headers: role === null ? {} : { authorization: `Bearer ${jwt.sign({ sub: role }, process.env.JWT_SECRET)}` },
});

test('default is a rolling 24-hour window; reject missing, invalid, reversed and oversized bounds', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const window = historyWindow(undefined, undefined, now);
  assert.equal(window.to.toISOString(), now.toISOString());
  assert.equal(window.to - window.from, 86_400_000);
  for (const [from, to] of [
    ['2026-11-05', undefined], ['2026-11-05T12:00:00', '2026-11-05T13:00:00'],
    ['bad', 'worse'], [[], []], ['2026-11-05T12:00:00Z', '2026-11-05T11:00:00Z'],
    ['2026-11-05T12:00:00Z', '2026-11-07T12:00:00Z'],
    ['2026-02-30T12:00:00Z', '2026-03-02T13:00:00Z'],
  ]) assert.equal(historyWindow(from, to), null);
});

test('Tehran dates handle midnight and historical daylight-saving offsets', () => {
  assert.equal(tehranDayKey(new Date('2026-11-04T20:30:00Z')), '2026-11-05');
  assert.equal(tehranDayStart('2026-11-05').toISOString(), '2026-11-04T20:30:00.000Z');
  assert.equal(tehranDayStart('2021-07-01').toISOString(), '2021-06-30T19:30:00.000Z');
  assert.equal(tehranDayStart('2021-03-22').toISOString(), '2021-03-21T20:30:00.000Z');
});

test('both endpoints enforce administrator authorization and validate driver IDs', async () => {
  for (const path of ['/2/history', '/2/history/days']) {
    assert.equal((await get(path, null)).status, 401);
    assert.equal((await get(path, 2)).status, 403);
  }
  for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) {
    assert.equal((await get(`/${id}/history`)).status, 400);
    assert.equal((await get(`/${id}/history/days`)).status, 400);
  }
});

test('ten latest populated days skip gaps and other couriers with at most ten lookups', async () => {
  records = [];
  const expected = [];
  for (let index = 0; index < 12; index += 1) {
    const day = tehranDayKey(new Date(Date.now() - (index * 3 + 1) * 86_400_000));
    expected.push({ date: day });
    for (const hour of [0, 12, 23]) records.push({
      id: records.length + 1, userId: 2,
      recordedAt: new Date(tehranDayStart(day).getTime() + hour * 3_600_000),
    });
  }
  records.push({ id: 99, userId: 3, recordedAt: new Date(Date.now() - 1000) });
  lookups = 0;
  const response = await get('/2/history/days');
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, expected.slice(0, 10));
  assert.equal(lookups, 10);
  assert.equal(releases, 1);
});

test('selected-day API excludes the next midnight and rejects invalid windows before querying', async () => {
  const day = '2026-11-05';
  const start = new Date(`${day}T12:00:00+03:30`);
  const end = new Date('2026-11-06T00:00:00+03:30');
  records = [
    { id: 1, userId: 2, recordedAt: new Date(start.getTime() - 1) },
    { id: 2, userId: 2, recordedAt: start },
    { id: 3, userId: 2, recordedAt: new Date(end.getTime() - 1) },
    { id: 4, userId: 2, recordedAt: end },
    { id: 5, userId: 3, recordedAt: start },
  ];
  const query = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
  const response = await get(`/2/history?${query}`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.map((point) => point.id), [2, 3]);
  const count = historyQueries;
  assert.equal((await get('/2/history?from=bad&to=bad')).status, 400);
  assert.equal(historyQueries, count);
});

test('empty histories return no calendar cells and connections release after query failures', async () => {
  records = [];
  lookups = 0;
  assert.deepEqual((await (await get('/2/history/days')).json()).data, []);
  assert.equal(lookups, 1);
  const count = releases;
  failSeek = true;
  assert.equal((await get('/2/history/days')).status, 500);
  assert.equal(releases, count + 1);
  failSeek = false;
});
