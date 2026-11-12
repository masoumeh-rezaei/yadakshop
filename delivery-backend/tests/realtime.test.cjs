const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
Object.assign(process.env, { DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test', JWT_SECRET: 'realtime-tests-secret-at-least-thirty-two-characters' });
const pool = require('../dist/config/database.js').default;
const users = new Map([[1, { id: 1, role: 'ADMIN', is_active: 1 }], [2, { id: 2, role: 'DRIVER', is_active: 1 }], [3, { id: 3, role: 'DRIVER', is_active: 1 }], [4, { id: 4, role: 'DRIVER', is_active: 0 }]]);
pool.execute = async (_sql, [id]) => [[users.get(Number(id))].filter(Boolean)];
const realtime = require('../dist/realtime.js');
const clients = [];
let server, sockets, base;
const delay = () => new Promise(resolve => setTimeout(resolve, 50));
const event = (socket, name) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`Missing ${name}`)), 3000);
  socket.once(name, value => { clearTimeout(timeout); resolve(value); });
});
function connect(id, extras = {}) {
  const token = id === null ? undefined : jwt.sign({ sub: id }, process.env.JWT_SECRET);
  const client = io(base, { auth: { token, ...extras }, transports: ['websocket'], autoConnect: false, reconnection: false });
  clients.push(client);
  return client;
}
before(async () => {
  server = createServer((_req, res) => res.end('ok'));
  sockets = realtime.initializeRealtime(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { for (const client of clients) client.disconnect(); await new Promise(resolve => sockets.close(resolve)); await pool.end(); });

test('unauthenticated and inactive socket connections are rejected', async () => {
  for (const id of [null, 4]) {
    const client = connect(id);
    const rejected = event(client, 'connect_error');
    client.connect();
    assert.match((await rejected).message, /unauthorized|forbidden/);
    assert.equal(client.connected, false);
  }
});

test('assignment events arrive immediately at admins and only the assigned courier', async () => {
  const admin = connect(1), own = connect(2, { userId: 3, role: 'ADMIN' }), other = connect(3);
  await Promise.all([admin, own, other].map(client => { const ready = event(client, 'connect'); client.connect(); return ready; }));
  const leaks = [];
  other.on('tasks:changed', value => leaks.push(value));
  const delivered = [event(admin, 'tasks:changed'), event(own, 'tasks:changed')];
  realtime.emitTasksChanged({ driverId: 2, placeId: 10 });
  assert.deepEqual(await Promise.all(delivered), [{ driverId: 2, placeId: 10 }, { driverId: 2, placeId: 10 }]);
  await delay(); assert.deepEqual(leaks, []);
  for (const client of [admin, own, other]) client.disconnect();
});

test('driver sockets cannot receive fleet locations or other couriers completion details', async () => {
  const admin = connect(1), driver = connect(2);
  await Promise.all([admin, driver].map(client => { const ready = event(client, 'connect'); client.connect(); return ready; }));
  const leaks = [];
  driver.on('location:update', value => leaks.push(value));
  driver.on('task:completed', value => leaks.push(value));
  const location = event(admin, 'location:update');
  realtime.emitLocationUpdate({ id: 1, userId: 3, fullName: 'Other courier', phone: '', latitude: 35, longitude: 51, accuracy: 5, recordedAt: new Date().toISOString() });
  assert.equal((await location).userId, 3);
  const done = event(admin, 'task:completed');
  realtime.emitTaskCompleted({ id: 10, revision: 2, driverId: 3, driverName: 'Other courier', driverPhone: '', placeId: 20, placeName: 'Destination', completedAt: new Date() });
  assert.equal((await done).placeName, 'Destination');
  await delay(); assert.deepEqual(leaks, []);
  admin.disconnect(); driver.disconnect();
});

test('place invalidation contains no task identifiers and disabling an account disconnects its socket', async () => {
  const driver = connect(2);
  const ready = event(driver, 'connect'); driver.connect(); await ready;
  const invalidation = event(driver, 'tasks:changed');
  realtime.emitTasksChanged({ placeId: 10 });
  assert.deepEqual(await invalidation, {});
  const disconnected = event(driver, 'disconnect');
  realtime.disconnectUser(2);
  assert.equal(await disconnected, 'io server disconnect');
});
