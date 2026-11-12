import { ClientConfig } from 'pg';
import { databaseProvider, postgresOptions } from './provider';
import { validatePostgresReadiness } from './readiness';

export async function startApplication(env: NodeJS.ProcessEnv, dependencies: {
  readiness?: (options: ClientConfig) => Promise<void>;
  startSqlite?: () => void;
} = {}): Promise<void> {
  const provider = databaseProvider(env);
  if (provider === 'postgres') {
    await (dependencies.readiness ?? validatePostgresReadiness)(postgresOptions(env));
    throw new Error('PostgreSQL runtime is unsupported until DB-04D');
  }
  if (dependencies.startSqlite) return dependencies.startSqlite();
  // App imports models and the SQLite singleton, so load it only for SQLite.
  const { config } = await import('../config/config');
  const { default: app } = await import('../app');
  app.listen(config.PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${config.PORT}/api/v1`);
  });
}
