import './helpers/test-env';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { after } from 'node:test';
import { rmSync } from 'node:fs';
import { TEST_TEMP_DIR } from './helpers/test-env';
import { startApplication } from '../src/database/startup';
import { createApplication } from '../src/application';
import { composePostgres } from '../src/database/postgres-composition';

const env = { DATABASE_PROVIDER: 'postgres', DATABASE_URL: 'postgres://synthetic:synthetic@example.invalid/readstack', POSTGRES_TLS: 'verify-full' };
const owner = '00000000-0000-4000-8000-000000000001';
after(() => rmSync(TEST_TEMP_DIR, { recursive: true, force: true }));
function fakePool() {
  const state = { ended: 0, calls: [] as { sql: string; values: unknown[] }[] };
  return { state, pool: {
    async query(sql: string, values: unknown[]) { state.calls.push({ sql, values }); return { rows: [], rowCount: 0 }; },
    async end() { state.ended++; },
    on() {},
  } };
}

test('readiness precedes bounded pool composition and real Express routes use PostgreSQL repositories', async () => {
  const { pool, state } = fakePool();
  const events: string[] = [];
  await startApplication(env, {
    readiness: async () => { events.push('ready'); },
    createPool: (options) => {
      events.push('pool');
      assert.equal(options.max, 5);
      assert.equal(options.connectionTimeoutMillis, 5000);
      assert.equal(options.query_timeout, 5000);
      assert.equal(options.statement_timeout, 5000);
      return pool;
    },
    listen: async (repositories) => {
      events.push('listen');
      const app = createApplication(repositories);
      const token = jwt.sign({ id: owner, username: 'synthetic' }, process.env.SECRET_KEY!);
      await request(app).get('/api/v1/books/00000000-0000-4000-8000-000000000002')
        .set('Authorization', `Bearer ${token}`).expect(404);
      await request(app).get('/api/v1/reviews/00000000-0000-4000-8000-000000000002')
        .set('Authorization', `Bearer ${token}`).expect(404);
      await request(app).post('/api/v1/login').send({ email: 'fake@example.test', password: 'Password123!' }).expect(401);
      return {} as Server;
    },
    installSignals: false,
  });
  assert.deepEqual(events, ['ready', 'pool', 'listen']);
  assert.equal(state.calls.length, 3);
  assert.ok(state.calls[0].values.includes(owner));
  assert.ok(state.calls[1].values.includes(owner));
  assert.equal(state.ended, 0);
});

test('composition and listen failures close the pool and hide internal details', async () => {
  for (const stage of ['composition', 'listen']) {
    const { pool, state } = fakePool();
    let listens = 0;
    await assert.rejects(startApplication(env, {
      readiness: async () => {}, createPool: () => pool,
      compose: stage === 'composition' ? () => { throw new Error('synthetic secret SQL'); } : composePostgres,
      listen: async () => { listens++; throw new Error('synthetic secret SQL'); },
      installSignals: false,
    }), { message: 'PostgreSQL application startup failed' });
    assert.equal(listens, stage === 'listen' ? 1 : 0);
    assert.equal(state.ended, 1);
  }
});

test('incomplete composition cannot listen and closes the pool', async () => {
  const { pool, state } = fakePool();
  let listened = false;
  await assert.rejects(startApplication(env, {
    readiness: async () => {}, createPool: () => pool,
    compose: () => ({ ...composePostgres(pool), reviews: undefined! }),
    listen: async () => { listened = true; throw new Error(); },
  }), { message: 'PostgreSQL application startup failed' });
  assert.equal(listened, false);
  assert.equal(state.ended, 1);
});

test('graceful shutdown drains the server before closing the pool, once', async () => {
  const { pool, state } = fakePool();
  const events: string[] = [];
  let shutdown: (() => Promise<void>) | undefined;
  const server = {
    close(callback: (error?: Error) => void) { events.push('server'); callback(); },
    closeAllConnections() { events.push('forced'); },
  } as unknown as Server;
  const end = pool.end;
  pool.end = async () => { events.push('pool'); await end(); };
  await startApplication(env, {
    readiness: async () => {}, createPool: () => pool,
    listen: async () => server,
    registerShutdown: (handler) => { shutdown = handler; },
  });
  assert.ok(shutdown);
  await Promise.all([shutdown(), shutdown()]);
  assert.deepEqual(events, ['server', 'pool']);
  assert.equal(state.ended, 1);
});

test('successful PostgreSQL composition and application imports never load SQLite', () => {
  const code = `
    const { startApplication } = require('./src/database/startup');
    const pool = { query: async () => ({ rows: [], rowCount: 0 }), end: async () => {}, on() {} };
    startApplication({DATABASE_PROVIDER:'postgres', DATABASE_URL:'postgres://x:x@example.invalid/db', POSTGRES_TLS:'verify-full'}, {
      readiness: async () => {}, createPool: () => pool,
      listen: async (repos) => { require('./src/application').createApplication(repos); return {}; }, installSignals: false
    }).then(() => {
      const loaded = Object.keys(require.cache).filter(p => /(?:config\\/db|models\\/(?:user|book|review)\\.model|better-sqlite3)/.test(p));
      if (loaded.length) process.exitCode = 1;
    }).catch(() => { process.exitCode = 2; });`;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', code], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
    env: { PATH: process.env.PATH, SECRET_KEY: 'a'.repeat(64), DATABASE_PATH: path.join('/tmp/opencode', 'must-not-create-sqlite.db') },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
