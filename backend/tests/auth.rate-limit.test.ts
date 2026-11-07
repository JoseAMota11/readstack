import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import { PASSWORD, registerUser } from './helpers/fixtures';

test('login limits known and unknown accounts equally and preserves other logins', async () => {
  const user = await registerUser('rate-known');
  const unknown = 'rate-unknown@example.test';
  // registerUser already logged in once, so bring both accounts to the same count.
  await request(app).post('/api/v1/login').send({ email: unknown, password: PASSWORD }).expect(401);

  for (let i = 0; i < 9; i++) {
    for (const email of [user.email, unknown]) {
      await request(app).post('/api/v1/login')
        .send({ email, password: `${PASSWORD}-wrong` }).expect(401);
    }
  }

  const known = await request(app).post('/api/v1/login')
    .send({ email: user.email.toUpperCase(), password: PASSWORD }).expect(429);
  const missing = await request(app).post('/api/v1/login')
    .send({ email: unknown, password: PASSWORD }).expect(429);
  assert.deepEqual(known.body, missing.body);
  assert.equal(known.body.message, known.body.error);
  assert.ok(Number(known.headers['retry-after']) > 0);
  assert.ok(Number(missing.headers['retry-after']) > 0);

  const other = await registerUser('rate-other');
  assert.ok(other.token);
});

test('registration limits an identifier without changing the duplicate response below the limit', async () => {
  const email = 'rate-register@example.test';
  const body = { username: 'rate-register', email, password: PASSWORD };
  await request(app).post('/api/v1/register').send(body).expect(200);
  for (let i = 0; i < 4; i++) {
    await request(app).post('/api/v1/register').send(body).expect(409);
  }
  const response = await request(app).post('/api/v1/register')
    .send({ ...body, email: email.toUpperCase() }).expect(429);
  assert.ok(Number(response.headers['retry-after']) > 0);
  assert.equal(response.body.message, response.body.error);
});

test('account limit expires after its window', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const body = { email: 'rate-expiry@example.test', password: PASSWORD };
  for (let i = 0; i < 10; i++) {
    await request(app).post('/api/v1/login').send(body).expect(401);
  }
  await request(app).post('/api/v1/login').send(body).expect(429);
  t.mock.timers.tick(15 * 60 * 1000 + 1);
  await request(app).post('/api/v1/login').send(body).expect(401);
});
