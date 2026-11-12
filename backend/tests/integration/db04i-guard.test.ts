import test from 'node:test';
import assert from 'node:assert/strict';
import { checkActivity, checkTarget, database, role } from './db04i-guard';

test('DB-04I rejects missing approval, identity mismatch and unsafe bindings', () => {
  const id = 'a'.repeat(64), image = `sha256:${'b'.repeat(64)}`;
  const env = { DB04I_APPROVED: 'yes', DATABASE_PROVIDER: 'postgres', DB04I_CONTAINER_ID: id, DB04I_IMAGE_ID: image, DB04I_PORT: '55493' };
  const options = { host: '127.0.0.1', port: 55493, database, user: role };
  const container = { Id: id, Image: image, State: { Running: true }, HostConfig: { RestartPolicy: { Name: 'no' }, Tmpfs: { '/var/lib/postgresql/data': 'rw' } }, Mounts: [], NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55493' }] } } };
  checkTarget(env, options, [container]);
  assert.throws(() => checkTarget({ ...env, DB04I_APPROVED: '' }, options, [container]));
  assert.throws(() => checkTarget(env, { ...options, host: 'example.test' }, [container]));
  assert.throws(() => checkTarget(env, options, [{ ...container, Image: 'other' }]));
  assert.throws(() => checkTarget(env, options, [{ ...container, Mounts: [{}] }]));
  assert.throws(() => checkTarget(env, options, [{ ...container, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55493' }] } } }]));
  checkActivity({ visible: true, others: '0' });
  assert.throws(() => checkActivity({ visible: false, others: '0' }));
  assert.throws(() => checkActivity({ visible: true, others: '1' }));
  assert.throws(() => checkActivity({ visible: true, others: null }));
  assert.throws(() => checkActivity(undefined));
});
