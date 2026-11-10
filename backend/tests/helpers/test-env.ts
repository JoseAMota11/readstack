import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Imported before any application module so the database and auth configuration
// are read from these test-only values.
const repoDbPath = path.resolve(__dirname, '../../library.db');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'readstack-test-'));
const databasePath = path.join(tempDir, 'test-library.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = databasePath;
process.env.SECRET_KEY = '0123456789abcdef'.repeat(4);

if (!path.isAbsolute(databasePath)) {
  throw new Error('Test database path must be absolute.');
}

if (path.resolve(databasePath) === path.resolve(repoDbPath)) {
  throw new Error('Refusing to run tests against backend/library.db.');
}

if (!path.resolve(databasePath).startsWith(`${path.resolve(tempDir)}${path.sep}`)) {
  throw new Error('Test database must live inside the isolated temp directory.');
}

export const TEST_SECRET = process.env.SECRET_KEY as string;
export const TEST_DB_PATH = databasePath;
export const TEST_TEMP_DIR = tempDir;
