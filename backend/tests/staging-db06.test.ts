import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import { stagingCli, stagingOptions } from '../src/migrations/staging-db06';

const host = 'ep-still-hall-bcrtmjpj.c-2.us-east-1.aws.neon.tech';
const env = {
  DB06_PROJECT: 'sparkling-cherry-00280862', DB06_BRANCH: 'br-crimson-block-bcr4joma',
  DB06_ENDPOINT: 'ep-still-hall-bcrtmjpj', DB06_HOST: host,
  DB06_CONSOLE_VERIFIED: 'yes', DB06_BETA_SEPARATION_VERIFIED: 'yes',
  DB06_APPROVAL: 'I_APPROVE_DB06_INITIALIZE_sparkling-cherry-00280862_br-crimson-block-bcr4joma_ep-still-hall-bcrtmjpj',
  DB06_DATABASE_URL: `postgresql://neondb_owner:fake-secret@${host}/neondb`,
};

class FakeClient {
  calls: string[] = [];
  identity: Record<string, unknown> = { db: 'neondb', role: 'neondb_owner', session_role: 'neondb_owner', read_only: 'off', can_create: true };
  empty = true;
  locked = true;
  failure = '';
  raceLedger = false;
  ledgerAppeared = false;
  ended = false;
  async connect() { if (this.failure === 'connect') throw new Error('secret'); }
  async end() { this.ended = true; if (this.failure === 'end') throw new Error('secret'); }
  async query(sql: string) {
    this.calls.push(sql);
    const operation = sql.startsWith('SELECT pg_try_advisory') ? 'lock' :
      sql.startsWith('SELECT pg_advisory_unlock') ? 'unlock' :
      sql.startsWith('SELECT current_database') ? 'identity' :
      sql.startsWith('SELECT\n') ? 'state' :
      sql.startsWith('CREATE TABLE') ? 'create' :
      sql.startsWith('SELECT version') ? 'ledger' : sql;
    if (this.failure === operation) throw new Error('fake-secret SQL');
    if (operation === 'lock') return { rows: [{ locked: this.locked }] };
    if (operation === 'unlock') return { rows: [{ unlocked: true }] };
    if (operation === 'identity') return { rows: [this.identity] };
    if (operation === 'state') {
      if (this.raceLedger) this.ledgerAppeared = true;
      return { rows: [{ empty: this.empty }] };
    }
    // A concurrent client creates a ledger after the state snapshot.
    if (operation === 'create' && this.ledgerAppeared && !sql.includes('IF NOT EXISTS')) throw new Error('relation exists');
    if (operation === 'ledger') return { rows: [] };
    return { rows: [] };
  }
  asClient() { return this as unknown as Client; }
}

test('target requires exact evidence, direct host, TLS and isolated configuration', () => {
  const options = stagingOptions(env);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.host, host);
  const invalid: NodeJS.ProcessEnv[] = [
    ...Object.keys(env).map((key) => ({ ...env, [key]: '' })),
    { ...env, DB06_HOST: host.replace('ep-still-hall-bcrtmjpj', 'ep-other') },
    { ...env, DB06_DATABASE_URL: env.DB06_DATABASE_URL.replace('ep-still-hall-bcrtmjpj.', 'ep-still-hall-bcrtmjpj-pooler.') },
    { ...env, DB06_DATABASE_URL: `${env.DB06_DATABASE_URL}?` },
    { ...env, DB06_DATABASE_URL: `${env.DB06_DATABASE_URL}?sslmode=disable` },
    { ...env, DB06_DATABASE_URL: env.DB06_DATABASE_URL.replace('/neondb', '/postgres') },
    { ...env, DB06_DATABASE_URL: env.DB06_DATABASE_URL.replace('neondb_owner', 'other') },
    { ...env, DB06_DATABASE_URL: env.DB06_DATABASE_URL.replace('/neondb', ':5433/neondb') },
    { ...env, PGHOST: '' }, { ...env, pgservice: 'other' }, { ...env, NODE_ENV: 'production' },
    { ...env, DATABASE_URL: 'production' }, { ...env, DATABASE_PATH: 'production' },
    { ...env, DATABASE_PROVIDER: 'sqlite' }, { ...env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, { ...env, NODE_OPTIONS: '' },
  ];
  for (const item of invalid) assert.throws(() => stagingOptions(item));
});

test('invalid target is refused before constructing a client', async () => {
  let constructed = false;
  const errors: string[] = [];
  const code = await stagingCli({ ...env, DB06_APPROVAL: '' }, {
    createClient: () => { constructed = true; throw new Error('secret'); },
    error: (message) => errors.push(message),
  });
  assert.equal(code, 1);
  assert.equal(constructed, false);
  assert.deepEqual(errors, ['Staging target rejected']);
});

test('runner preflight is locked and fails before writes for unsafe, duplicate and failed targets', async () => {
  for (const kind of ['ok', 'duplicate', 'identity', 'session', 'readonly', 'privilege', 'lock', 'state', 'connect', 'COMMIT']) {
    const client = new FakeClient();
    if (kind === 'duplicate') client.empty = false;
    if (kind === 'identity') client.identity.db = 'other';
    if (kind === 'session') client.identity.session_role = 'other';
    if (kind === 'readonly') client.identity.read_only = 'on';
    if (kind === 'privilege') client.identity.can_create = false;
    if (kind === 'lock') client.locked = false;
    if (['state', 'connect', 'COMMIT'].includes(kind)) client.failure = kind;
    const errors: string[] = [];
    const code = await stagingCli(env, { createClient: () => client.asClient(), error: (s) => errors.push(s) });
    assert.equal(code, kind === 'ok' ? 0 : 1, kind);
    assert.equal(client.ended, true, kind);
    if (kind === 'ok') {
      assert.ok(client.calls.findIndex((s) => s.includes('pg_my_temp_schema')) < client.calls.findIndex((s) => s.startsWith('CREATE TABLE public.schema_migrations')));
      assert.ok(client.calls[0].includes('pg_try_advisory_lock'));
      assert.ok(client.calls.includes('COMMIT'));
    } else if (kind !== 'COMMIT') {
      assert.equal(client.calls.some((s) => s.startsWith('CREATE TABLE')), false, kind);
    } else assert.ok(client.calls.includes('ROLLBACK'));
    assert.ok(errors.every((s) => !s.includes('fake-secret')));
  }
});

test('a ledger appearing after preflight fails exclusive creation before migration SQL', async () => {
  const client = new FakeClient();
  client.raceLedger = true;
  const errors: string[] = [];
  const code = await stagingCli(env, { createClient: () => client.asClient(), error: (s) => errors.push(s) });
  assert.equal(code, 1);
  const state = client.calls.findIndex((s) => s.includes('pg_my_temp_schema'));
  const create = client.calls.findIndex((s) => s.startsWith('CREATE TABLE public.schema_migrations'));
  assert.ok(state >= 0 && create > state);
  assert.equal(client.calls.some((s) => s.startsWith('CREATE TABLE IF NOT EXISTS')), false);
  assert.equal(client.calls.some((s) => s.startsWith('SELECT version')), false);
  assert.equal(client.calls.includes('BEGIN'), false);
  assert.equal(client.calls.some((s) => s.startsWith('INSERT INTO')), false);
  assert.equal(client.calls.includes('ROLLBACK'), false);
  assert.ok(client.calls.at(-1)?.startsWith('SELECT pg_advisory_unlock'));
  assert.equal(client.ended, true);
  assert.deepEqual(errors, ['Staging initialization failed; independently verify target and outcome before any retry']);
});

test('runner refuses changed or additional migrations before any schema write', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'db06-manifest-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const original = await readFile(path.resolve(__dirname, '../migrations/0001_initial_schema.sql'));
  for (const additional of [false, true]) {
    await writeFile(path.join(dir, '0001_initial_schema.sql'), additional ? original : 'changed');
    if (additional) await writeFile(path.join(dir, '0002_extra.sql'), 'extra');
    const client = new FakeClient();
    assert.equal(await stagingCli(env, { directory: dir, createClient: () => client.asClient(), error: () => {} }), 1);
    assert.equal(client.calls.some((s) => s.startsWith('CREATE TABLE')), false);
    assert.equal(client.ended, true);
  }
});
