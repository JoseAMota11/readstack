import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const invalidSecrets: Array<[string, string | undefined]> = [
  ['missing', undefined],
  ['empty', ''],
  ['whitespace', ' \t '],
  ['legacy fallback', 'READ_GROUP_PUBLIC'],
  ['too short', 'a'.repeat(63)],
  ['too long', 'a'.repeat(65)],
  ['non-hex', `${'a'.repeat(63)}z`],
  ['trailing newline', `${'a'.repeat(64)}\n`],
  ['embedded whitespace', `${'a'.repeat(32)} ${'b'.repeat(31)}`],
];

function environment(databasePath: string, nodeEnv: string, secret?: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    NODE_ENV: nodeEnv,
    DATABASE_PATH: databasePath,
    PORT: '0',
    ...(secret === undefined ? {} : { SECRET_KEY: secret }),
  };
}

for (const nodeEnv of ['production', 'development', 'test', '']) {
  test(`database does not log SQL or bound values in ${nodeEnv || 'unset'} environment`, () => {
    const script = `
      const db = require('./src/config/db').default;
      db.prepare('SELECT ? AS synthetic_sql_marker').get('synthetic_bound_value');
      db.close();
    `;
    const env = environment(':memory:', nodeEnv);
    if (!nodeEnv) delete env.NODE_ENV;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env,
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, /CREATE TABLE|foreign_keys|synthetic_sql_marker|synthetic_bound_value/i);
    assert.match(output, /Tables created successfully/);
  });
}

for (const nodeEnv of ['test', 'production']) {
  for (const [label, secret] of invalidSecrets) {
    test(`${nodeEnv} rejects ${label} before startup or app database initialization`, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readstack-config-'));
      try {
        for (const entry of [['src/index.ts'], ['-e', "require('./src/app')"]]) {
          const databasePath = path.join(dir, 'isolated.db');
          const result = spawnSync(process.execPath, ['--import', 'tsx', ...entry], {
            cwd: path.resolve(__dirname, '..'),
            env: environment(databasePath, nodeEnv, secret),
            encoding: 'utf8',
            timeout: 10000,
          });
          assert.ifError(result.error);
          assert.notEqual(result.status, 0);
          const output = result.stdout + result.stderr;
          assert.match(output, /SECRET_KEY must be exactly 64 hexadecimal characters/);
          if (secret && secret.trim()) assert.ok(!output.includes(secret));
          assert.equal(fs.existsSync(databasePath), false);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}

for (const [label, secret, nodeEnv] of [
  ['lowercase', '0123456789abcdef'.repeat(4), 'test'],
  ['uppercase', '0123456789ABCDEF'.repeat(4), 'test'],
  ['lowercase', '0123456789abcdef'.repeat(4), 'production'],
  ['uppercase', '0123456789ABCDEF'.repeat(4), 'production'],
]) {
  test(`${nodeEnv} starts with a valid ${label} synthetic key without disclosing it`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readstack-config-'));
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: path.resolve(__dirname, '..'),
      env: environment(path.join(dir, 'isolated.db'), nodeEnv, secret),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
        const finish = (error?: Error) => {
          clearTimeout(timeout);
          if (error) reject(error);
          else resolve();
        };
        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
          if (output.includes('Servidor corriendo')) finish();
        });
        child.stderr.on('data', (chunk) => { output += chunk.toString(); });
        child.once('error', finish);
        child.once('close', () => finish(new Error('Server exited before listening')));
      });
      assert.equal(fs.existsSync(path.join(dir, 'isolated.db')), true);
    } finally {
      child.kill();
      await closed;
      fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.ok(!output.includes(secret));
  });
}
