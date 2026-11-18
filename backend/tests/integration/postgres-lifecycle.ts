// Opt-in only: see DB-04G.md. No database or container mutations are performed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Client, Pool } from 'pg';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { postgresOptions } from '../../src/database/provider';
import { startApplication } from '../../src/database/startup';
import { validatePostgresReadiness } from '../../src/database/readiness';
import { checkTarget, containerId, database, role } from './db04g-guard';

const checksum = 'eebd5434f261f2974edccc1eb8cc6c91137f1f5567fbe2d5273a6810a05bb085';
const syntheticSecret = randomBytes(32).toString('hex');

async function approval(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive approval required');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`After written authorization and independent identity checks, type APPROVE ${containerId}: `);
    if (answer !== `APPROVE ${containerId}`) throw new Error('Approval not confirmed');
  } finally { rl.close(); }
}

function inspectTarget(options: ReturnType<typeof postgresOptions>): void {
  const result = spawnSync('docker', ['inspect', containerId], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error('Container inspection failed');
  checkTarget(options, process.env.DB04G_IMAGE_ID, JSON.parse(result.stdout));
}

async function independentCheck(options: ReturnType<typeof postgresOptions>, pids: number[] = []): Promise<void> {
  const client = new Client(options);
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS db, current_user AS role, session_user AS session_role');
    if (identity.rows[0]?.db !== database || identity.rows[0]?.role !== role || identity.rows[0]?.session_role !== role) throw new Error('Identity rejected');
    const ledger = await client.query('SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version');
    assert.equal(ledger.rows.length, 1);
    assert.deepEqual(ledger.rows[0], { version: '0001', filename: '0001_initial_schema.sql', checksum });
    const data = await client.query('SELECT NOT EXISTS (SELECT 1 FROM public.users) AND NOT EXISTS (SELECT 1 FROM public.books) AND NOT EXISTS (SELECT 1 FROM public.reviews) AS empty');
    assert.equal(data.rows[0]?.empty, true);
    if (pids.length) {
      const active = await client.query('SELECT count(*)::int AS count FROM pg_catalog.pg_stat_activity WHERE pid = ANY($1::int[])', [pids]);
      assert.equal(active.rows[0]?.count, 0);
    }
  } finally { await client.end(); }
}

async function main() {
  await approval(); // Never treat environment variables as authorization.
  if (process.env.DATABASE_PROVIDER !== 'postgres') throw new Error('PostgreSQL required');
  const options = postgresOptions(process.env);
  inspectTarget(options);
  await independentCheck(options);
  inspectTarget(options);
  // Process-local synthetic key, never a production secret.
  process.env.SECRET_KEY = syntheticSecret;
  const { createApplication } = await import('../../src/application');
  let shutdown: (() => Promise<void>) | undefined;
  let server: Server | undefined;
  let pool: Pool | undefined;
  let poolClosed = false;
  const pids: number[] = [];
  let directory: string | undefined;
  let fixture: string | undefined;
  try {
    await startApplication(process.env, {
      createPool: (settings) => {
        pool = new Pool(settings);
        return pool;
      },
      listen: async (repositories) => {
        const app = createApplication(repositories);
        return await new Promise<Server>((resolve, reject) => {
          const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
          server = listener;
          listener.once('error', reject);
        });
      },
      registerShutdown: (stop) => { shutdown = stop; },
    });
    assert.ok(pool && shutdown);
    assert.ok(server && server.address() && typeof server.address() !== 'string');
    const address = server.address();
    assert.ok(address && typeof address !== 'string' && address.address === '127.0.0.1');
    const url = `http://127.0.0.1:${address.port}/api/v1/books`;
    const token = jwt.sign({ id: randomUUID(), username: 'synthetic' }, syntheticSecret);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    const body = await response.json() as { books: unknown[]; pagination: { total: number } };
    assert.deepEqual(body.books, []);
    assert.equal(body.pagination.total, 0);
    const poolIdentity = await pool.query('SELECT current_database() AS db, current_user AS role, pg_backend_pid() AS pid');
    assert.equal(poolIdentity.rows[0]?.db, database);
    assert.equal(poolIdentity.rows[0]?.role, role);
    pids.push(poolIdentity.rows[0].pid);
    assert.ok(pids.length > 0);
    await shutdown();
    shutdown = undefined;
    poolClosed = true;
    assert.notEqual(process.exitCode, 1);
    await assert.rejects(pool.query('SELECT 1'));
    assert.equal(server.listening, false);
    await assert.rejects(fetch(url, { signal: AbortSignal.timeout(5000) }));

    // A synthetic migration manifest with the same version but a different checksum.
    // Readiness connects to the real target and rejects its unchanged ledger; it never runs the file.
    directory = await mkdtemp(path.join(tmpdir(), 'readstack-db04g-'));
    fixture = path.join(directory, '0001_initial_schema.sql');
    await writeFile(fixture, '-- synthetic mismatch; never executed\n', { flag: 'wx', mode: 0o600 });
    let listened = false;
    let madePool = false;
    await assert.rejects(startApplication(process.env, {
      readiness: (config) => validatePostgresReadiness(config, undefined, directory),
      createPool: () => { madePool = true; throw new Error('Unexpected pool'); },
      listen: async () => { listened = true; throw new Error('Unexpected listener'); },
    }), { message: 'PostgreSQL migration ledger not ready' });
    assert.equal(listened, false);
    assert.equal(madePool, false);
    inspectTarget(options);
    await independentCheck(options, pids);
    console.log('DB-04G startup, pool shutdown, readiness rejection and independent post-check passed.');
  } finally {
    if (shutdown) await shutdown();
    // If startup failed before registering shutdown, avoid leaving a listener or pool alive.
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (pool && !poolClosed) await pool.end().catch(() => { process.exitCode = 1; });
    if (fixture) await unlink(fixture);
    if (directory) await rmdir(directory);
  }
}

const watchdog = setTimeout(() => { console.error('DB-04G timeout; independently inspect and isolate the target.'); process.exit(1); }, 120000);
// Do not keep a clean process alive, but retain the deadline if a driver handle stalls after main settles.
watchdog.unref();
main().catch(() => { console.error('DB-04G failed; independently inspect and isolate the target.'); process.exitCode = 1; });
