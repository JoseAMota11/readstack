import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('live harness rejects unsafe targets without contacting a database', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'readstack-db04f-guard-'));
  const marker = path.join(dir, 'called');
  try {
    // Stub docker; the child cannot invoke a real Docker executable.
    writeFileSync(path.join(dir, 'docker'), '#!/bin/sh\n: > "$MARKER"\nprintf "[]"\n', { mode: 0o700 });
    const base = {
      PATH: dir, MARKER: marker, DB04F_APPROVED: 'yes', DB04F_CONTAINER_ID: 'a'.repeat(64),
      DB04F_IMAGE_ID: `sha256:${'b'.repeat(64)}`, DATABASE_PROVIDER: 'postgres', POSTGRES_TLS: 'verify-full',
      DATABASE_URL: 'postgres://readstack_db04f_runner:synthetic@127.0.0.1:55432/readstack_disposable_db04f',
    };
    const run = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['--import', 'tsx', 'tests/integration/postgres-routes.ts'], {
      cwd: path.resolve(__dirname, '../..'), env, encoding: 'utf8', timeout: 10000,
    });
    const absent = run({ PATH: dir, MARKER: marker });
    assert.equal(absent.status, 1);
    assert.equal(existsSync(marker), false);
    const remote = run({ ...base, DATABASE_URL: 'postgres://x:y@example.invalid/readstack_disposable_db04f' });
    assert.equal(remote.status, 1);
    assert.equal(existsSync(marker), false);
    const mismatch = run(base);
    assert.equal(mismatch.status, 1);
    assert.equal(existsSync(marker), true);
    assert.doesNotMatch(mismatch.stderr, /synthetic|postgres:\/\//);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
