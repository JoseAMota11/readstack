import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { TestContext } from 'node:test';
import { discoverMigrations, planPendingMigrations } from '../src/migrations/discovery';

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
