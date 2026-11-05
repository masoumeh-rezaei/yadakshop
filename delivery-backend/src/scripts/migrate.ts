import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { env } from '../config/env.js';

const migrationsDirectory = resolve(process.cwd(), 'migrations');

const run = async () => {
  const available = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));
  const requested = process.argv.slice(2);
  if (requested.length > 1 || (requested[0] && !available.includes(requested[0]))) {
    throw new Error('Pass one exact migration filename from the migrations directory, or omit it to run all files.');
  }
  const files = requested[0] ? [requested[0]] : available;

  if (!files.length) {
    console.log('No migration files found.');
    return;
  }

  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    multipleStatements: true,
  });

  try {
    for (const file of files) {
      const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');
      await connection.beginTransaction();
      try {
        await connection.query(sql);
        await connection.commit();
        console.log(`Applied ${file}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    const [rows] = await connection.query<(RowDataPacket & { count: number })[]>(
      'SELECT COUNT(*) AS count FROM saved_places',
    );
    console.log(`Saved places ready: ${Number(rows[0]?.count ?? 0)}`);
  } finally {
    await connection.end();
  }
};

run().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
