import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Client, ClientConfig } from 'pg';
import { postgresOptions } from '../database/provider';
import { validatePostgresReadiness } from '../database/readiness';
import { discoverMigrations } from './discovery';
import { planSyntheticInitialization, syntheticFixtures, SyntheticSnapshot } from './synthetic-fixtures';
import { MIGRATION_LOCK_KEY } from './runner';

type Operation = 'seed' | 'reset';
const database = 'readstack_disposable_db05';
const role = 'readstack_db05_runner';
const checksum = 'eebd5434f261f2974edccc1eb8cc6c91137f1f5567fbe2d5273a6810a05bb085';
const directory = path.resolve(__dirname, '../../migrations');

export function targetOptions(env: NodeJS.ProcessEnv, operation: Operation): ClientConfig {
  const expected = operation === 'seed' ? 'I_APPROVE_DB05_SEED' : 'I_APPROVE_DB05_RESET';
  const confirmation = operation === 'seed' ? env.DB05_SEED_APPROVAL : env.DB05_RESET_APPROVAL;
  if (confirmation !== expected || env.DB05_INDEPENDENTLY_VERIFIED !== 'yes' || env.DATABASE_PROVIDER !== 'postgres' ||
      !/^[a-f0-9]{64}$/.test(env.DB05_CONTAINER_ID || '') || !/^sha256:[a-f0-9]{64}$/.test(env.DB05_IMAGE_ID || '') ||
      !/^[1-9][0-9]{0,4}$/.test(env.DB05_PORT || '') || Number(env.DB05_PORT) > 65535) throw new Error('Target rejected');
  const options = postgresOptions(env);
  if (options.host !== '127.0.0.1' || options.port !== Number(env.DB05_PORT) ||
      options.database !== database || options.user !== role) throw new Error('Target rejected');
  return options;
}

export function checkContainer(env: NodeJS.ProcessEnv, options: ClientConfig, inspect: unknown): void {
  if (!Array.isArray(inspect) || inspect.length !== 1) throw new Error('Target rejected');
  const c = inspect[0];
  const bindings = c?.NetworkSettings?.Ports?.['5432/tcp'];
  if (c?.Id !== env.DB05_CONTAINER_ID || c.Image !== env.DB05_IMAGE_ID || !c.State?.Running ||
      c.HostConfig?.RestartPolicy?.Name !== 'no' || !Array.isArray(c.Mounts) || c.Mounts.length !== 0 ||
      !c.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] || !Array.isArray(bindings) || bindings.length !== 1 ||
      bindings[0].HostIp !== '127.0.0.1' || Number(bindings[0].HostPort) !== options.port) throw new Error('Target rejected');
}

function inspectTarget(env: NodeJS.ProcessEnv, options: ClientConfig): void {
  const result = spawnSync('docker', ['inspect', env.DB05_CONTAINER_ID!], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('Target rejected');
  checkContainer(env, options, JSON.parse(result.stdout));
}

interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, any>[]; rowCount: number | null }>;
}

// Access-exclusive locks prevent concurrent writes and DDL on the affected tables. Reject
// extras that could hide rows or make INSERT/DELETE affect anything beyond this fixture.
const safetyQuery = `SELECT
  (SELECT count(*) = 3 AND bool_and(c.relkind = 'r' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity)
   FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname IN ('users','books','reviews'))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass))
  AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass) OR i.inhparent IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass))
  AND (SELECT count(*) = 2 FROM pg_catalog.pg_constraint WHERE contype = 'f' AND confrelid IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass))
  AND (SELECT count(*) = 24 FROM pg_catalog.pg_attribute WHERE attrelid IN ('public.users'::regclass,'public.books'::regclass,'public.reviews'::regclass) AND attnum > 0 AND NOT attisdropped)
  AS safe`;

// Do not let PostgreSQL's microsecond precision be rounded away when comparing fixtures.
const timestamp = (column: string) => `CASE WHEN date_trunc('milliseconds', ${column}) = ${column}
  THEN to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ELSE NULL END AS ${column}`;
const selects = {
  users: `SELECT id, username, email, password, ${timestamp('created_at')} FROM public.users ORDER BY id`,
  books: `SELECT id, user_id, title, author, year, genre, cover_image, rating, is_favorite, description, reading_status, ${timestamp('created_at')}, ${timestamp('updated_at')} FROM public.books ORDER BY id`,
  reviews: `SELECT id, book_id, user_id, rating, comment, ${timestamp('created_at')} FROM public.reviews ORDER BY id`,
};

export async function changeFixture(client: QueryClient, operation: Operation, recheck: () => void, readiness: () => Promise<void>): Promise<'changed' | 'unchanged'> {
  let started = false;
  try {
    started = true;
    await client.query('BEGIN');
    const lock = await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS locked', [MIGRATION_LOCK_KEY]);
    if (lock.rows.length !== 1 || lock.rows[0].locked !== true) throw new Error('Migration lock rejected');
    await client.query('SET LOCAL row_security = off');
    await client.query('LOCK TABLE public.users, public.books, public.reviews IN ACCESS EXCLUSIVE MODE');
    await client.query('LOCK TABLE public.schema_migrations IN ACCESS SHARE MODE');
    await readiness();
    const safety = await client.query(safetyQuery);
    if (safety.rows.length !== 1 || safety.rows[0].safe !== true) throw new Error('Schema rejected');
    const snapshot = {} as SyntheticSnapshot;
    for (const table of ['users', 'books', 'reviews'] as const) {
      (snapshot as any)[table] = (await client.query(selects[table])).rows;
    }
    const plan = planSyntheticInitialization('I_APPROVE_SYNTHETIC_PLANNING', snapshot);
    recheck();
    if (operation === 'seed' && plan === 'insert') {
      const fixture = syntheticFixtures();
      for (const table of ['users', 'books', 'reviews'] as const) {
        for (const row of fixture[table]) {
          const entries = Object.entries(row);
          const values = entries.map(([key, value]) => key === 'genre' ? JSON.stringify(value) : value);
          await client.query(`INSERT INTO public.${table} (${entries.map(([key]) => key).join(', ')}) VALUES (${entries.map((_, i) => `$${i + 1}`).join(', ')})`, values);
        }
      }
    } else if (operation === 'reset' && plan === 'unchanged') {
      const fixture = syntheticFixtures();
      for (const table of ['reviews', 'books', 'users'] as const) {
        const result = await client.query(`DELETE FROM public.${table} WHERE id = ANY($1::uuid[])`, [fixture[table].map((row) => row.id)]);
        if (result.rowCount !== fixture[table].length) throw new Error('Reset count rejected');
      }
    }
    await client.query('COMMIT');
    started = false;
    return (operation === 'seed' && plan === 'insert') || (operation === 'reset' && plan === 'unchanged') ? 'changed' : 'unchanged';
  } catch {
    if (started) { try { await client.query('ROLLBACK'); } catch { /* Uncertain outcome requires independent verification. */ } }
    throw new Error('Synthetic operation failed; independently verify target and transaction outcome');
  }
}

export async function runSyntheticCli(operation: Operation, env: NodeJS.ProcessEnv): Promise<void> {
  const options = targetOptions(env, operation);
  inspectTarget(env, options);
  const migrations = await discoverMigrations(directory);
  if (migrations.length !== 1 || migrations[0].filename !== '0001_initial_schema.sql' || migrations[0].checksum !== checksum) throw new Error('Migration set rejected');
  const client = new Client(options);
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS db, current_user AS role, session_user AS session_role');
    if (identity.rows.length !== 1 || identity.rows[0].db !== database || identity.rows[0].role !== role || identity.rows[0].session_role !== role) throw new Error('Identity rejected');
    await changeFixture(client, operation, () => inspectTarget(env, options), () =>
      validatePostgresReadiness(options, () => ({ connect: async () => {}, query: async (sql) => client.query(sql), end: async () => {} }), directory));
  } finally {
    await client.end();
  }
}
