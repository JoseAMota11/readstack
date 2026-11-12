import { Client } from 'pg';
import { MigrationClient } from './runner';

// pg returns an array for simple-protocol multi-statement queries.
export function adaptPgClient(client: Client): MigrationClient {
  return {
    async query(sql, params) {
      const result = await client.query(sql, params) as unknown as
        { rows: Record<string, unknown>[] } | { rows: Record<string, unknown>[] }[];
      return Array.isArray(result) ? { rows: result.flatMap((item) => item.rows) } : { rows: result.rows };
    },
    end: () => client.end(),
  };
}
