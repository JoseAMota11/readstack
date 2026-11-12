import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Client, ClientConfig } from 'pg';
import { adaptPgClient } from './pg-adapter';
import { MigrationClient, runMigrations } from './runner';

const acknowledgement = 'I_APPROVE_LOCAL_DISPOSABLE_MIGRATIONS';
const runnerErrors = new Set([
  'Migration discovery failed', 'Migration lock acquisition failed',
  'Migration ledger setup failed', 'Migration ledger validation failed',
  'Migration execution failed', 'Migration commit outcome is uncertain',
  'Migration unlock failed', 'Migration client cleanup failed',
]);

export function localOptions(env: NodeJS.ProcessEnv): ClientConfig {
  if (Object.keys(env).some((key) => /^PG/i.test(key))) throw new Error('Invalid migration configuration');
  const host = env.READSTACK_MIGRATION_HOST;
  const port = env.READSTACK_MIGRATION_PORT;
  const database = env.READSTACK_MIGRATION_DATABASE;
  const user = env.READSTACK_MIGRATION_USER;
  const password = env.READSTACK_MIGRATION_PASSWORD;
  if ((host !== '127.0.0.1' && host !== '::1') || !port || !/^[0-9]+$/.test(port) ||
      Number(port) < 1 || Number(port) > 65535 || !database ||
      !/^readstack_disposable_[a-z0-9_]+$/.test(database) || database.length > 63 ||
      !user || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(user) || !password || !password.trim() ||
      env.READSTACK_MIGRATION_CONFIRM_LOCAL !== acknowledgement) {
    throw new Error('Invalid migration configuration');
  }
  return { host, port: Number(port), database, user, password, ssl: false, connectionTimeoutMillis: 5000 };
}

export function migrationDirectory(moduleDirectory: string = __dirname): string {
  return path.resolve(moduleDirectory, '../../migrations');
}

interface Dependencies {
  createClient: (options: ClientConfig) => Client;
  run: (client: MigrationClient, directory: string) => Promise<void>;
  moduleDirectory: string;
  error: (message: string) => void;
}

export async function migrationCli(env: NodeJS.ProcessEnv, overrides: Partial<Dependencies> = {}): Promise<number> {
  const deps: Dependencies = {
    createClient: (options) => new Client(options), run: runMigrations,
    moduleDirectory: __dirname, error: (message) => console.error(message), ...overrides,
  };
  let stage = 'Invalid migration configuration';
  let client: Client | undefined;
  let handedOff = false;
  try {
    const options = localOptions(env);
    stage = 'Migration directory unavailable';
    const directory = migrationDirectory(deps.moduleDirectory);
    if (!(await stat(directory)).isDirectory()) throw new Error();
    stage = 'Migration connection failed';
    client = deps.createClient(options);
    await client.connect();
    const adapter = adaptPgClient(client);
    handedOff = true;
    stage = 'Migration failed';
    await deps.run(adapter, directory);
    return 0;
  } catch (error) {
    if (handedOff && error instanceof Error && runnerErrors.has(error.message)) stage = error.message;
    deps.error(stage);
    return 1;
  } finally {
    if (client && !handedOff) {
      try { await client.end(); } catch { /* Keep the original sanitized error. */ }
    }
  }
}

if (require.main === module) {
  void migrationCli(process.env).then((code) => { process.exitCode = code; });
}
