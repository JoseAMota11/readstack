import './helpers/test-env';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import test, { after } from 'node:test';
import request from 'supertest';
import { TEST_TEMP_DIR } from './helpers/test-env';
import { createApplication } from '../src/application';
import { composePostgres } from '../src/database/postgres-composition';

after(() => rmSync(TEST_TEMP_DIR, { recursive: true, force: true }));

test('health check responds without authentication or database queries', async () => {
  let queries = 0;
  const repositories = composePostgres({
    async query() {
      queries++;
      throw new Error('Unexpected database query');
    },
  });
  const response = await request(createApplication(repositories)).get('/healthz').expect(200);
  assert.deepEqual(response.body, { status: 'ok' });
  assert.equal(queries, 0);
});
