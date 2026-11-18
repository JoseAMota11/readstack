import test from 'node:test';
import assert from 'node:assert/strict';
import { checkObserver, checkTarget, database, observerOptions, observerRole, role } from './db04i-guard';

test('DB-04I rejects missing approval, identity mismatch and unsafe bindings', () => {
  const id = 'a'.repeat(64), image = `sha256:${'b'.repeat(64)}`;
  const env = { DB04I_APPROVED: 'yes', DATABASE_PROVIDER: 'postgres', DB04I_CONTAINER_ID: id, DB04I_IMAGE_ID: image, DB04I_PORT: '55493' };
  const options = { host: '127.0.0.1', port: 55493, database, user: role };
  const container = { Id: id, Image: image, State: { Running: true }, HostConfig: { RestartPolicy: { Name: 'no' }, Tmpfs: { '/var/lib/postgresql/data': 'rw' } }, Mounts: [], NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55493' }] } } };
  checkTarget(env, options, [container]);
  assert.throws(() => checkTarget({ ...env, DB04I_APPROVED: '' }, options, [container]));
  assert.throws(() => checkTarget(env, { ...options, host: 'example.test' }, [container]));
  assert.throws(() => checkTarget(env, options, [{ ...container, Image: 'other' }]));
  assert.throws(() => checkTarget(env, options, [{ ...container, Mounts: [{}] }]));
  assert.throws(() => checkTarget(env, options, [{ ...container, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55493' }] } } }]));
});

test('observer configuration requires independent role on the same TLS loopback target', () => {
  const env = { POSTGRES_TLS: 'verify-full', DB04I_OBSERVER_URL: `postgres://${observerRole}:synthetic@127.0.0.1:55493/${database}` };
  const runner = { host: '127.0.0.1', port: 55493, database, user: role };
  const options = observerOptions(env, runner);
  assert.equal(options.user, observerRole);
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.query_timeout, 5000);
  assert.throws(() => observerOptions({ ...env, DB04I_OBSERVER_URL: undefined }, runner));
  assert.throws(() => observerOptions({ ...env, POSTGRES_TLS: 'disable' }, runner));
  assert.throws(() => observerOptions({ ...env, DB04I_OBSERVER_URL: env.DB04I_OBSERVER_URL.replace(observerRole, role) }, runner));
  assert.throws(() => observerOptions({ ...env, DB04I_OBSERVER_URL: env.DB04I_OBSERVER_URL.replace('127.0.0.1', 'example.test') }, runner));
  assert.throws(() => observerOptions({ ...env, DB04I_OBSERVER_URL: env.DB04I_OBSERVER_URL.replace('55493', '55494') }, runner));
  assert.throws(() => observerOptions({ ...env, DB04I_OBSERVER_URL: `${env.DB04I_OBSERVER_URL}?sslmode=disable` }, runner));
});

test('observer preflight accepts only the verified runner and always closes', async () => {
  const valid = { db: database, role: observerRole, session_role: observerRole, observer_pid: 12, visible: true, runner_matches: '1', others: '0' };
  async function probe(row: Record<string, unknown> | undefined, fail?: 'connect' | 'query' | 'end') {
    const calls: string[] = [];
    const client = {
      async connect() { calls.push('connect'); if (fail === 'connect') throw new Error('connection failed'); },
      async query(sql: string, values?: unknown[]) {
        calls.push('query');
        assert.match(sql, /pg_has_role\(current_user, 'pg_read_all_stats', 'USAGE'\)/);
        assert.match(sql, /NOT r\.rolsuper/);
        assert.match(sql, /datname = current_database\(\) AND pid = \$1\s+AND usename = \$2 AND backend_type = 'client backend'/);
        assert.doesNotMatch(sql, /client_addr/);
        assert.deepEqual(values, [11, role]);
        if (fail === 'query') throw new Error('query failed');
        return { rows: row ? [row] : [] };
      },
      async end() { calls.push('end'); if (fail === 'end') throw new Error('cleanup failed'); },
    };
    return { calls, run: () => checkObserver(client, 11) };
  }
  const good = await probe(valid);
  await good.run();
  assert.deepEqual(good.calls, ['connect', 'query', 'end']);
  for (const row of [
    { ...valid, visible: false }, { ...valid, db: 'other' }, { ...valid, role: role },
    { ...valid, session_role: role }, { ...valid, observer_pid: 11 },
    { ...valid, runner_matches: '0' }, { ...valid, others: '1' }, { ...valid, others: null }, undefined,
  ]) {
    const fake = await probe(row);
    await assert.rejects(fake.run());
    assert.equal(fake.calls.at(-1), 'end');
  }
  for (const failure of ['connect', 'query', 'end'] as const) {
    const fake = await probe(valid, failure);
    await assert.rejects(fake.run());
    assert.equal(fake.calls.at(-1), 'end');
  }
});

test('observer matches the runner across NAT without accepting mismatched or additional sessions', async () => {
  type Session = { pid: number; db: string; user: string; address: string; backend: string };
  const runner: Session = { pid: 11, db: database, user: role, address: '172.19.0.1', backend: 'client backend' };
  async function probe(sessions: Session[], runnerPid = 11) {
    let closed = false;
    const client = {
      async connect() {},
      async query(sql: string, values?: unknown[]) {
        assert.match(sql, /datname = current_database\(\) AND pid = \$1\s+AND usename = \$2 AND backend_type = 'client backend'/);
        assert.match(sql, /datname = current_database\(\) AND pid <> pg_backend_pid\(\) AND pid <> \$1/);
        assert.doesNotMatch(sql, /client_addr/);
        assert.deepEqual(values, [runnerPid, role]);
        const matches = sessions.filter((s) => s.db === database && s.pid === runnerPid && s.user === role && s.backend === 'client backend');
        const others = sessions.filter((s) => s.db === database && s.pid !== 12 && s.pid !== runnerPid);
        return { rows: [{ db: database, role: observerRole, session_role: observerRole, observer_pid: 12, visible: true, runner_matches: String(matches.length), others: String(others.length) }] };
      },
      async end() { closed = true; },
    };
    try { await checkObserver(client, runnerPid); } finally { assert.equal(closed, true); }
  }
  await probe([runner]); // The source address is intentionally not loopback.
  await assert.rejects(probe([{ ...runner, pid: 13 }]));
  await assert.rejects(probe([{ ...runner, user: 'wrong_role' }]));
  await assert.rejects(probe([{ ...runner, db: 'wrong_database' }]));
  await assert.rejects(probe([{ ...runner, backend: 'background worker' }]));
  await assert.rejects(probe([runner, { ...runner, pid: 13 }]));
  await assert.rejects(probe([runner], 0));
});
