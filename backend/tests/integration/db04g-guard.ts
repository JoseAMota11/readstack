import type { ClientConfig } from 'pg';

export const containerId = '0b33e7bb22bebfc11cf4289747bab878c05cb1e9cac384c76bd113b7cfea064b';
export const database = 'readstack_disposable_db04f';
export const role = 'readstack_db04f_runner';

// These checks supplement, but cannot replace, explicit owner authorization and independent identity verification.
export function checkTarget(options: ClientConfig, image: string | undefined, inspect: unknown): void {
  if (options.host !== '127.0.0.1' || options.port !== 55491 || options.database !== database || options.user !== role ||
      !/^sha256:[a-f0-9]{64}$/.test(image || '') || !Array.isArray(inspect) || inspect.length !== 1) throw new Error('Target rejected');
  const c = inspect[0];
  const bindings = c?.NetworkSettings?.Ports?.['5432/tcp'];
  if (c?.Id !== containerId || c.Image !== image || !c.State?.Running || c.HostConfig?.RestartPolicy?.Name !== 'no' ||
      c.Mounts?.length !== 0 || !c.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] ||
      !Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' ||
      Number(bindings[0].HostPort) !== 55491) throw new Error('Target rejected');
}
