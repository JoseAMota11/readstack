import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { stagingRegistrationGate } from '../src/middlewares/staging-registration.middleware';

process.env.SECRET_KEY = '0123456789abcdef'.repeat(4);
let invitation: string;
do { invitation = randomBytes(32).toString('hex'); } while (new Set(invitation).size < 12 || /^(.{1,32})\1+$/.test(invitation));
const user = { username: 'Synthetic', email: 'staging-synthetic@example.invalid', password: 'synthetic-password' };

test('configuration accepts absent and random hex, rejects malformed and obvious weak values', () => {
  assert.equal(stagingRegistrationGate(undefined), undefined);
  assert.equal(typeof stagingRegistrationGate(invitation), 'function');
  for (const value of ['', ' ', 'a'.repeat(64), '0123456789'.repeat(6) + '0123', '0123456789abcdef'.repeat(4), 'z'.repeat(64), invitation + '\n', invitation.toUpperCase(), invitation.slice(1)]) {
    assert.throws(() => stagingRegistrationGate(value), { message: 'Invalid STAGING_REGISTRATION_SECRET configuration' });
  }
});

test('invalid configuration fails before database initialization without disclosing the value', () => {
  for (const entry of [['src/index.ts'], ['-e', "require('./src/app')"]]) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', ...entry], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, SECRET_KEY: process.env.SECRET_KEY, DATABASE_PATH: ':memory:', STAGING_REGISTRATION_SECRET: 'bad-synthetic-invitation' }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid STAGING_REGISTRATION_SECRET configuration/);
    assert.doesNotMatch(result.stdout + result.stderr, /bad-synthetic-invitation|Tables created successfully/);
  }
});

test('staging gate, preflight, legacy registration, login and JWT protections', async () => {
  const { createApplication } = await import('../src/application');
  let creates = 0;
  let logins = 0;
  let bookOwner = '';
  const repositories = {
    users: {
      create: async () => { creates++; return { changes: 1 }; },
      find: async () => { logins++; return { token: 'synthetic-token' }; },
    },
    books: { findAll: async (owner: string) => { bookOwner = owner; return { books: [], total: 0, current: 1, totalPages: 0, size: 10 }; } },
  } as unknown as Parameters<typeof createApplication>[0];
  const oldSecret = process.env.STAGING_REGISTRATION_SECRET;
  const oldCors = process.env.CORS_ALLOWED_ORIGINS;
  try {
    process.env.STAGING_REGISTRATION_SECRET = invitation;
    process.env.CORS_ALLOWED_ORIGINS = 'https://frontend.example';
    const app = createApplication(repositories);
    const preflight = await request(app).options('/api/v1/register').set('Origin', 'https://frontend.example')
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,x-staging-registration-secret').expect(204);
    assert.equal(preflight.headers['access-control-allow-origin'], 'https://frontend.example');
    assert.match(preflight.headers['access-control-allow-headers'], /x-staging-registration-secret/i);
    const disallowed = await request(app).options('/api/v1/register').set('Origin', 'https://other.example')
      .set('Access-Control-Request-Method', 'POST');
    assert.equal(disallowed.headers['access-control-allow-origin'], undefined);
    const missing = await request(app).post('/api/v1/register').send(user).expect(403);
    for (const wrong of ['x', 'f'.repeat(64), invitation.slice(0, -1), invitation + 'a']) {
      const denied = await request(app).post('/api/v1/register').set('X-Staging-Registration-Secret', wrong).send({}).expect(403);
      assert.deepEqual(denied.body, missing.body);
    }
    const malformed = await request(app).post('/api/v1/register').set('Content-Type', 'application/json').send('{').expect(403);
    assert.deepEqual(malformed.body, missing.body);
    assert.equal(creates, 0);
    await request(app).post('/api/v1/register').set('X-Staging-Registration-Secret', invitation).send({}).expect(400);
    await request(app).post('/api/v1/register').set('X-Staging-Registration-Secret', invitation).send(user).expect(200);
    assert.equal(creates, 1);
    await request(app).post('/api/v1/login').send(user).expect(200);
    assert.equal(logins, 1);
    await request(app).get('/healthz').expect(200, { status: 'ok' });
    await request(app).get('/api/v1/books').expect(401);
    await request(app).get('/api/v1/books').set('Authorization', 'Bearer invalid').expect(401);
    const expired = jwt.sign({ id: 'synthetic' }, process.env.SECRET_KEY!, { expiresIn: -1 });
    await request(app).get('/api/v1/books').set('Authorization', `Bearer ${expired}`).expect(401);
    const valid = jwt.sign({ id: 'synthetic-owner' }, process.env.SECRET_KEY!);
    await request(app).get('/api/v1/books?userId=other').set('Authorization', `Bearer ${valid}`).expect(200);
    assert.equal(bookOwner, 'synthetic-owner');
    delete process.env.STAGING_REGISTRATION_SECRET;
    const legacy = createApplication(repositories);
    await request(legacy).post('/api/v1/register').send({}).expect(400);
    await request(legacy).post('/api/v1/register').send({ ...user, email: 'legacy-synthetic@example.invalid' }).expect(200);
    assert.equal(creates, 2);
  } finally {
    if (oldSecret === undefined) delete process.env.STAGING_REGISTRATION_SECRET; else process.env.STAGING_REGISTRATION_SECRET = oldSecret;
    if (oldCors === undefined) delete process.env.CORS_ALLOWED_ORIGINS; else process.env.CORS_ALLOWED_ORIGINS = oldCors;
  }
});
