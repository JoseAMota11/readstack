import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client, ClientConfig } from 'pg';
import { localOptions, migrationCli, migrationDirectory } from '../src/migrations/cli';
import { adaptPgClient } from '../src/migrations/pg-adapter';

const env = {
  READSTACK_MIGRATION_HOST: '127.0.0.1', READSTACK_MIGRATION_PORT: '5432',
  READSTACK_MIGRATION_DATABASE: 'readstack_disposable_test', READSTACK_MIGRATION_USER: 'tester',
  READSTACK_MIGRATION_PASSWORD: 'fake-secret',
  READSTACK_MIGRATION_CONFIRM_LOCAL: 'I_APPROVE_LOCAL_DISPOSABLE_MIGRATIONS',
};

class FakeClient {
  events: string[] = [];
  calls: unknown[][] = [];
  result: unknown = { rows: [] };
  connectError = false;
  endError = false;
  async connect() { this.events.push('connect'); if (this.connectError) throw new Error('fake-secret SQL postgres://secret'); }
  async end() { this.events.push('end'); if (this.endError) throw new Error('fake-secret'); }
  async query(...args: unknown[]) { this.calls.push(args); return this.result; }
  asClient() { return this as unknown as Client; }
}

test('rejects invalid configuration before constructing a client', async () => {
  const cases: NodeJS.ProcessEnv[] = [
    {}, ...Object.keys(env).map((key) => ({ ...env, [key]: '' })),
    ...['localhost', '/tmp', 'postgres://127.0.0.1/db', '127.0.0.2', '::ffff:127.0.0.1'].map((host) => ({ ...env, READSTACK_MIGRATION_HOST: host })),
    ...['0', '65536', '-1', '1.5', ' 5432', '1e3'].map((port) => ({ ...env, READSTACK_MIGRATION_PORT: port })),
    ...['postgres', 'readstack_disposable_', 'readstack_disposable_TEST', 'postgres://host/db'].map((database) => ({ ...env, READSTACK_MIGRATION_DATABASE: database })),
    { ...env, READSTACK_MIGRATION_USER: 'user@host' }, { ...env, READSTACK_MIGRATION_PASSWORD: '  ' },
    { ...env, PGHOST: '' }, { ...env, pgservice: 'fake' },
  ];
  for (const invalid of cases) {
    let constructed = false;
    const errors: string[] = [];
    const code = await migrationCli(invalid, { createClient: () => { constructed = true; throw new Error(); }, error: (s) => errors.push(s) });
    assert.equal(code, 1);
    assert.equal(constructed, false);
    assert.deepEqual(errors, ['Invalid migration configuration']);
  }
  assert.equal(localOptions({ ...env, READSTACK_MIGRATION_HOST: '::1', READSTACK_MIGRATION_PORT: '65535' }).port, 65535);
});

test('uses exact options, connects, and transfers cleanup ownership to the runner', async () => {
  const client = new FakeClient();
  let options: ClientConfig | undefined;
  const code = await migrationCli({ ...env, DATABASE_URL: 'ignored', DATABASE_PATH: 'ignored' }, {
    createClient: (value) => { options = value; return client.asClient(); },
    run: async (adapter, directory) => {
      assert.deepEqual(client.events, ['connect']);
      assert.equal(directory, migrationDirectory());
      await adapter.end();
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(options, { host: '127.0.0.1', port: 5432, database: 'readstack_disposable_test', user: 'tester', password: 'fake-secret', ssl: false, connectionTimeoutMillis: 5000 });
  assert.deepEqual(client.events, ['connect', 'end']);
});

test('adapter forwards SQL and parameters and normalizes results', async () => {
  const client = new FakeClient();
  const adapter = adaptPgClient(client.asClient());
  const params = ['one', 'two'];
  client.result = { rows: [{ id: 1 }] };
  assert.deepEqual(await adapter.query('SELECT $1', params), { rows: [{ id: 1 }] });
  assert.equal(client.calls[0][1], params);
  client.result = [{ rows: [{ a: 1 }] }, { rows: [] }, { rows: [{ b: 2 }] }];
  assert.deepEqual(await adapter.query('one; two; three'), { rows: [{ a: 1 }, { b: 2 }] });
  assert.deepEqual(client.calls[1], ['one; two; three', undefined]);
  await adapter.end();
  assert.deepEqual(client.events, ['end']);
});

test('connection failure cleans up once and hides raw errors, including cleanup errors', async () => {
  const client = new FakeClient();
  client.connectError = true;
  client.endError = true;
  const errors: string[] = [];
  const code = await migrationCli(env, { createClient: () => client.asClient(), error: (message) => errors.push(message) });
  assert.equal(code, 1);
  assert.deepEqual(client.events, ['connect', 'end']);
  assert.deepEqual(errors, ['Migration connection failed']);
});

test('runner owns cleanup on failure and only allowlisted errors are printed', async () => {
  for (const [message, expected] of [['fake-secret SQL postgres://secret', 'Migration failed'], ['Migration commit outcome is uncertain', 'Migration commit outcome is uncertain']]) {
    const client = new FakeClient();
    const errors: string[] = [];
    const code = await migrationCli(env, {
      createClient: () => client.asClient(), error: (s) => errors.push(s),
      run: async (adapter) => { await adapter.end(); throw new Error(message); },
    });
    assert.equal(code, 1);
    assert.deepEqual(client.events, ['connect', 'end']);
    assert.deepEqual(errors, [expected]);
  }
});

test('resolves source and dist directories independently of cwd and rejects missing directory before client creation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'readstack-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'src', 'migrations');
  const dist = path.join(root, 'dist', 'migrations');
  await mkdir(path.join(root, 'migrations'), { recursive: true });
  assert.equal(migrationDirectory(source), path.join(root, 'migrations'));
  assert.equal(migrationDirectory(dist), path.join(root, 'migrations'));
  const original = process.cwd();
  try {
    for (const cwd of [root, os.tmpdir()]) {
      process.chdir(cwd);
      assert.equal(migrationDirectory(source), path.join(root, 'migrations'));
      const client = new FakeClient();
      assert.equal(await migrationCli(env, { moduleDirectory: source, createClient: () => client.asClient(), run: async (adapter) => adapter.end() }), 0);
    }
  } finally { process.chdir(original); }
  let constructed = false;
  const errors: string[] = [];
  assert.equal(await migrationCli(env, { moduleDirectory: path.join(root, 'missing', 'src', 'migrations'), createClient: () => { constructed = true; throw new Error(); }, error: (s) => errors.push(s) }), 1);
  assert.equal(constructed, false);
  assert.deepEqual(errors, ['Migration directory unavailable']);
});

test('ordinary application source does not reference migration modules', async () => {
  const src = path.resolve(__dirname, '../src');
  async function scan(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'migrations' && dir === src) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (entry.name.endsWith('.ts')) assert.doesNotMatch(await readFile(file, 'utf8'), /(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*migrations(?:\/|['"])/);
    }
  }
  await scan(src);
  const pkg = JSON.parse(await readFile(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.equal(pkg.scripts.start, 'node dist/index.js');
  assert.doesNotMatch(pkg.scripts.build, /migrat/i);
  assert.equal(pkg.scripts.postinstall, undefined);
});
