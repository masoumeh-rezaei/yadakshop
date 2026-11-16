const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate } = require('../dist/db/migrations.js');

function database(history = [], failure = false) {
  const writes = [];
  return { writes, query: async (query, values) => {
    const sql = typeof query === 'string' ? query : query.sql;
    if (sql.includes('DATABASE() AS name')) return [[{ name: 'test' }]];
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('information_schema.tables')) return [values[0] === 'peik_schema_migrations' ? [{}] : []];
    if (sql.startsWith('SELECT filename')) return [history];
    if (sql.includes('RELEASE_LOCK')) { writes.push('unlock'); return [[]]; }
    writes.push([sql, values]);
    if (failure && sql === 'ALTER TABLE sample ADD flag INT') throw new Error('DDL failure');
    return [[]];
  } };
}
const files = [{ filename: '005_feature.sql', checksum: 'a'.repeat(64), sql: 'ALTER TABLE sample ADD flag INT' }];
test('an applied migration is skipped on repeated deployments', async () => {
  const db = database([{ ...files[0], status: 'applied' }]);
  const result = await migrate(db, files);
  assert.equal(result.pending.length, 0);
  assert.ok(!db.writes.some(([sql]) => sql === files[0].sql));
});
test('changed history stops before any DDL or ledger writes', async () => {
  const db = database([{ ...files[0], checksum: 'b'.repeat(64), status: 'applied' }]);
  await assert.rejects(migrate(db, files), /changed or removed/);
  assert.deepEqual(db.writes, ['unlock']);
});
test('a partial DDL failure is marked failed and never blindly retried', async () => {
  const db = database([], true);
  await assert.rejects(migrate(db, files), /DDL failure/);
  assert.ok(db.writes.some(([sql]) => sql.includes("status='failed'")));
  assert.equal(db.writes.at(-1), 'unlock');
  const next = database([{ ...files[0], status: 'failed' }]);
  await assert.rejects(migrate(next, files), /explicit --retry/);
  assert.deepEqual(next.writes, ['unlock']);
});
test('a plan is read only and does not create a ledger', async () => {
  const db = database();
  assert.deepEqual(await migrate(db, files, { planOnly: true }), {
    pending: ['005_feature.sql'], baseline: [], applied: [],
  });
  assert.deepEqual(db.writes, ['unlock']);
});
test('migration lock contention prevents all writes', async () => {
  const db = database();
  const query = db.query;
  db.query = async (...args) => String(args[0]).includes('GET_LOCK') ? [[{ acquired: 0 }]] : query(...args);
  await assert.rejects(migrate(db, files), /holds the database lock/);
  assert.deepEqual(db.writes, []);
});
