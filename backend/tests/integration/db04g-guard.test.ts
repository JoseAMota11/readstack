import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkTarget, containerId, database, role } from './db04g-guard';
import { validatePostgresReadiness } from '../../src/database/readiness';

test('target guard requires exact endpoint, container, image and disposable configuration', () => {
  const image = `sha256:${'b'.repeat(64)}`;
  const options = { host: '127.0.0.1', port: 55491, database, user: role };
  const container = { Id: containerId, Image: image, State: { Running: true },
    HostConfig: { RestartPolicy: { Name: 'no' }, Tmpfs: { '/var/lib/postgresql/data': 'rw' } },
    Mounts: [], NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55491' }] } } };
  assert.doesNotThrow(() => checkTarget(options, image, [container]));
  for (const invalid of [{ ...options, host: 'example.invalid' }, { ...options, port: 55492 },
    { ...options, user: 'other' }, { ...options, database: 'other' }]) {
    assert.throws(() => checkTarget(invalid, image, [container]));
  }
  assert.throws(() => checkTarget(options, image, [{ ...container, Id: 'other' }]));
  assert.throws(() => checkTarget(options, image, [{ ...container, Mounts: [{}] }]));
  assert.throws(() => checkTarget(options, image, [{ ...container, NetworkSettings: { Ports: {} } }]));
  assert.throws(() => checkTarget(options, undefined, [container]));
  assert.throws(() => checkTarget(options, image, []));
});

test('noninteractive invocation rejects before Docker or PostgreSQL', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'tests/integration/postgres-lifecycle.ts'], {
    cwd: process.cwd(), env: { PATH: '', DATABASE_PROVIDER: 'postgres' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DB-04G failed/);
});

test('synthetic manifest produces a read-only ledger mismatch with a fake client', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'readstack-db04g-test-'));
  const fixture = path.join(directory, '0001_initial_schema.sql');
  let closed = false;
  const queries: string[] = [];
  try {
    await writeFile(fixture, '-- synthetic mismatch; never executed\n');
    await assert.rejects(validatePostgresReadiness({}, () => ({
      connect: async () => {},
      query: async (sql) => {
        queries.push(sql);
        return { rows: [{ version: '0001', filename: '0001_initial_schema.sql', checksum: 'eebd5434f261f2974edccc1eb8cc6c91137f1f5567fbe2d5273a6810a05bb085' }] };
      },
      end: async () => { closed = true; },
    }), directory), { message: 'PostgreSQL migration ledger not ready' });
    assert.equal(queries.length, 1);
    assert.match(queries[0], /^SELECT /);
    assert.equal(closed, true);
  } finally {
    await unlink(fixture);
    await rmdir(directory);
  }
});
