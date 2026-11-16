const { test } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { resolve } = require('node:path');
const { loadMigrations, migrate } = require('../dist/db/migrations.js');

test('MariaDB: legacy adoption, pending DDL, repeat deploy, checksum and partial-failure recovery', {
  skip: !process.env.MIGRATION_TEST_DB_HOST,
}, async () => {
  const admin = await mysql.createConnection({ host: process.env.MIGRATION_TEST_DB_HOST,
    user: 'root', password: process.env.MIGRATION_TEST_DB_PASSWORD || '', multipleStatements: true });
  const name = 'peik_migration_test_' + process.pid;
  let db;
  try {
    await admin.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = await mysql.createConnection({ host: process.env.MIGRATION_TEST_DB_HOST,
      user: 'root', password: process.env.MIGRATION_TEST_DB_PASSWORD || '', database: name, multipleStatements: true });
    await db.query('CREATE TABLE users (id INT UNSIGNED PRIMARY KEY) ENGINE=InnoDB');
    const files = await loadMigrations(resolve(__dirname, '../migrations'));
    // A new installation applies every file, while an old installation must
    // preserve operator edits to the original seeded data.
    await migrate(db, files);
    const [first] = await db.query('SELECT COUNT(*) AS count FROM peik_schema_migrations WHERE status="applied"');
    assert.equal(first[0].count, files.length);
    await db.query('DROP TABLE task_push_jobs; DROP TABLE push_devices; ALTER TABLE driver_tasks DROP COLUMN description; DROP TABLE peik_schema_migrations');
    await db.query('UPDATE saved_places SET name="Operator edited place",latitude=1 WHERE id=1');
    const [before] = await db.query('SELECT * FROM saved_places ORDER BY id');
    const legacy = await migrate(db, files, { planOnly: true });
    assert.deepEqual(legacy.baseline, ['001_create_saved_places.sql', '002_create_driver_tasks.sql']);
    assert.deepEqual(legacy.pending, ['003_add_task_description.sql', '004_create_push_notifications.sql']);
    await migrate(db, files);
    assert.deepEqual((await db.query('SELECT * FROM saved_places ORDER BY id'))[0], before);
    const repeat = await migrate(db, files);
    assert.equal(repeat.pending.length, 0);
    assert.equal(repeat.applied.length, files.length);
    const drifted = files.map((file, i) => i ? file : { ...file, checksum: '0'.repeat(64) });
    await assert.rejects(migrate(db, drifted), /changed or removed/);
    const failure = { filename: '005_partial_failure.sql', checksum: 'f'.repeat(64),
      sql: 'CREATE TABLE partial_ddl (id INT); INSERT INTO table_that_does_not_exist VALUES (1)' };
    await assert.rejects(migrate(db, [...files, failure]), /doesn't exist/);
    assert.equal((await db.query('SELECT status FROM peik_schema_migrations WHERE filename=?', [failure.filename]))[0][0].status, 'failed');
    await assert.rejects(migrate(db, [...files, failure]), /explicit --retry/);
    assert.equal((await db.query('SHOW TABLES LIKE "partial_ddl"'))[0].length, 1);
  } finally {
    if (db) await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});
