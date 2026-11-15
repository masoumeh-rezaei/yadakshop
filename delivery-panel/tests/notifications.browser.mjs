import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const output = resolve(root, '../../artifacts/task-sound-check');
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const filename = resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!filename.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' })[extname(filename)] || 'application/octet-stream'); response.end(await readFile(filename)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const errors = [];
const timestamp = new Date(Date.now() - 600000).toISOString();
const users = [{ id: 1, fullName: 'مدیر آزمایشی', phone: '09000000001', role: 'ADMIN', isActive: 1 }, { id: 2, fullName: 'پیک آزمایشی', phone: '09000000002', role: 'DRIVER', isActive: 1, hasLocationHistory: true }];
const makeTask = (id, status = 'pending') => ({ id, driverId: 2, driverName: users[1].fullName, driverPhone: users[1].phone, placeId: id, placeName: `مقصد آزمایشی ${id}`, latitude: 35.7, longitude: 51.4, status, revision: status === 'completed' ? 2 : 1, assignedAt: timestamp, completedAt: status === 'completed' ? new Date().toISOString() : null, updatedAt: timestamp });
let tasks = [makeTask(1), makeTask(2, 'completed')];
const sockets = new Set();
let acceptSockets = true;
let taskReads = 0;
let slowPage = null;
await context.addInitScript(() => {
  sessionStorage.setItem('delivery_admin_token', 'isolated-browser-fixture');
  window.__notices = []; window.__oscillators = 0; window.__audio = [];
  const NativeAudio = window.AudioContext;
  window.AudioContext = class extends NativeAudio {
    constructor(...args) { super(...args); this.__analyser = this.createAnalyser(); this.__analyser.fftSize = 2048; window.__audio.push(this); }
    createOscillator() { window.__oscillators++; return super.createOscillator(); }
    createGain() {
      const gain = super.createGain(); const connect = gain.connect.bind(gain);
      gain.connect = (target, ...args) => { if (target === this.destination) connect(this.__analyser); return connect(target, ...args); };
      return gain;
    }
  };
  window.__sampleAudio = () => Math.max(0, ...window.__audio.map(audio => { const values = new Float32Array(2048); audio.__analyser.getFloatTimeDomainData(values); return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length); }));
  window.Notification = class {
    static get permission() { return localStorage.getItem('__fixture_permission') || 'default'; }
    static requestPermission() { localStorage.setItem('__fixture_permission', 'granted'); return Promise.resolve('granted'); }
    constructor(title, options) { this.title = title; this.options = options; window.__notices.push(this); }
    close() { this.closed = true; this.onclose?.(); }
  };
});
await context.routeWebSocket('**/socket.io/**', socket => {
  if (!acceptSockets) { socket.close(); return; }
  sockets.add(socket);
  socket.send('0' + JSON.stringify({ sid: `fixture-${sockets.size}`, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 }));
  socket.onMessage(message => {
    if (String(message).startsWith('40')) socket.send('40' + JSON.stringify({ sid: 'authenticated-fixture' }));
    if (message === '2') socket.send('3');
  });
  socket.onClose(() => sockets.delete(socket));
});
await context.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data;
  if (path === '/api/auth/me') data = users[0];
  else if (path === '/api/users') data = users;
  else if (path === '/api/places') data = [];
  else if (path === '/api/locations/latest') data = [{ id: 1, userId: 2, phone: users[1].phone, fullName: users[1].fullName, latitude: 35.68, longitude: 51.38, accuracy: 5, recordedAt: timestamp }];
  else if (path.endsWith('/history/days') || path.endsWith('/history')) data = [];
  else if (path === '/api/tasks/capabilities') { await route.fulfill({ status: 404, json: { success: false } }); return; }
  else if (path === '/api/tasks') { data = tasks; taskReads++; if (route.request().frame().page() === slowPage) await new Promise(resolve => setTimeout(resolve, 6500)); }
  else throw new Error(`Unexpected API request: ${path}`);
  await route.fulfill({ json: { success: true, data } }).catch(() => {});
});
const panels = [];
const emit = (event, data = {}) => { for (const socket of sockets) socket.send('42' + JSON.stringify([event, data])); };
async function waitFor(fn, description, timeout = 10000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`Timed out: ${description}`); }
const totals = async expression => (await Promise.all(panels.map(page => page.evaluate(expression)))).reduce((sum, count) => sum + count, 0);
const desktopCount = () => totals(() => window.__notices.filter(notice => notice.options.tag.startsWith('delivery-completed-')).length);
const oscillators = () => totals(() => window.__oscillators);
async function completed(id) { const task = makeTask(id, 'completed'); tasks = [...tasks.filter(item => item.id !== id), task]; emit('tasks:changed'); return task; }
try {
  for (let index = 0; index < 2; index++) {
    const page = await context.newPage(); panels.push(page); page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.PANEL_URL || `http://127.0.0.1:${server.address().port}/`);
    await page.locator('.connection-badge.connected').waitFor();
    await page.locator('.driver-item').first().waitFor();
    assert.equal(await page.evaluate(() => window.__audio.length), 0, 'No sound context should autoplay on initial load.');
    await page.locator('.task-notifications-toggle').click();
    await page.locator('.task-notifications').waitFor();
  }
  assert.equal(await desktopCount(), 0, 'Historical completed tasks must not alert.');
  await panels[0].getByRole('button', { name: 'آزمایش اعلان', exact: true }).click();
  await waitFor(() => panels[0].evaluate(() => window.__sampleAudio() > 0.001), 'real Web Audio signal from test chime');
  assert.equal(await panels[0].evaluate(() => window.__notices.filter(notice => notice.options.tag.startsWith('delivery-alert-test-')).length), 1);
  await panels[0].waitForTimeout(1600);
  const baseline = await oscillators();
  for (const page of panels) await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const otherTab = await context.newPage(); await otherTab.goto('about:blank'); await otherTab.bringToFront();
  const first = await completed(1); emit('tasks:changed'); emit('tasks:changed');
  await waitFor(async () => await desktopCount() === 1, 'one completion desktop notification across two tabs');
  await waitFor(async () => (await Promise.all(panels.map(page => page.evaluate(() => window.__sampleAudio())))).some(value => value > 0.001), 'audible Web Audio signal while panel is hidden');
  assert.equal(await oscillators() - baseline, 5, 'Exactly one chime should be scheduled across tabs.');
  for (const page of panels) assert.match(await page.title(), /🔔/);
  const notices = (await Promise.all(panels.map(page => page.evaluate(() => window.__notices.filter(notice => notice.options.tag.startsWith('delivery-completed-')).map(notice => ({ title: notice.title, options: notice.options })))))).flat();
  assert.match(notices[0].options.body, /پیک آزمایشی/); assert.match(notices[0].options.body, /مقصد آزمایشی 1/); assert.equal(notices[0].options.requireInteraction, true);
  emit('task:completed', first); emit('tasks:changed'); await panels[0].waitForTimeout(400);
  assert.equal(await desktopCount(), 1); assert.equal(await oscillators() - baseline, 5);
  console.log('PASS: actual Web Audio signal and persistent desktop API notification arrive in hidden tabs from legacy task-change events; repeated rich events/polls and a second panel tab produce one external alert.');
  const owner = await (async () => { for (const page of panels) if (await page.evaluate(() => window.__notices.some(notice => notice.options.tag.startsWith('delivery-completed-')))) return page; })();
  await owner.evaluate(() => window.__notices.find(notice => notice.options.tag.startsWith('delivery-completed-')).onclick());
  await owner.locator('.tasks-page').waitFor();
  await owner.locator('.task-card.task-highlighted').waitFor();
  await panels[0].getByRole('button', { name: 'بی‌صدا کردن اعلان‌ها', exact: true }).click();
  await panels[1].getByRole('button', { name: 'فعال‌سازی صدای اعلان‌ها', exact: true }).waitFor();
  const mutedBaseline = await oscillators();
  await completed(3);
  await waitFor(async () => await desktopCount() === 2, 'muted desktop notification');
  assert.equal(await oscillators(), mutedBaseline);
  const muted = (await Promise.all(panels.map(page => page.evaluate(() => window.__notices.filter(notice => notice.options.tag.endsWith('3:2')).map(notice => notice.options.silent))))).flat();
  assert.deepEqual(muted, [true]);
  await panels[0].evaluate(() => { localStorage.setItem('__fixture_permission', 'denied'); window.dispatchEvent(new Event('focus')); });
  await panels[1].evaluate(() => window.dispatchEvent(new Event('focus')));
  await panels[0].getByRole('button', { name: 'فعال‌سازی صدای اعلان‌ها', exact: true }).click();
  await panels[0].waitForTimeout(1600);
  const deniedBaseline = await oscillators();
  await completed(4);
  await waitFor(async () => await oscillators() > deniedBaseline, 'sound despite denied desktop permission');
  assert.equal(await desktopCount(), 2);
  console.log('PASS: notification click opens the completed task; mute synchronizes across tabs; sound remains available when OS notification permission is denied.');
  await panels[0].waitForTimeout(1600);
  acceptSockets = false; for (const socket of [...sockets]) socket.close(); sockets.clear();
  await panels[0].locator('.connection-badge.disconnected').waitFor();
  const beforeRead = taskReads; const disconnectedBaseline = await oscillators();
  tasks.push(makeTask(5, 'completed'));
  await waitFor(async () => await oscillators() > disconnectedBaseline, 'background polling completion while socket is down', 10000);
  assert.ok(taskReads > beforeRead);
  assert.equal(await desktopCount(), 2);
  console.log('PASS: disconnected background tabs still reconcile task completion through the five-second fallback.');
  slowPage = owner;
  tasks.push(makeTask(6, 'completed'));
  await owner.getByRole('button', { name: 'به‌روزرسانی وظایف', exact: true }).click();
  await waitFor(async () => await owner.locator('.task-notifications-list').getByText('پیک آزمایشی وظیفهٔ «مقصد آزمایشی 6» را انجام داد.', { exact: true }).count() === 1, 'slow reads finish despite five-second background polls', 12000);
  slowPage = null;
  console.log('PASS: a 6.5-second task read completes despite five-second polling; slower networks are not starved by repeated aborts.');
  await panels[0].getByRole('button', { name: 'بی‌صدا کردن اعلان‌ها', exact: true }).click();
  await panels[0].reload(); await panels[0].locator('.driver-item').first().waitFor();
  await panels[0].locator('.task-notifications-toggle').click();
  await panels[0].getByRole('button', { name: 'فعال‌سازی صدای اعلان‌ها', exact: true }).waitFor();
  assert.equal(await panels[0].evaluate(() => window.__oscillators), 0);
  assert.equal(await panels[0].evaluate(() => window.__notices.length), 0);
  await panels[0].evaluate(() => { localStorage.setItem('__fixture_permission', 'granted'); window.dispatchEvent(new Event('focus')); });
  await panels[1].evaluate(() => window.dispatchEvent(new Event('focus')));
  for (let id = 100; id < 120; id++) {
    const task = makeTask(id, 'completed'); tasks.push(task);
    emit('task:completed', task); emit('task:completed', task); emit('task:completed', task);
  }
  await waitFor(async () => await totals(() => window.__notices.filter(notice => /delivery-completed-1-1[01]\d:2$/.test(notice.options.tag)).length) >= 20, 'twenty concurrent cross-tab completion deliveries');
  const burst = (await Promise.all(panels.map(page => page.evaluate(() => window.__notices.filter(notice => /delivery-completed-1-1[01]\d:2$/.test(notice.options.tag)).map(notice => notice.options.tag))))).flat();
  assert.equal(burst.length, 20); assert.equal(new Set(burst).size, 20);
  console.log('PASS: twenty simultaneous completions repeated three times across two renderer tabs produce exactly twenty desktop deliveries through native IndexedDB transactions.');
  await panels[0].screenshot({ path: resolve(output, 'settings.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: sound preference persists across reload and old completed tasks do not replay; no browser runtime errors. Desktop display was instrumented, not verified on physical Windows hardware.');
} catch (error) {
  console.log(JSON.stringify({ sockets: sockets.size, taskReads, errors, pages: await Promise.all(panels.map(page => page.evaluate(() => ({ title: document.title, permission: Notification.permission, sounds: window.__oscillators, notices: window.__notices.map(notice => ({ title: notice.title, tag: notice.options.tag })), audio: window.__audio.map(context => context.state), ledger: localStorage.getItem('delivery.completed-notifications.1'), inbox: document.querySelector('.task-notifications-list')?.textContent })))) }));
  throw error;
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
