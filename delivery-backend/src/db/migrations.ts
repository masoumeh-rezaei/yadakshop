import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';

type Migration = { filename: string; checksum: string; sql: string };
type History = RowDataPacket & { filename: string; checksum: string; status: string };
export type MigrationPlan = { pending: string[]; baseline: string[]; applied: string[] };
const ledger = 'peik_schema_migrations';

export async function loadMigrations(directory: string): Promise<Migration[]> {
  const files = (await readdir(directory)).filter(file => /^\d+_[A-Za-z0-9_-]+\.sql$/.test(file))
    .sort((left, right) => Number(left.split('_')[0]) - Number(right.split('_')[0]));
  if (new Set(files.map(file => Number(file.split('_')[0]))).size !== files.length) {
    throw new Error('Migration sequence numbers must be unique.');
  }
  return Promise.all(files.map(async filename => {
    const sql = (await readFile(resolve(directory, filename), 'utf8')).replace(/\r\n/g, '\n');
    return { filename, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  }));
}

async function tableExists(db: Connection, table: string): Promise<boolean> {
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?', [table]);
  return rows.length > 0;
}

// The first two migrations predate the ledger. Adopt existing tables without
// replaying migration 001's seed, which would overwrite edited saved places.
async function legacyBaseline(db: Connection, filename: string): Promise<boolean> {
  const definitions: Record<string, { table: string; columns: string[]; unique: string[] }> = {
    '001_create_saved_places.sql': { table: 'saved_places',
      columns: ['id', 'name', 'latitude', 'longitude', 'source_key', 'created_at', 'updated_at'], unique: ['source_key'] },
    '002_create_driver_tasks.sql': { table: 'driver_tasks',
      columns: ['id', 'driver_id', 'place_id', 'assigned_by', 'status', 'revision', 'assigned_at', 'completed_at', 'created_at', 'updated_at'],
      unique: ['driver_id', 'place_id'] },
  };
  const spec = definitions[filename];
  if (!spec || !(await tableExists(db, spec.table))) return false;
  const [columns] = await db.query<RowDataPacket[]>(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?', [spec.table]);
  const [indexes] = await db.query<RowDataPacket[]>(
    'SELECT index_name, column_name, seq_in_index FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND non_unique=0 ORDER BY index_name, seq_in_index', [spec.table]);
  const unique = new Map<string, string[]>();
  for (const row of indexes) unique.set(row.index_name, [...(unique.get(row.index_name) ?? []), row.column_name]);
  if (spec.columns.some(name => !columns.some(row => row.column_name === name))
      || ![...unique.values()].some(names => names.join(',') === spec.unique.join(','))) {
    throw new Error(`Existing ${spec.table} schema cannot be baselined automatically.`);
  }
  return true;
}

async function planMigrations(db: Connection, files: Migration[], retry?: string): Promise<MigrationPlan> {
  const history = new Map<string, History>();
  if (await tableExists(db, ledger)) {
    const [rows] = await db.query<History[]>(`SELECT filename, checksum, status FROM ${ledger}`);
    for (const row of rows) {
      const file = files.find(candidate => candidate.filename === row.filename);
      if (!file || file.checksum !== row.checksum) throw new Error(`Applied migration changed or removed: ${row.filename}`);
      if (row.status !== 'applied' && retry !== row.filename) {
        throw new Error(`Migration ${row.filename} is ${row.status}; inspect the schema before an explicit --retry.`);
      }
      history.set(row.filename, row);
    }
  }
  const plan: MigrationPlan = { pending: [], baseline: [], applied: [] };
  for (const file of files) {
    const entry = history.get(file.filename);
    if (entry?.status === 'applied') plan.applied.push(file.filename);
    else if (!entry && await legacyBaseline(db, file.filename)) plan.baseline.push(file.filename);
    else plan.pending.push(file.filename);
  }
  return plan;
}

export async function migrate(db: Connection, files: Migration[], options: {
  planOnly?: boolean; retry?: string; only?: string; log?: (message: string) => void;
} = {}): Promise<MigrationPlan> {
  const [database] = await db.query<RowDataPacket[]>('SELECT DATABASE() AS name');
  const lock = 'peik:migrations:' + createHash('sha256').update(String(database[0]?.name)).digest('hex').slice(0, 40);
  const [result] = await db.query<RowDataPacket[]>('SELECT GET_LOCK(?, 15) AS acquired', [lock]);
  if (Number(result[0]?.acquired) !== 1) throw new Error('Another migration process holds the database lock.');
  try {
    const plan = await planMigrations(db, files, options.retry);
    if (options.planOnly) return plan;
    await db.query('SET SESSION lock_wait_timeout=15');
    await db.query('SET SESSION innodb_lock_wait_timeout=15');
    await db.query(`CREATE TABLE IF NOT EXISTS ${ledger} (
      filename VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      checksum CHAR(64) CHARACTER SET ascii NOT NULL,
      status ENUM('running','applied','failed') NOT NULL,
      applied_at DATETIME NULL
    ) ENGINE=InnoDB`);
    const selected = (filename: string) => !options.only || options.only === filename;
    for (const filename of plan.baseline.filter(selected)) {
      const file = files.find(file => file.filename === filename)!;
      await db.query(`INSERT INTO ${ledger} (filename,checksum,status,applied_at) VALUES (?,?,'applied',NOW())`, [filename, file.checksum]);
      options.log?.(`Baselined ${filename} (existing data preserved)`);
    }
    for (const filename of plan.pending.filter(selected)) {
      const file = files.find(file => file.filename === filename)!;
      await db.query(`INSERT INTO ${ledger} (filename,checksum,status) VALUES (?,?,'running')
        ON DUPLICATE KEY UPDATE status='running', applied_at=NULL`, [filename, file.checksum]);
      try {
        // DDL implicitly commits. A transaction cannot undo partial DDL;
        // a failed/running entry requires deliberate recovery.
        await db.query({ sql: file.sql, timeout: 120000 });
        await db.query(`UPDATE ${ledger} SET status='applied',applied_at=NOW() WHERE filename=?`, [filename]);
        options.log?.(`Applied ${filename}`);
      } catch (error) {
        await db.query(`UPDATE ${ledger} SET status='failed' WHERE filename=?`, [filename]).catch(() => {});
        throw error;
      }
    }
    options.log?.(`MIGRATIONS_OK applied=${plan.pending.filter(selected).length} baseline=${plan.baseline.filter(selected).length} skipped=${plan.applied.length}`);
    return plan;
  } finally {
    await db.query('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
  }
}
