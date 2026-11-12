import type { ClientConfig } from 'pg';

export const database = 'readstack_disposable_db04i';
export const role = 'readstack_db04i_runner';

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

export function checkActivity(row: Record<string, unknown> | undefined): void {
  if (row?.visible !== true || (row.others !== '0' && row.others !== 0)) throw new Error('Session isolation rejected');
}
