import { ClientConfig } from 'pg';

export function databaseProvider(env: NodeJS.ProcessEnv): 'sqlite' | 'postgres' {
  if (env.DATABASE_PROVIDER === undefined || env.DATABASE_PROVIDER === 'sqlite') return 'sqlite';
  if (env.DATABASE_PROVIDER === 'postgres') return 'postgres';
  throw new Error('Invalid database provider');
}

// Deliberately reject URL options and libpq environment overrides: neither may weaken TLS.
export function postgresOptions(env: NodeJS.ProcessEnv): ClientConfig {
  try {
    if (Object.keys(env).some((key) => /^PG/i.test(key)) || !env.DATABASE_URL ||
        env.POSTGRES_TLS !== 'verify-full') throw new Error();
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || !url.pathname || url.pathname === '/' ||
        url.search || url.hash || (url.port && (Number(url.port) < 1 || Number(url.port) > 65535))) throw new Error();
    return {
      host: url.hostname, port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.slice(1)),
      ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 5000,
      query_timeout: 5000, statement_timeout: 5000,
    };
  } catch {
    throw new Error('Invalid PostgreSQL configuration');
  }
}
