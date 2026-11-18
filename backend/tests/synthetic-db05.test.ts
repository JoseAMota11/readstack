import assert from 'node:assert/strict';
import test from 'node:test';
import { changeFixture, checkContainer, targetOptions } from '../src/migrations/synthetic-db05';
import { syntheticFixtures, SyntheticSnapshot } from '../src/migrations/synthetic-fixtures';

const id = 'a'.repeat(64);
const image = `sha256:${'b'.repeat(64)}`;
const env = {
  DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgres://readstack_db05_runner:example@127.0.0.1:55499/readstack_disposable_db05',
  POSTGRES_TLS: 'verify-full', DB05_SEED_APPROVAL: 'I_APPROVE_DB05_SEED', DB05_RESET_APPROVAL: 'I_APPROVE_DB05_RESET',
  DB05_INDEPENDENTLY_VERIFIED: 'yes', DB05_CONTAINER_ID: id, DB05_IMAGE_ID: image, DB05_PORT: '55499',
};
const inspect = [{ Id: id, Image: image, State: { Running: true }, Mounts: [],
  HostConfig: { RestartPolicy: { Name: 'no' }, Tmpfs: { '/var/lib/postgresql/data': 'rw' } },
  NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55499' }] } } }];

test('target checks reject missing distinct approvals, identity and unsafe container details', () => {
  const options = targetOptions(env, 'seed');
  checkContainer(env, options, inspect);
  assert.doesNotThrow(() => targetOptions(env, 'reset'));
  for (const [operation, changes] of [
    ['seed', { DB05_SEED_APPROVAL: undefined }], ['reset', { DB05_RESET_APPROVAL: undefined }],
    ['reset', { DB05_RESET_APPROVAL: env.DB05_SEED_APPROVAL }], ['seed', { DB05_INDEPENDENTLY_VERIFIED: undefined }],
    ['seed', { DB05_CONTAINER_ID: 'abc' }], ['seed', { DB05_PORT: '55498' }],
    ['seed', { POSTGRES_TLS: 'off' }], ['seed', { PGHOST: 'example' }],
    ['seed', { DATABASE_URL: 'postgres://u:p@127.0.0.1:55499/production' }],
  ] as const) assert.throws(() => targetOptions({ ...env, ...changes }, operation));
  const changed = structuredClone(inspect);
  changed[0].NetworkSettings.Ports['5432/tcp'][0].HostIp = '0.0.0.0';
  assert.throws(() => checkContainer(env, options, changed));
  assert.throws(() => checkContainer(env, options, []));
});

class Fake {
  state: SyntheticSnapshot;
  before?: SyntheticSnapshot;
  calls: string[] = [];
  safe = true;
  locked = true;
  failOn = '';
  constructor(state: SyntheticSnapshot) { this.state = structuredClone(state); }
  async query(sql: string, params?: unknown[]) {
    this.calls.push(sql);
    if (this.failOn && sql.startsWith(this.failOn)) throw new Error('driver details');
    if (sql === 'BEGIN') this.before = structuredClone(this.state);
    if (sql === 'ROLLBACK' && this.before) this.state = this.before;
    if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: this.locked }], rowCount: 1 };
    if (sql.includes('AS safe')) return { rows: [{ safe: this.safe }], rowCount: 1 };
    const selected = sql.match(/FROM public\.(users|books|reviews) ORDER BY id/);
    if (selected) return { rows: structuredClone(this.state[selected[1] as keyof SyntheticSnapshot]), rowCount: 0 };
    const insert = sql.match(/^INSERT INTO public\.(users|books|reviews) \(([^)]+)\)/);
    if (insert) {
      const row: Record<string, unknown> = {};
      insert[2].split(', ').forEach((key, index) => { row[key] = key === 'genre' ? JSON.parse(params![index] as string) : params![index]; });
      (this.state[insert[1] as keyof SyntheticSnapshot] as unknown[]).push(row);
    }
    const deletion = sql.match(/^DELETE FROM public\.(users|books|reviews)/);
    if (deletion) {
      const table = deletion[1] as keyof SyntheticSnapshot;
      const ids = params![0] as string[];
      const count = this.state[table].length;
      (this.state as any)[table] = this.state[table].filter((row) => !ids.includes(row.id));
      return { rows: [], rowCount: count - this.state[table].length };
    }
    return { rows: [], rowCount: 0 };
  }
}

const empty = (): SyntheticSnapshot => ({ users: [], books: [], reviews: [] });
const ready = async () => {};

test('seed and reset are transactional and repeat without duplication', async () => {
  const db = new Fake(empty());
  assert.equal(await changeFixture(db, 'seed', () => {}, ready), 'changed');
  assert.deepEqual(db.state, syntheticFixtures());
  assert.equal(await changeFixture(db, 'seed', () => {}, ready), 'unchanged');
  assert.equal(await changeFixture(db, 'reset', () => {}, ready), 'changed');
  assert.deepEqual(db.state, empty());
  assert.equal(await changeFixture(db, 'reset', () => {}, ready), 'unchanged');
  assert.ok(db.calls.some((sql) => sql.includes('ACCESS EXCLUSIVE')));
  assert.equal(db.calls.filter((sql) => sql === 'COMMIT').length, 4);
  assert.ok(db.calls.filter((sql) => sql.startsWith('DELETE')).every((sql) => sql.includes('WHERE id = ANY')));
  assert.ok(db.calls.every((sql) => !/DELETE FROM public\.schema_migrations|TRUNCATE|DROP /i.test(sql)));
});

test('partial, changed and unrelated data are preserved; schema and recheck failures roll back', async () => {
  for (const mode of ['partial', 'changed', 'unrelated', 'schema', 'lock', 'recheck', 'insert failure', 'delete failure'] as const) {
    const state = mode === 'insert failure' ? empty() : syntheticFixtures();
    if (mode === 'partial') state.reviews.pop();
    if (mode === 'changed') state.books[0].title = 'modified';
    if (mode === 'unrelated') state.users.push({ ...state.users[0], id: '00000000-0000-4000-8000-000000000099' });
    const db = new Fake(state);
    if (mode === 'schema') db.safe = false;
    if (mode === 'lock') db.locked = false;
    if (mode === 'insert failure') db.failOn = 'INSERT INTO public.books';
    if (mode === 'delete failure') db.failOn = 'DELETE FROM public.books';
    const before = structuredClone(state);
    const operation = mode === 'insert failure' ? 'seed' : 'reset';
    await assert.rejects(changeFixture(db, operation, () => { if (mode === 'recheck') throw new Error(); }, ready), /independently verify/);
    assert.deepEqual(db.state, before, mode);
    assert.ok(db.calls.includes('ROLLBACK'), mode);
    assert.ok(!db.calls.includes('COMMIT'), mode);
  }
});

test('seed refuses a partial fixture without writing', async () => {
  const state = syntheticFixtures();
  state.books.pop();
  const db = new Fake(state);
  await assert.rejects(changeFixture(db, 'seed', () => {}, ready));
  assert.deepEqual(db.state, state);
  assert.ok(!db.calls.some((sql) => sql.startsWith('INSERT')));
});
