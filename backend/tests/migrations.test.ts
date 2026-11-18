import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { TestContext } from 'node:test';
import { discoverMigrations, planPendingMigrations } from '../src/migrations/discovery';
import { MigrationClient, runMigrations } from '../src/migrations/runner';

async function fixture(t: TestContext, files: Record<string, string | Buffer> = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'readstack-migrations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await Promise.all(Object.entries(files).map(([name, bytes]) => writeFile(path.join(dir, name), bytes)));
  return dir;
}

test('discovers in version order and preserves exact bytes and SHA-256', async (t) => {
  const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0xff]);
  const dir = await fixture(t, {
    '0002_second.sql': 'second\n',
    '0001_first.sql': bytes,
    'notes.txt': 'ignored',
  });
  const migrations = await discoverMigrations(dir);
  assert.deepEqual(migrations.map(({ version, filename }) => [version, filename]), [
    ['0001', '0001_first.sql'], ['0002', '0002_second.sql'],
  ]);
  assert.deepEqual(migrations[0].bytes, bytes);
  assert.equal(migrations[0].checksum, createHash('sha256').update(bytes).digest('hex'));
});

test('rejects empty, malformed, duplicate, zero and noncontiguous migration sets', async (t) => {
  for (const names of [
    [], ['notes.txt'], ['1_first.sql'], ['0001_.sql'], ['0001_first.SQL'],
    ['0001_first.sql', 'oops.sql'], ['0000_zero.sql'], ['0002_second.sql'],
    ['0001_first.sql', '0003_third.sql'], ['0001_first.sql', '0001_other.sql'],
  ]) {
    const dir = await fixture(t, Object.fromEntries(names.map((name) => [name, 'content'])));
    await assert.rejects(discoverMigrations(dir), undefined, names.join(', ') || 'empty');
  }
});

test('rejects SQL-named directories and symbolic links', async (t) => {
  const dir = await fixture(t, { 'source.txt': 'content' });
  await mkdir(path.join(dir, '0001_directory.sql'));
  await assert.rejects(discoverMigrations(dir), /file type/);
  const linkDir = await fixture(t, { 'source.txt': 'content' });
  await symlink('source.txt', path.join(linkDir, '0001_link.sql'));
  await assert.rejects(discoverMigrations(linkDir), /file type/);
});

test('checksums change with exact bytes, including line endings', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'one\n' });
  const [original] = await discoverMigrations(dir);
  await writeFile(path.join(dir, '0001_first.sql'), 'one\r\n');
  const [changed] = await discoverMigrations(dir);
  assert.notEqual(original.checksum, changed.checksum);
  assert.deepEqual(changed.bytes, Buffer.from('one\r\n'));
  assert.throws(() => planPendingMigrations([changed], [original]), /ledger mismatch/);
});

test('plans the deterministic suffix for an exact applied prefix', async (t) => {
  const dir = await fixture(t, {
    '0003_third.sql': 'third', '0001_first.sql': 'first', '0002_second.sql': 'second',
  });
  const migrations = await discoverMigrations(dir);
  assert.deepEqual(planPendingMigrations(migrations, []), migrations);
  assert.deepEqual(planPendingMigrations(migrations, [migrations[0]]), migrations.slice(1));
  assert.deepEqual(planPendingMigrations(migrations, migrations), []);
});

test('rejects changed, renamed, missing, unknown, duplicated and out-of-order ledger entries', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first', '0002_second.sql': 'second' });
  const migrations = await discoverMigrations(dir);
  const [first, second] = migrations;
  for (const ledger of [
    [{ ...first, checksum: 'wrong' }],
    [{ ...first, filename: '0001_renamed.sql' }],
    [{ ...first, version: '0002' }],
    [second],
    [second, first],
    [first, first],
    [first, second, { ...second, version: '0003', filename: '0003_unknown.sql' }],
  ]) {
    assert.throws(() => planPendingMigrations(migrations, ledger), /ledger mismatch/);
  }
  assert.throws(() => planPendingMigrations(migrations.slice(0, 1), migrations), /ledger mismatch/);
});

class FakeClient implements MigrationClient {
  calls: { sql: string; params?: string[] }[] = [];
  rows: Record<string, unknown>[] = [];
  locked = true;
  unlocked = true;
  failures = new Set<string>();
  ended = false;

  async query(sql: string, params?: string[]) {
    this.calls.push({ sql, params });
    const operation = sql.startsWith('SELECT pg_try_') ? 'lock' :
      sql.startsWith('SELECT pg_advisory_unlock') ? 'unlock' :
      sql.startsWith('CREATE TABLE IF NOT EXISTS') ? 'create' :
      sql.startsWith('SELECT version') ? 'ledger' :
      sql.startsWith('INSERT INTO') ? 'insert' : sql;
    if (this.failures.has(operation)) throw new Error('secret connection string and SQL');
    if (operation === 'lock') return { rows: [{ locked: this.locked }] };
    if (operation === 'unlock') return { rows: [{ unlocked: this.unlocked }] };
    if (operation === 'ledger') return { rows: this.rows };
    return { rows: [] };
  }

  async end() {
    this.ended = true;
    if (this.failures.has('end')) throw new Error('secret cleanup details');
  }
}

function operations(client: FakeClient) {
  return client.calls.map(({ sql }) => sql.startsWith('SELECT pg_try_') ? 'lock' :
    sql.startsWith('SELECT pg_advisory_unlock') ? 'unlock' :
    sql.startsWith('CREATE TABLE IF NOT EXISTS') ? 'create' :
    sql.startsWith('SELECT version') ? 'ledger' :
    sql.startsWith('INSERT INTO') ? 'insert' : sql);
}

test('runner locks, validates and applies each exact SQL snapshot with an atomic ledger entry', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': '\ufefffirst\r\n', '0002_second.sql': 'second' });
  const migrations = await discoverMigrations(dir);
  const client = new FakeClient();
  await runMigrations(client, dir);
  assert.deepEqual(operations(client), ['lock', 'create', 'ledger', 'BEGIN', '\ufefffirst\r\n', 'insert', 'COMMIT', 'BEGIN', 'second', 'insert', 'COMMIT', 'unlock']);
  assert.deepEqual(client.calls.filter(({ sql }) => sql.startsWith('INSERT')).map(({ params }) => params),
    migrations.map(({ version, filename, checksum }) => [version, filename, checksum]));
  assert.deepEqual(client.calls[0].params, client.calls[client.calls.length - 1].params);
  assert.equal(client.ended, true);
});

test('runner skips an applied prefix and performs a no-op when fully applied', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first', '0002_second.sql': 'second' });
  const migrations = await discoverMigrations(dir);
  const client = new FakeClient();
  client.rows = [migrations[0]];
  await runMigrations(client, dir);
  assert.deepEqual(operations(client), ['lock', 'create', 'ledger', 'BEGIN', 'second', 'insert', 'COMMIT', 'unlock']);
  const noop = new FakeClient();
  noop.rows = migrations;
  await runMigrations(noop, dir);
  assert.deepEqual(operations(noop), ['lock', 'create', 'ledger', 'unlock']);
  assert.equal(noop.ended, true);
});

test('runner fails closed on lock contention and ledger mismatch', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first' });
  const busy = new FakeClient();
  busy.locked = false;
  await assert.rejects(runMigrations(busy, dir), { message: 'Migration lock acquisition failed' });
  assert.deepEqual(operations(busy), ['lock', 'unlock']);
  assert.equal(busy.ended, true);
  const mismatch = new FakeClient();
  mismatch.rows = [{ version: '0001', filename: 'wrong', checksum: 'wrong' }];
  await assert.rejects(runMigrations(mismatch, dir), { message: 'Migration ledger validation failed' });
  assert.deepEqual(operations(mismatch), ['lock', 'create', 'ledger', 'unlock']);
  assert.equal(mismatch.ended, true);
});

test('runner stops and rolls back on migration or ledger insert failure, preserving failure if rollback fails', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first', '0002_second.sql': 'second' });
  for (const failed of ['BEGIN', 'first', 'insert']) {
    const client = new FakeClient();
    client.failures = new Set([failed, 'ROLLBACK', 'unlock', 'end']);
    await assert.rejects(runMigrations(client, dir), { message: 'Migration execution failed' });
    assert.deepEqual(operations(client).slice(-2), ['ROLLBACK', 'unlock']);
    assert.equal(operations(client).includes('second'), false);
    assert.equal(operations(client).includes('COMMIT'), false);
    assert.equal(client.ended, true);
  }
});

test('runner never retries an uncertain COMMIT and attempts rollback and cleanup', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first', '0002_second.sql': 'second' });
  const client = new FakeClient();
  client.failures.add('COMMIT');
  await assert.rejects(runMigrations(client, dir), { message: 'Migration commit outcome is uncertain', stack: undefined });
  assert.deepEqual(operations(client), ['lock', 'create', 'ledger', 'BEGIN', 'first', 'insert', 'COMMIT', 'ROLLBACK', 'unlock']);
  assert.equal(client.ended, true);
});

test('runner reports sanitized unlock and cleanup failures and always ends the client', async (t) => {
  const dir = await fixture(t, { '0001_first.sql': 'first' });
  for (const failure of ['unlock', 'end', 'unlocked-false']) {
    const client = new FakeClient();
    if (failure === 'unlocked-false') client.unlocked = false;
    else client.failures.add(failure);
    await assert.rejects(runMigrations(client, dir), {
      message: failure === 'end' ? 'Migration client cleanup failed' : 'Migration unlock failed',
    });
    assert.equal(client.ended, true);
  }
});

test('runner sanitizes discovery and client failures and attempts cleanup even before lock acquisition', async (t) => {
  const empty = await fixture(t);
  const client = new FakeClient();
  await assert.rejects(runMigrations(client, empty), { message: 'Migration discovery failed' });
  assert.deepEqual(operations(client), ['unlock']);
  assert.equal(client.ended, true);
  const invalid = await fixture(t, { '0001_first.sql': Buffer.from([0xff]) });
  const badBytes = new FakeClient();
  await assert.rejects(runMigrations(badBytes, invalid), { message: 'Migration discovery failed' });
  assert.deepEqual(operations(badBytes), ['unlock']);
  const dir = await fixture(t, { '0001_first.sql': 'first' });
  for (const [failed, message] of [['lock', 'Migration lock acquisition failed'], ['create', 'Migration ledger setup failed'], ['ledger', 'Migration ledger validation failed']]) {
    const failing = new FakeClient();
    failing.failures.add(failed);
    await assert.rejects(runMigrations(failing, dir), { message });
    assert.equal(operations(failing).at(-1), 'unlock');
    assert.equal(failing.ended, true);
  }
});
