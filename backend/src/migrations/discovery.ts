import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface LedgerEntry {
  version: string;
  filename: string;
  checksum: string;
}

export interface Migration extends LedgerEntry {
  bytes: Buffer;
}

// Only regular SQL files are migrations; other, non-SQL directory entries are ignored.
export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries.filter((entry) => /\.sql$/i.test(entry.name));

  for (const file of files) {
    if (!file.isFile() || !/^\d{4}_[a-zA-Z0-9][a-zA-Z0-9_-]*\.sql$/.test(file.name)) {
      throw new Error(`Invalid migration filename or file type: ${file.name}`);
    }
  }

  files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (files.length === 0) throw new Error('No migrations found');

  const migrations: Migration[] = [];
  for (const [index, file] of files.entries()) {
    const version = file.name.slice(0, 4);
    if (version !== String(index + 1).padStart(4, '0')) {
      throw new Error(`Migration versions must be contiguous from 0001: ${file.name}`);
    }
    const bytes = await readFile(path.join(directory, file.name));
    const checksum = createHash('sha256').update(bytes).digest('hex');
    migrations.push({ version, filename: file.name, checksum, bytes });
  }
  return migrations;
}

// The ledger must already be ordered by version and exactly match an applied prefix.
export function planPendingMigrations(migrations: readonly Migration[], ledger: readonly LedgerEntry[]): Migration[] {
  for (const [index, applied] of ledger.entries()) {
    const migration = migrations[index];
    if (!migration || applied.version !== migration.version ||
        applied.filename !== migration.filename || applied.checksum !== migration.checksum) {
      throw new Error(`Migration ledger mismatch at position ${index + 1}`);
    }
  }
  return migrations.slice(ledger.length);
}
