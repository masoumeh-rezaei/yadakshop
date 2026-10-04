'use strict';
// Read-only schema, health, and authenticated Socket.IO checks. Never prints tokens or rows.
const path = require('node:path');
const backend = process.argv[2];
const mode = process.argv[3];
if (!backend || !['candidate', 'production'].includes(mode)) process.exit(64);
const load = name => require(require.resolve(name, { paths: [backend] }));
load('dotenv').config({ path: '/opt/peik-deploy/shared/backend.env', quiet: true });
const jwt = load('jsonwebtoken');
const pool = load('mysql2/promise').createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 1, connectTimeout: 8000,
});
const port = mode === 'candidate' ? 3001 : 3000;
async function socketCheck(url, token, expectAllowed) {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => finish(new Error('Socket timeout')), 12000);
    let complete = false;
    function finish(error) {
      if (complete) return;
      complete = true; clearTimeout(timeout); socket.close();
      error ? reject(error) : resolve();
    }
    socket.onmessage = event => {
      const frame = String(event.data);
      if (frame.startsWith('0')) socket.send('40' + JSON.stringify({ token }));
      else if (frame === '2') socket.send('3');
      else if (frame.startsWith('40')) finish(expectAllowed ? null : new Error('Unauthenticated socket accepted'));
      else if (frame.startsWith('44')) {
        let error; try { error = JSON.parse(frame.slice(2)); } catch { return finish(new Error('Invalid socket response')); }
        finish(!expectAllowed && error.message === 'unauthorized' ? null : new Error('Socket authentication failed'));
      }
    };
    socket.onerror = () => finish(new Error('Socket connection failed'));
    socket.onclose = () => { if (!complete) finish(new Error('Socket closed before authentication')); };
  });
}
(async () => {
  try {
    await pool.query('SELECT id, phone, password_hash, full_name, role, is_active, created_at, updated_at FROM users LIMIT 0');
    await pool.query('SELECT id, user_id, latitude, longitude, accuracy, recorded_at FROM locations LIMIT 0');
    await pool.query('SELECT id, name, latitude, longitude FROM saved_places LIMIT 0');
    const [admins] = await pool.query("SELECT id, phone, full_name FROM users WHERE role='ADMIN' AND is_active=1 LIMIT 1");
    if (!admins.length) throw new Error('No active admin available for read-only check');
    const token = jwt.sign({ phone: admins[0].phone, role: 'ADMIN' }, process.env.JWT_SECRET, { subject: String(admins[0].id), expiresIn: '90s' });
    const urls = [`http://127.0.0.1:${port}`];
    if (mode === 'production') urls.push('https://peik.ydsp.ir');
    for (const url of urls) {
      const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      if (!response.ok || !data.success || data.database !== 'connected') throw new Error('Health check failed');
      for (const route of ['/api/auth/me', '/api/locations/latest', '/api/places']) {
        const authenticated = await fetch(url + route, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(8000) });
        const result = await authenticated.json();
        if (!authenticated.ok || !result.success) throw new Error('Authenticated API check failed');
      }
      const ws = url.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
      await socketCheck(ws, token, true);
      await socketCheck(ws, '', false);
    }
    console.log('CHECK_OK schema health authenticated_api authenticated_socket unauthorized_socket ' + mode);
  } catch (error) {
    // Do not expose DB errors, environment values, JWTs or personal data.
    console.error('CHECK_FAILED ' + mode);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
