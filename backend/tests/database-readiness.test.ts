import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverMigrations } from '../src/migrations/discovery';
import { databaseProvider, postgresOptions } from '../src/database/provider';
import { ReadinessClient, validatePostgresReadiness } from '../src/database/readiness';
import { startApplication } from '../src/database/startup';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';

const directory = path.resolve(__dirname, '../migrations');
const env = { DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgres://synthetic:synthetic@example.invalid/readstack', POSTGRES_TLS: 'verify-full' };
const shapes: Record<string, string> = {
  users: 'id:uuid! username:text! email:text! password:text! created_at:timestamp_with_time_zone!',
  books: 'id:uuid! user_id:uuid! title:text! author:text! year:integer! genre:jsonb! cover_image:text rating:double_precision is_favorite:boolean! description:text reading_status:text! created_at:timestamp_with_time_zone! updated_at:timestamp_with_time_zone!',
  reviews: 'id:uuid! book_id:uuid! user_id:uuid! rating:integer! comment:text! created_at:timestamp_with_time_zone!',
  schema_migrations: 'version:text! filename:text! checksum:text! applied_at:timestamp_with_time_zone!',
};
const columnRows = Object.entries(shapes).flatMap(([table_name, spec]) => spec.split(' ').map((item) => {
  const [column_name, encoded] = item.split(':');
  return { table_name, column_name, type: encoded.replace(/!$/, '').replace(/_/g, ' '), not_null: encoded.endsWith('!') };
}));
function key(table_name: string, kind: string, columns: string[], ref_table?: string, ref_columns?: string[]) {
  return { table_name, kind, columns, ref_table, ref_columns, ref_schema: 'public', delete_action: 'c', validated: true };
}
const constraintRows = [
  key('users', 'p', ['id']), key('users', 'u', ['email']), key('books', 'p', ['id']),
  key('books', 'u', ['id', 'user_id']), key('reviews', 'p', ['id']), key('schema_migrations', 'p', ['version']),
  key('books', 'f', ['user_id'], 'users', ['id']), key('reviews', 'f', ['book_id', 'user_id'], 'books', ['id', 'user_id']),
];

async function fixture() {
  const ledger = (await discoverMigrations(directory)).map(({ version, filename, checksum }) => ({ version, filename, checksum }));
  const state = { ledger, columns: [...columnRows], constraints: [...constraintRows], connectFails: false, ledgerMissing: false, endFails: false, ended: 0, queries: [] as string[] };
  const client: ReadinessClient = {
    async connect() { if (state.connectFails) throw new Error('synthetic secret'); },
    async query(sql) {
      state.queries.push(sql);
      if (sql.includes('FROM public.schema_migrations')) {
        if (state.ledgerMissing) throw new Error('synthetic secret');
        return { rows: state.ledger };
      }
      if (sql.includes('pg_catalog.pg_constraint')) return { rows: state.constraints };
      return { rows: state.columns };
    },
    async end() { state.ended++; if (state.endFails) throw new Error('synthetic secret'); },
  };
  return { state, run: () => validatePostgresReadiness(postgresOptions(env), () => client, directory) };
}

test('valid ledger and compatible schema pass read-only readiness and clean up', async () => {
  const { state, run } = await fixture();
  await run();
  assert.equal(state.ended, 1);
  assert.equal(state.queries.length, 3);
  assert.ok(state.queries.every((sql) => /^SELECT\b/.test(sql)));
});

for (const [label, change, message] of [
  ['missing ledger', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledgerMissing = true; }, 'ledger not ready'],
  ['pending migration', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledger = []; }, 'ledger not ready'],
  ['extra migration', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledger.push({ version: '9999', filename: 'extra.sql', checksum: 'x' }); }, 'ledger not ready'],
  ['wrong checksum', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledger[0].checksum = 'wrong'; }, 'ledger not ready'],
  ['wrong filename', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledger[0].filename = 'wrong'; }, 'ledger not ready'],
  ['wrong version', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.ledger[0].version = 'wrong'; }, 'ledger not ready'],
  ['incompatible columns', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.columns = s.columns.slice(1); }, 'schema incompatible'],
  ['missing ownership constraint', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.constraints.pop(); }, 'schema incompatible'],
  ['failed connection', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.connectFails = true; }, 'connection failed'],
  ['failed cleanup', (s: Awaited<ReturnType<typeof fixture>>['state']) => { s.endFails = true; }, 'cleanup failed'],
] as const) {
  test(`${label} fails safely and cleans up`, async () => {
    const { state, run } = await fixture();
    change(state);
    await assert.rejects(run(), (error: Error) => error.message.includes(message) && !error.message.includes('synthetic secret'));
    assert.equal(state.ended, 1);
    let started = false;
    await assert.rejects(startApplication(env, {
      readiness: run,
      createPool: () => { started = true; throw new Error(); },
      listen: async () => { started = true; throw new Error(); },
    }));
    assert.equal(started, false);
    assert.equal(state.ended, 2);
  });
}

test('provider and PostgreSQL TLS configuration fail closed', () => {
  assert.equal(databaseProvider({}), 'sqlite');
  assert.equal(databaseProvider({ DATABASE_PROVIDER: 'sqlite' }), 'sqlite');
  for (const value of ['', 'POSTGRES', 'other']) assert.throws(() => databaseProvider({ DATABASE_PROVIDER: value }), /Invalid database provider/);
  for (const bad of [
    { ...env, POSTGRES_TLS: 'disable' }, { ...env, DATABASE_URL: `${env.DATABASE_URL}?sslmode=disable` },
    { ...env, DATABASE_URL: 'postgres://example.invalid/db' }, { ...env, PGSSLMODE: 'disable' },
  ]) assert.throws(() => postgresOptions(bad), /Invalid PostgreSQL configuration/);
  assert.deepEqual(postgresOptions(env).ssl, { rejectUnauthorized: true });
});

test('stalled readiness query times out and closes the client', async () => {
  let ended = false;
  const client: ReadinessClient = {
    async connect() {},
    query: () => new Promise(() => {}),
    async end() { ended = true; },
  };
  await assert.rejects(validatePostgresReadiness(postgresOptions(env), () => client, directory), /ledger not ready/);
  assert.equal(ended, true);
});

test('PostgreSQL readiness failure never starts SQLite, creates a pool, or listens', async () => {
  let starts = 0;
  await assert.rejects(startApplication(env, {
    readiness: async () => { throw new Error('PostgreSQL schema incompatible'); },
    startSqlite: () => { starts++; },
    createPool: () => { starts++; throw new Error(); },
    listen: async () => { starts++; throw new Error(); },
  }), /schema incompatible/);
  assert.equal(starts, 0);
  await assert.rejects(startApplication({ DATABASE_PROVIDER: 'bad' }, { startSqlite: () => { starts++; } }), /Invalid database provider/);
  assert.equal(starts, 0);
});

test('actual entry point rejects PostgreSQL configuration without initializing SQLite or listening', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'readstack-provider-'));
  try {
    const database = path.join(dir, 'isolated.db');
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, SECRET_KEY: 'a'.repeat(64), DATABASE_PATH: database,
        DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'synthetic-secret', PORT: '0' },
    });
    assert.ifError(result.error);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid PostgreSQL configuration/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret|Tables created|Servidor corriendo/);
    assert.equal(existsSync(database), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
