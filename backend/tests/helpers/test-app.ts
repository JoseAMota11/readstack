import './test-env';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after } from 'node:test';
import app from '../../src/app';
import db from '../../src/config/db';
import {
  REPO_DB_PATH,
  TEST_TEMP_DIR,
  hashFile,
  repoDbHashBefore,
} from './test-env';

export { app, db };

after(() => {
  db.close();

  if (repoDbHashBefore !== null) {
    assert.equal(
      hashFile(REPO_DB_PATH),
      repoDbHashBefore,
      'backend/library.db must not change during tests'
    );
  }

  fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
});
