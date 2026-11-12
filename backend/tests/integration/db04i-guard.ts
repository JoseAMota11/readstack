import type { ClientConfig } from 'pg';
import { postgresOptions } from '../../src/database/provider';

export const database = 'readstack_disposable_db04i';
export const role = 'readstack_db04i_runner';
export const observerRole = 'readstack_db04i_observer';

export function checkTarget(env: NodeJS.ProcessEnv, options: ClientConfig, inspect: unknown): void {
  const id = env.DB04I_CONTAINER_ID;
  const image = env.DB04I_IMAGE_ID;
  const port = env.DB04I_PORT;
  if (env.DB04I_APPROVED !== 'yes' || env.DATABASE_PROVIDER !== 'postgres' ||
      !/^[a-f0-9]{64}$/.test(id || '') || !/^sha256:[a-f0-9]{64}$/.test(image || '') ||
      !/^[1-9][0-9]{0,4}$/.test(port || '') || Number(port) > 65535 ||
      options.host !== '127.0.0.1' || options.port !== Number(port) ||
      options.database !== database || options.user !== role || !Array.isArray(inspect) || inspect.length !== 1) throw new Error('Target rejected');
  const c = inspect[0];
  const bindings = c?.NetworkSettings?.Ports?.['5432/tcp'];
  if (c?.Id !== id || c.Image !== image || !c.State?.Running || c.HostConfig?.RestartPolicy?.Name !== 'no' ||
      c.Mounts?.length !== 0 || !c.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] ||
      !Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' ||
      Number(bindings[0].HostPort) !== Number(port)) throw new Error('Target rejected');
}

export function observerOptions(env: NodeJS.ProcessEnv, runner: ClientConfig): ClientConfig {
  const options = postgresOptions({ ...env, DATABASE_URL: env.DB04I_OBSERVER_URL });
  if (options.host !== '127.0.0.1' || options.host !== runner.host || options.port !== runner.port ||
      options.database !== database || options.database !== runner.database || options.user !== observerRole ||
      runner.user !== role) throw new Error('Observer target rejected');
  return options;
}

interface ObserverClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
}

// The separate client must close successfully before the caller begins its write transaction.
export async function checkObserver(client: ObserverClient, runnerPid: number): Promise<void> {
  try {
    if (!Number.isSafeInteger(runnerPid) || runnerPid <= 0) throw new Error('Runner identity rejected');
    await client.connect();
    const result = await client.query(`SELECT current_database() AS db, current_user AS role, session_user AS session_role,
      pg_backend_pid() AS observer_pid, NOT r.rolsuper AND pg_has_role(current_user, 'pg_read_all_stats', 'USAGE') AS visible,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid = $1
        AND usename = $2 AND backend_type = 'client backend' AND client_addr = inet '127.0.0.1') AS runner_matches,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND pid <> $1) AS others
      FROM pg_roles r WHERE r.rolname = current_user`, [runnerPid, role]);
    const row = result.rows[0];
    if (result.rows.length !== 1 || row?.db !== database || row.role !== observerRole || row.session_role !== observerRole ||
        !Number.isSafeInteger(row.observer_pid) || (row.observer_pid as number) <= 0 || row.observer_pid === runnerPid || row.visible !== true ||
        (row.runner_matches !== '1' && row.runner_matches !== 1) || (row.others !== '0' && row.others !== 0)) {
      throw new Error('Session isolation rejected');
    }
  } finally {
    await client.end();
  }
}
