import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import './helpers/test-env';

test('IP limits are disabled by default', async () => {
  delete process.env.AUTH_IP_RATE_LIMIT_ENABLED;
  process.env.AUTH_LOGIN_IP_MAX = '2';
  process.env.AUTH_REGISTER_IP_MAX = '2';
  const { app } = await import('./helpers/test-app');

  for (const route of ['login', 'register']) {
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/api/v1/${route}`).send({}).expect(400);
    }
  }
});

test('opt-in IP limits count invalid requests and ignore spoofed forwarding headers', async () => {
  process.env.AUTH_IP_RATE_LIMIT_ENABLED = 'true';
  const { app } = await import('./helpers/test-app');
  // Simulate an accidental future trust-proxy change: headers still cannot select the bucket.
  app.set('trust proxy', true);

  for (const route of ['login', 'register']) {
    for (let i = 0; i < 2; i++) {
      await request(app).post(`/api/v1/${route}`)
        .set('X-Forwarded-For', `192.0.2.${i + 1}`).send({}).expect(400);
    }
    const response = await request(app).post(`/api/v1/${route}`)
      .set('X-Forwarded-For', '192.0.2.99').send({}).expect(429);
    assert.ok(Number(response.headers['retry-after']) > 0);
    assert.equal(response.body.message, response.body.error);
  }
});
