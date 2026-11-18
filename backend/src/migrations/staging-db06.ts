import { Client, ClientConfig } from 'pg';
import { postgresOptions } from '../database/provider';
import { migrationDirectory } from './cli';
import { Migration } from './discovery';
import { adaptPgClient } from './pg-adapter';
import { MigrationClient, runMigrations } from './runner';

const directHost = /^ep-still-hall-bcrtmjpj\.(?:c-[0-9]+\.)?us-east-1\.aws\.neon\.tech$/;
const checksum = 'eebd5434f261f2974edccc1eb8cc6c91137f1f5567fbe2d5273a6810a05bb085';
const approval = 'I_APPROVE_DB06_INITIALIZE_sparkling-cherry-00280862_br-crimson-block-bcr4joma_ep-still-hall-bcrtmjpj';

export function stagingOptions(env: NodeJS.ProcessEnv): ClientConfig {
  if (env.DB06_PROJECT !== 'sparkling-cherry-00280862' || env.DB06_BRANCH !== 'br-crimson-block-bcr4joma' ||
      env.DB06_ENDPOINT !== 'ep-still-hall-bcrtmjpj' || !env.DB06_HOST || !directHost.test(env.DB06_HOST) ||
      env.DB06_CONSOLE_VERIFIED !== 'yes' || env.DB06_BETA_SEPARATION_VERIFIED !== 'yes' ||
      env.DB06_APPROVAL !== approval || env.NODE_ENV === 'production' || env.DATABASE_URL !== undefined ||
      env.DATABASE_PATH !== undefined || (env.DATABASE_PROVIDER !== undefined && env.DATABASE_PROVIDER !== 'postgres') ||
      env.NODE_TLS_REJECT_UNAUTHORIZED !== undefined || env.NODE_OPTIONS !== undefined ||
      !env.DB06_DATABASE_URL || /[?#]/.test(env.DB06_DATABASE_URL)) throw new Error('Target rejected');
  const options = postgresOptions({ ...env, DATABASE_URL: env.DB06_DATABASE_URL, POSTGRES_TLS: 'verify-full' });
  if (options.host !== env.DB06_HOST || options.port !== 5432 || options.database !== 'neondb' || options.user !== 'neondb_owner') {
    throw new Error('Target rejected');
  }
  return options;
}

export function checkManifest(migrations: readonly Migration[]): void {
  if (migrations.length !== 1 || migrations[0].version !== '0001' ||
      migrations[0].filename !== '0001_initial_schema.sql' || migrations[0].checksum !== checksum) throw new Error();
}

// Called in the same direct session while the runner holds its advisory lock.
// An existing ledger is deliberately refused, including a previously successful run.
export async function stagingPreflight(client: MigrationClient): Promise<void> {
  const identity = await client.query(`SELECT current_database() AS db, current_user AS role,
    session_user AS session_role, current_setting('transaction_read_only') AS read_only,
    pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS can_create`);
  const row = identity.rows[0];
  if (identity.rows.length !== 1 || row.db !== 'neondb' || row.role !== 'neondb_owner' ||
      row.session_role !== 'neondb_owner' || row.read_only !== 'off' || row.can_create !== true) throw new Error();
  await client.query('SET search_path TO public');
  const state = await client.query(`SELECT
    pg_catalog.pg_my_temp_schema() = 0
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public') AS empty`);
  if (state.rows.length !== 1 || state.rows[0].empty !== true) throw new Error();
}

interface Dependencies {
  createClient: (options: ClientConfig) => Client;
  directory: string;
  error: (message: string) => void;
}

export async function stagingCli(env: NodeJS.ProcessEnv, overrides: Partial<Dependencies> = {}): Promise<number> {
  const deps: Dependencies = { createClient: (options) => new Client(options), directory: migrationDirectory(),
    error: (message) => console.error(message), ...overrides };
  let client: Client | undefined;
  let handedOff = false;
  let stage = 'Staging target rejected';
  try {
    const options = stagingOptions(env);
    stage = 'Staging connection failed';
    client = deps.createClient(options);
    await client.connect();
    handedOff = true;
    stage = 'Staging initialization failed; independently verify target and outcome before any retry';
    await runMigrations(adaptPgClient(client), deps.directory, {
      manifest: checkManifest, preflight: stagingPreflight, exclusivePublicLedger: true,
    });
    return 0;
  } catch {
    deps.error(stage);
    return 1;
  } finally {
    if (client && !handedOff) {
      try { await client.end(); } catch { /* Preserve sanitized failure. */ }
    }
  }
}

if (require.main === module) {
  void stagingCli(process.env).then((code) => { process.exitCode = code; });
}
