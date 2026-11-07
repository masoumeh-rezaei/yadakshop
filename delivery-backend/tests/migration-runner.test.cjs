const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join, dirname, basename } = require('node:path');

function runMigration(filename) {
  const temporary = mkdtempSync(join(tmpdir(), 'delivery-migration-test-'));
  const output = join(temporary, 'queries.json');
  const preload = join(temporary, 'stub.cjs');
  writeFileSync(preload, `
    Object.assign(process.env, { DB_HOST: 'unused-test-host', DB_USER: 'test', DB_NAME: 'test', JWT_SECRET: 'migration-test-secret-at-least-32-characters' });
    const fs = require('node:fs');
    const calls = [];
    require(${JSON.stringify(require.resolve('mysql2/promise'))}).createConnection = async () => ({
      beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {},
      query: async sql => { calls.push(sql); fs.writeFileSync(${JSON.stringify(output)}, JSON.stringify(calls)); return [[{ count: 0 }]]; },
      end: async () => {},
    });
  `);
  try {
    const result = spawnSync(process.execPath, ['--require', preload, 'dist/scripts/migrate.js', filename], {
      cwd: resolve(__dirname, '..'), encoding: 'utf8', timeout: 5000,
    });
    return { ...result, queries: existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : [] };
  } finally {
    assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
    assert.match(basename(temporary), /^delivery-migration-test-/);
    rmSync(temporary, { recursive: true, force: true });
  }
}

test('targeted task migration does not rerun the saved-place seed', () => {
  const result = runMigration('002_create_driver_tasks.sql');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Applied 002_create_driver_tasks.sql/);
  assert.ok(result.queries.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS driver_tasks')));
  assert.ok(result.queries.every(sql => !sql.includes('INSERT INTO saved_places')));
});
test('unknown and traversal filenames are rejected before database access', () => {
  for (const filename of ['../migrations/001_create_saved_places.sql', '999_unknown.sql']) {
    const result = runMigration(filename);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exact migration filename/);
    assert.equal(result.queries.length, 0);
  }
});
