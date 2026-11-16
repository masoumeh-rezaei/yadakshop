import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { loadMigrations, migrate } from '../db/migrations.js';

const migrationsDirectory = resolve(process.cwd(), 'migrations');

const run = async () => {
  const files = await loadMigrations(migrationsDirectory);
  const args = process.argv.slice(2);
  const planOnly = args[0] === '--plan';
  const retry = args[0] === '--retry' ? args[1] : undefined;
  const targeted = args.length === 1 && !args[0].startsWith('--') ? args[0] : undefined;
  if (args.length && !((planOnly && args.length === 1)
      || (retry && args.length === 2 && files.some(file => file.filename === retry))
      || (targeted && files.some(file => file.filename === targeted)))) {
    throw new Error('Pass one exact migration filename, --plan, --retry <filename>, or omit arguments to run pending files.');
  }

  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    multipleStatements: true,
    connectTimeout: 10000,
  });

  try {
    const plan = await migrate(connection, files, { planOnly, retry, only: targeted,
      log: planOnly ? undefined : console.log });
    if (planOnly) console.log(JSON.stringify(plan));
  } finally {
    await connection.end();
  }
};

run().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
