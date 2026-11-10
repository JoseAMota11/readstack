import './test-env';
import fs from 'node:fs';
import { after } from 'node:test';
import app from '../../src/app';
import db from '../../src/config/db';
import { TEST_TEMP_DIR } from './test-env';

export { app, db };

after(() => {
  db.close();

  fs.rmSync(TEST_TEMP_DIR, { recursive: true, force: true });
});
