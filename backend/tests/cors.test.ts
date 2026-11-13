import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { configureCors } from '../src/config/cors';

function appFor(value: string | undefined) {
  const app = express();
  app.use(configureCors(value));
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

test('allowlist permits exact normalized origins and denies others', async () => {
  const app = appFor(' HTTPS://Example.COM:443 , http://localhost:3000 ');
  for (const origin of ['https://example.com', 'http://localhost:3000']) {
    const response = await request(app).get('/healthz').set('Origin', origin).expect(200);
    assert.equal(response.headers['access-control-allow-origin'], origin);
    assert.match(response.headers.vary, /Origin/i);
  }
  for (const origin of ['https://evil.example.com', 'http://example.com', 'null']) {
    const response = await request(app).get('/healthz').set('Origin', origin).expect(200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
  }
});

test('preflight grants only allowed origins and no-Origin requests work', async () => {
  const app = appFor('https://example.com');
  const allowed = await request(app).options('/healthz').set('Origin', 'https://example.com')
    .set('Access-Control-Request-Method', 'GET').expect(204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://example.com');
  const denied = await request(app).options('/healthz').set('Origin', 'https://other.example')
    .set('Access-Control-Request-Method', 'GET');
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  const health = await request(app).get('/healthz').expect(200);
  assert.deepEqual(health.body, { status: 'ok' });
  assert.equal(health.headers['access-control-allow-origin'], undefined);
});

test('absent configuration preserves unrestricted legacy CORS', async () => {
  const app = appFor(undefined);
  const response = await request(app).get('/healthz').set('Origin', 'https://any.example').expect(200);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  const preflight = await request(app).options('/healthz').set('Origin', 'https://any.example')
    .set('Access-Control-Request-Method', 'GET').expect(204);
  assert.equal(preflight.headers['access-control-allow-origin'], '*');
});

test('malformed configuration fails closed', () => {
  for (const value of ['', ' ', ',', 'https://example.com,', '*', 'https://*.example.com',
    'ftp://example.com', 'https://example.com/', 'https://example.com/path',
    'https://user:pass@example.com', 'https://example.com?x', 'https://example.com#x',
    'https://example.com\\evil', 'https://example.com:99999', 'https://example.com:',
    'https://%2a.example.com', 'https://']) {
    assert.throws(() => appFor(value), /Invalid CORS_ALLOWED_ORIGINS configuration/);
  }
});

test('application installs the configured policy without accessing repositories', async () => {
  process.env.SECRET_KEY = '0123456789abcdef'.repeat(4);
  const { createApplication } = await import('../src/application');
  const previous = process.env.CORS_ALLOWED_ORIGINS;
  try {
    process.env.CORS_ALLOWED_ORIGINS = 'https://example.com';
    const app = createApplication({} as Parameters<typeof createApplication>[0]);
    const response = await request(app).get('/healthz').set('Origin', 'https://other.example').expect(200);
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    process.env.CORS_ALLOWED_ORIGINS = '';
    assert.throws(() => createApplication({} as Parameters<typeof createApplication>[0]), /Invalid CORS_ALLOWED_ORIGINS/);
  } finally {
    if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS;
    else process.env.CORS_ALLOWED_ORIGINS = previous;
  }
});
