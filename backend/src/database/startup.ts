import { Pool, PoolConfig } from 'pg';
import type { ClientConfig } from 'pg';
import type { Server } from 'node:http';
import { databaseProvider, postgresOptions } from './provider';
import { validatePostgresReadiness } from './readiness';
import type { PostgresUserClient } from './postgres-user';
import type { Repositories } from './composition';

interface ApplicationPool extends PostgresUserClient {
  end(): Promise<void>;
  on(event: 'error', listener: () => void): unknown;
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 5000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function startApplication(env: NodeJS.ProcessEnv, dependencies: {
  readiness?: (options: ClientConfig) => Promise<void>;
  startSqlite?: () => void;
  createPool?: (options: PoolConfig) => ApplicationPool;
  compose?: (pool: ApplicationPool) => Repositories;
  listen?: (repositories: Repositories) => Promise<Server>;
  installSignals?: boolean;
  registerShutdown?: (shutdown: () => Promise<void>) => void;
} = {}): Promise<void> {
  const provider = databaseProvider(env);
  if (provider === 'sqlite') {
    if (dependencies.startSqlite) return dependencies.startSqlite();
    const { config } = await import('../config/config');
    const { default: app } = await import('../app');
    app.listen(config.PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${config.PORT}/api/v1`);
    });
    return;
  }

  const options = postgresOptions(env);
  await (dependencies.readiness ?? validatePostgresReadiness)(options);
  let pool: ApplicationPool | undefined;
  let server: Server | undefined;
  try {
    pool = (dependencies.createPool ?? ((settings) => new Pool(settings)))({
      ...options, max: 5, idleTimeoutMillis: 10000,
    });
    pool.on('error', () => console.error('PostgreSQL connection error'));
    const compose = dependencies.compose ?? (await import('./postgres-composition')).composePostgres;
    const repositories = compose(pool);
    if (!repositories?.users || !repositories?.books || !repositories?.reviews) throw new Error();
    const listen = dependencies.listen ?? (async (repos: Repositories) => {
      const { config } = await import('../config/config');
      const { createApplication } = await import('../application');
      const app = createApplication(repos);
      return await new Promise<Server>((resolve, reject) => {
        const server = app.listen(config.PORT, () => {
          console.log(`Servidor corriendo en http://localhost:${config.PORT}/api/v1`);
          resolve(server);
        });
        server.once('error', reject);
      });
    });
    server = await listen(repositories);
    const listeningServer = server;
    if (dependencies.installSignals !== false) {
      let stopping: Promise<void> | undefined;
      const shutdown = (): Promise<void> => {
        if (!stopping) stopping = (async () => {
          try {
            await bounded(new Promise<void>((resolve, reject) => listeningServer.close((error) => error ? reject(error) : resolve())));
          } catch {
            listeningServer.closeAllConnections();
            process.exitCode = 1;
          }
          try { await bounded(pool!.end()); } catch { process.exitCode = 1; console.error('PostgreSQL client cleanup failed'); }
        })();
        return stopping;
      };
      if (dependencies.registerShutdown) dependencies.registerShutdown(shutdown);
      else {
        process.once('SIGTERM', () => { void shutdown(); });
        process.once('SIGINT', () => { void shutdown(); });
      }
    }
  } catch {
    if (server) {
      try { await bounded(new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()))); }
      catch { server.closeAllConnections(); }
    }
    if (pool) {
      try { await bounded(pool.end()); } catch { console.error('PostgreSQL client cleanup failed'); }
    }
    throw new Error('PostgreSQL application startup failed');
  }
}
