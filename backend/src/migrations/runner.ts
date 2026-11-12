import { TextDecoder } from 'node:util';
import { discoverMigrations, LedgerEntry, planPendingMigrations } from './discovery';

// The caller supplies one dedicated PostgreSQL session; end must close/discard it.
export interface MigrationClient {
  query(sql: string, params?: string[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

// Fixed signed bigint advisory-lock namespace for ReadStack migrations (ASCII "READSTAK").
const LOCK_KEY = '5928216246214738251';

function safeError(message: string): Error {
  const error = new Error(message);
  error.stack = undefined;
  return error;
}

export async function runMigrations(client: MigrationClient, directory: string): Promise<void> {
  let failure: Error | undefined;
  let stage = 'Migration discovery failed';
  let locked = false;
  let transaction = false;

  try {
    const migrations = await discoverMigrations(directory);
    // Decode losslessly before changing the database; checksum and execution use the same bytes.
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const sql = migrations.map((migration) => decoder.decode(migration.bytes));

    stage = 'Migration lock acquisition failed';
    const lock = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS locked', [LOCK_KEY]);
    if (lock.rows.length !== 1 || lock.rows[0].locked !== true) throw new Error();
    locked = true;

    stage = 'Migration ledger setup failed';
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      filename text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    stage = 'Migration ledger validation failed';
    const result = await client.query('SELECT version, filename, checksum FROM schema_migrations ORDER BY version');
    const ledger: LedgerEntry[] = result.rows.map((row) => {
      if (typeof row.version !== 'string' || typeof row.filename !== 'string' || typeof row.checksum !== 'string') {
        throw new Error();
      }
      return { version: row.version, filename: row.filename, checksum: row.checksum };
    });
    const pending = planPendingMigrations(migrations, ledger);
    for (const [index, migration] of pending.entries()) {
      stage = 'Migration execution failed';
      // BEGIN may have reached the server even when its response is lost.
      transaction = true;
      await client.query('BEGIN');
      await client.query(sql[ledger.length + index]);
      await client.query('INSERT INTO schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.filename, migration.checksum]);
      stage = 'Migration commit outcome is uncertain';
      await client.query('COMMIT');
      transaction = false;
    }
  } catch {
    failure = safeError(stage);
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    }
  } finally {
    // Also attempt unlock after an uncertain acquisition, or after contention.
    try {
      const result = await client.query('SELECT pg_advisory_unlock($1::bigint) AS unlocked', [LOCK_KEY]);
      if (locked && (result.rows.length !== 1 || result.rows[0].unlocked !== true)) throw new Error();
    } catch {
      if (!failure) failure = safeError('Migration unlock failed');
    }
    try { await client.end(); } catch {
      if (!failure) failure = safeError('Migration client cleanup failed');
    }
  }
  if (failure) throw failure;
}
