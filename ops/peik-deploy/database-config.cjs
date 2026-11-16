'use strict';
// Invoked as peikydsp, never root: dependencies belong to the application artifact.
const path = require('node:path');
const backend = path.resolve(process.argv[2]);
const env = require(path.join(backend, 'node_modules/dotenv')).parse(
  require('node:fs').readFileSync('/opt/peik-deploy/shared/backend.env'));
for (const name of ['DB_HOST', 'DB_USER', 'DB_NAME']) {
  if (!env[name]) throw new Error('Missing database configuration');
}
process.stdout.write(JSON.stringify({ host: env.DB_HOST, port: env.DB_PORT || '3306',
  user: env.DB_USER, password: env.DB_PASSWORD || '', database: env.DB_NAME }));
