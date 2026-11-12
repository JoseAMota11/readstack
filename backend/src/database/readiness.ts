import path from 'node:path';
import { Client, ClientConfig } from 'pg';
import { discoverMigrations, planPendingMigrations, LedgerEntry } from '../migrations/discovery';

export interface ReadinessClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

// Scope is intentionally limited to application columns, nullability, keys and ownership FKs.
const columns: Record<string, Record<string, string>> = {
  users: { id: 'uuid!', username: 'text!', email: 'text!', password: 'text!', created_at: 'timestamp with time zone!' },
  books: { id: 'uuid!', user_id: 'uuid!', title: 'text!', author: 'text!', year: 'integer!', genre: 'jsonb!', cover_image: 'text', rating: 'double precision', is_favorite: 'boolean!', description: 'text', reading_status: 'text!', created_at: 'timestamp with time zone!', updated_at: 'timestamp with time zone!' },
  reviews: { id: 'uuid!', book_id: 'uuid!', user_id: 'uuid!', rating: 'integer!', comment: 'text!', created_at: 'timestamp with time zone!' },
  schema_migrations: { version: 'text!', filename: 'text!', checksum: 'text!', applied_at: 'timestamp with time zone!' },
};

const columnQuery = `SELECT c.relname AS table_name, a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('users', 'books', 'reviews', 'schema_migrations')
  AND a.attnum > 0 AND NOT a.attisdropped`;

const constraintQuery = `SELECT c.relname AS table_name, con.contype AS kind,
  ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY AS k(num, ord)
    JOIN pg_catalog.pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num ORDER BY k.ord) AS columns,
  rn.nspname AS ref_schema, rc.relname AS ref_table,
  ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY AS k(num, ord)
    JOIN pg_catalog.pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num ORDER BY k.ord) AS ref_columns,
  con.confdeltype AS delete_action, con.convalidated AS validated
  FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
  LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('users', 'books', 'reviews', 'schema_migrations')
  AND con.contype IN ('p', 'u', 'f')`;

function checkSchema(columnRows: Record<string, unknown>[], constraints: Record<string, unknown>[]): void {
  for (const [table, expected] of Object.entries(columns)) {
    for (const [name, type] of Object.entries(expected)) {
      if (!columnRows.some((r) => r.table_name === table && r.column_name === name &&
        `${r.type}${r.not_null === true ? '!' : ''}` === type)) throw new Error();
    }
  }
  const has = (table: string, kind: string, keys: string[], ref?: string, refKeys?: string[]) =>
    constraints.some((r) => r.table_name === table && r.kind === kind && r.validated === true &&
      JSON.stringify(r.columns) === JSON.stringify(keys) && (!ref ||
      (r.ref_schema === 'public' && r.ref_table === ref && r.delete_action === 'c' &&
       JSON.stringify(r.ref_columns) === JSON.stringify(refKeys))));
  if (!has('users', 'p', ['id']) || !has('users', 'u', ['email']) ||
      !has('books', 'p', ['id']) || !has('books', 'u', ['id', 'user_id']) ||
      !has('reviews', 'p', ['id']) || !has('schema_migrations', 'p', ['version']) ||
      !has('books', 'f', ['user_id'], 'users', ['id']) ||
      !has('reviews', 'f', ['book_id', 'user_id'], 'books', ['id', 'user_id'])) throw new Error();
}

// Bound each operation even when an injected client or a driver cleanup stalls.
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), 5000);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function validatePostgresReadiness(
  options: ClientConfig,
  createClient: (options: ClientConfig) => ReadinessClient = (config) => new Client(config),
  directory = path.resolve(__dirname, '../../migrations'),
): Promise<void> {
  let client: ReadinessClient | undefined;
  let stage = 'PostgreSQL migration discovery failed';
  let failure: string | undefined;
  try {
    const migrations = await discoverMigrations(directory);
    stage = 'PostgreSQL connection failed';
    client = createClient(options);
    await bounded(client.connect());
    stage = 'PostgreSQL migration ledger not ready';
    const result = await bounded(client.query('SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version'));
    const ledger: LedgerEntry[] = result.rows.map((r) => {
      if (typeof r.version !== 'string' || typeof r.filename !== 'string' || typeof r.checksum !== 'string') throw new Error();
      return { version: r.version, filename: r.filename, checksum: r.checksum };
    });
    if (planPendingMigrations(migrations, ledger).length !== 0) throw new Error();
    stage = 'PostgreSQL schema incompatible';
    const columnResult = await bounded(client.query(columnQuery));
    const constraintResult = await bounded(client.query(constraintQuery));
    checkSchema(columnResult.rows, constraintResult.rows);
  } catch {
    failure = stage;
  } finally {
    if (client) {
      try { await bounded(client.end()); } catch { if (!failure) failure = 'PostgreSQL client cleanup failed'; }
    }
  }
  if (failure) throw new Error(failure);
}
