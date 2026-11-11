import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from './helpers/test-app';
import { PASSWORD, auth, registerUser } from './helpers/fixtures';
import { TEST_SECRET } from './helpers/test-env';

const BOOK_ID = '00000000-0000-4000-8000-000000000001';
const REVIEW_ID = '00000000-0000-4000-8000-000000000002';

const protectedRoutes = [
  ['get', '/api/v1/books'],
  ['get', `/api/v1/books/${BOOK_ID}`],
  ['get', `/api/v1/books/${BOOK_ID}/export`],
  ['post', '/api/v1/books'],
  ['patch', `/api/v1/books/${BOOK_ID}`],
  ['delete', `/api/v1/books/${BOOK_ID}`],
  ['get', `/api/v1/reviews/${BOOK_ID}`],
  ['post', '/api/v1/reviews'],
  ['put', `/api/v1/reviews/${REVIEW_ID}`],
  ['delete', `/api/v1/reviews/${REVIEW_ID}`],
] as const;

for (const [method, url] of protectedRoutes) {
  test(`rejects unauthenticated ${method.toUpperCase()} ${url}`, async () => {
    const response = await (request(app) as any)[method](url);
    assert.equal(response.status, 401);
  });
}

test('registers a user and rejects a duplicate email', async () => {
  const username = `auth-${Date.now()}`;
  const email = `${username}@example.test`;

  await request(app)
    .post('/api/v1/register')
    .send({ username, email, password: PASSWORD })
    .expect(200);

  const duplicate = await request(app)
    .post('/api/v1/register')
    .send({ username, email, password: PASSWORD });

  assert.equal(duplicate.status, 409);
});

test('logs in with valid credentials and returns a usable token', async () => {
  const user = await registerUser('login');

  await request(app).get('/api/v1/books').set(auth(user.token)).expect(200);
});

test('rejects a wrong password', async () => {
  const user = await registerUser('wrongpass');

  const response = await request(app)
    .post('/api/v1/login')
    .send({ email: user.email, password: `${PASSWORD}-wrong` });

  assert.equal(response.status, 401);
});

test('rejects login for an unknown email', async () => {
  const response = await request(app)
    .post('/api/v1/login')
    .send({ email: 'unknown@example.test', password: PASSWORD });

  assert.equal(response.status, 401);
});

test('unknown and known invalid logins both perform a cost-10 bcrypt comparison', async (t) => {
  const user = await registerUser('timing');
  const originalCompare = bcrypt.compareSync;
  const costs: number[] = [];
  t.mock.method(bcrypt, 'compareSync', ((password: string, hash: string) => {
    costs.push(bcrypt.getRounds(hash));
    return originalCompare(password, hash);
  }) as typeof bcrypt.compareSync);

  const known = await request(app).post('/api/v1/login')
    .send({ email: user.email, password: `${PASSWORD}-wrong` }).expect(401);
  const unknown = await request(app).post('/api/v1/login')
    .send({ email: 'timing-unknown@example.test', password: `${PASSWORD}-wrong` }).expect(401);
  assert.deepEqual(known.body, unknown.body);
  assert.deepEqual(costs, [10, 10]);

  // Even the dummy hash's matching input must never authenticate an unknown user.
  await request(app).post('/api/v1/login')
    .send({ email: 'timing-unknown@example.test', password: 'synthetic dummy password' }).expect(401);
});

test('rejects invalid registration and login payloads', async () => {
  await request(app)
    .post('/api/v1/register')
    .send({ username: 'ab', email: 'not-an-email', password: '123' })
    .expect(400);

  await request(app)
    .post('/api/v1/login')
    .send({ email: 'not-an-email', password: '123' })
    .expect(400);
});

test('rejects a malformed authorization header', async () => {
  await request(app)
    .get('/api/v1/books')
    .set('Authorization', 'Bearer')
    .expect(401);

  await request(app)
    .get('/api/v1/books')
    .set('Authorization', 'Bearer not-a-jwt')
    .expect(401);

  await request(app)
    .get('/api/v1/books')
    .set('Authorization', 'Basic dXNlcjpwYXNz')
    .expect(401);
});

test('rejects a token signed with a different secret', async () => {
  const user = await registerUser('wrongsecret');
  const foreignToken = jwt.sign({ id: user.userId }, 'fedcba9876543210'.repeat(4), {
    expiresIn: '1h',
  });

  await request(app)
    .get('/api/v1/books')
    .set(auth(foreignToken))
    .expect(401);
});

test('rejects an expired token', async () => {
  const user = await registerUser('expired');
  const expiredToken = jwt.sign({ id: user.userId }, TEST_SECRET, {
    expiresIn: -60,
  });

  await request(app)
    .get('/api/v1/books')
    .set(auth(expiredToken))
    .expect(401);
});
