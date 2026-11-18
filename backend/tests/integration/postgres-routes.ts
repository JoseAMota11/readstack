// Explicitly invoked only after the approvals and identity checks in DB-04F.md.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { postgresOptions } from '../../src/database/provider';
import { validatePostgresReadiness } from '../../src/database/readiness';

const database = 'readstack_disposable_db04f';
const role = 'readstack_db04f_runner';
const timeout = 5000;

function checkTarget() {
  if (process.env.DB04F_APPROVED !== 'yes' || !/^[a-f0-9]{64}$/.test(process.env.DB04F_CONTAINER_ID || '') ||
      !/^sha256:[a-f0-9]{64}$/.test(process.env.DB04F_IMAGE_ID || '') || process.env.DATABASE_PROVIDER !== 'postgres') throw new Error('Target approval missing');
  const options = postgresOptions(process.env);
  if (options.host !== '127.0.0.1' || options.database !== database || options.user !== role || !options.port) throw new Error('Target configuration rejected');
  // Inspect by immutable ID, never by a historical name; do not print the result (it may contain secrets).
  const inspect = spawnSync('docker', ['inspect', process.env.DB04F_CONTAINER_ID!], { encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 });
  if (inspect.status !== 0 || inspect.error) throw new Error('Container inspection failed');
  const containers = JSON.parse(inspect.stdout);
  const c = containers[0];
  const bindings = c?.NetworkSettings?.Ports?.['5432/tcp'];
  if (containers.length !== 1 || c.Id !== process.env.DB04F_CONTAINER_ID || c.Image !== process.env.DB04F_IMAGE_ID ||
      !c.State?.Running || c.HostConfig?.RestartPolicy?.Name !== 'no' || c.Mounts?.length !== 0 ||
      !c.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] ||
      !Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' ||
      Number(bindings[0].HostPort) !== options.port) throw new Error('Container identity rejected');
  return options;
}

async function main() {
  const options = checkTarget(); // No network connection before container/configuration checks.
  process.env.SECRET_KEY = randomBytes(32).toString('hex');
  const { createApplication } = await import('../../src/application');
  const { composePostgres } = await import('../../src/database/postgres-composition');
  const client = new Client(options);
  let connected = false;
  let transaction = false;
  try {
    await client.connect();
    connected = true;
    const identity = await client.query('SELECT current_database() AS db, current_user AS role, session_user AS session_role');
    if (identity.rows[0]?.db !== database || identity.rows[0]?.role !== role || identity.rows[0]?.session_role !== role) throw new Error('Database identity rejected');
    await validatePostgresReadiness(options, () => ({
      connect: async () => {}, query: async (sql) => client.query(sql), end: async () => {},
    }));
    const empty = await client.query('SELECT NOT EXISTS (SELECT 1 FROM public.users) AND NOT EXISTS (SELECT 1 FROM public.books) AND NOT EXISTS (SELECT 1 FROM public.reviews) AS empty');
    if (empty.rows[0]?.empty !== true) throw new Error('Database is not empty');
    // Recheck container/port immediately before writes. No reset, migration or cleanup DELETE is performed.
    checkTarget();
    await client.query('BEGIN');
    transaction = true;
    const app = createApplication(composePostgres(client));
    const api = () => request(app);
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const password = 'Synthetic-pass-1';
    const suffix = randomBytes(8).toString('hex');
    async function user(label: string) {
      const email = `${label}-${suffix}@example.test`;
      await api().post('/api/v1/register').send({ username: `${label}-${suffix}`, email, password }).expect(200);
      await api().post('/api/v1/login').send({ email, password: 'wrong-password' }).expect(401);
      const login = await api().post('/api/v1/login').send({ email, password }).expect(200);
      const token = login.body.token as string;
      const claims = jwt.verify(token, process.env.SECRET_KEY!) as jwt.JwtPayload;
      return { token, id: claims.id as string };
    }
    await api().get('/api/v1/books').expect(401);
    await api().get('/api/v1/books').set(auth('invalid')).expect(401);
    const alice = await user('alice');
    const bob = await user('bob');
    async function book(user: { token: string; id: string }, title: string, genre: string[]) {
      await api().post('/api/v1/books').set(auth(user.token)).send({ title, author: 'Synthetic Writer', year: 2020, genre, isFavorite: false, userId: user.id }).expect(201);
      const result = await api().get('/api/v1/books').query({ title }).set(auth(user.token)).expect(200);
      return result.body.books.find((item: { title: string }) => item.title === title);
    }
    const first = await book(alice, 'Harbor One', ['Fiction', 'Mystery']);
    const second = await book(alice, 'Harbor Two', ['Fiction']);
    await book(bob, 'Harbor Foreign', ['Fiction']);
    assert.ok(first?.id && second?.id);
    assert.match(first.createdAt, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    assert.match(first.updatedAt, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    await api().patch(`/api/v1/books/${first.id}`).set(auth(alice.token)).send({ isFavorite: true }).expect(200);
    const detail = await api().get(`/api/v1/books/${first.id}`).set(auth(alice.token)).expect(200);
    assert.equal(detail.body.isFavorite, true);
    assert.equal(detail.body.updatedAt, first.updatedAt);
    await api().get(`/api/v1/books/${first.id}`).set(auth(bob.token)).expect(404);
    await api().get(`/api/v1/books/${first.id}/export`).set(auth(bob.token)).expect(404);
    await api().patch(`/api/v1/books/${first.id}`).set(auth(bob.token)).send({ title: 'intrusion' }).expect(400);
    await api().delete(`/api/v1/books/${first.id}`).set(auth(bob.token)).expect(400);
    await api().get('/api/v1/books/not-a-uuid').set(auth(alice.token)).expect(404);
    await api().get('/api/v1/reviews/not-a-uuid').set(auth(alice.token)).expect(404);
    for (const query of [{ title: 'harbor' }, { title: 'Harbor _%' }, { genre: 'Fiction' }]) {
      const list = await api().get('/api/v1/books').query(query).set(auth(alice.token)).expect(200);
      assert.equal(list.body.pagination.total, 2);
    }
    const page1 = await api().get('/api/v1/books').query({ current: 1, size: 1 }).set(auth(alice.token)).expect(200);
    const page2 = await api().get('/api/v1/books').query({ current: 2, size: 1 }).set(auth(alice.token)).expect(200);
    assert.equal(page1.body.pagination.total, 2);
    const sorted = [page1.body.books[0], page2.body.books[0]];
    assert.notEqual(sorted[0].id, sorted[1].id);
    assert.ok(sorted[0].createdAt > sorted[1].createdAt || (sorted[0].createdAt === sorted[1].createdAt && sorted[0].id > sorted[1].id));
    await api().post('/api/v1/reviews').set(auth(bob.token)).send({ bookId: first.id, userId: bob.id, rating: 4, comment: 'foreign' }).expect(404);
    await api().post('/api/v1/reviews').set(auth(alice.token)).send({ bookId: first.id, userId: alice.id, rating: 4, comment: 'synthetic' }).expect(201);
    await api().get(`/api/v1/reviews/${first.id}`).set(auth(bob.token)).expect(404);
    const reviews = await api().get(`/api/v1/reviews/${first.id}`).set(auth(alice.token)).expect(200);
    assert.equal(reviews.body.length, 1);
    const review = reviews.body[0];
    await api().put(`/api/v1/reviews/${review.id}`).set(auth(bob.token)).send({ bookId: first.id, userId: bob.id, rating: 1, comment: 'foreign' }).expect(404);
    await api().delete(`/api/v1/reviews/${review.id}`).set(auth(bob.token)).expect(404);
    await api().put(`/api/v1/reviews/${review.id}`).set(auth(alice.token)).send({ bookId: first.id, userId: alice.id, rating: 5, comment: 'updated' }).expect(200);
    const csv = await api().get(`/api/v1/books/${first.id}/export`).set(auth(alice.token)).expect(200);
    assert.match(csv.headers['content-type'], /^text\/csv/);
    assert.match(csv.text, /^"id","title","author","year","genre","coverImage","rating","isFavorite","userId","createdAt","updatedAt"/);
    assert.ok(csv.text.includes('Harbor One') && csv.text.includes('Fiction, Mystery'));
    await api().delete(`/api/v1/reviews/${review.id}`).set(auth(alice.token)).expect(200);
    await api().delete(`/api/v1/books/${first.id}`).set(auth(alice.token)).expect(200);
    console.log('DB-04F route assertions passed; rollback still required.');
  } finally {
    if (transaction) {
      try { await client.query('ROLLBACK'); console.log('DB-04F rollback completed.'); }
      catch { process.exitCode = 1; console.error('Rollback failed; isolate target and investigate.'); }
    }
    if (connected) {
      try { await client.end(); }
      catch { process.exitCode = 1; console.error('Client shutdown failed; isolate target and investigate.'); }
    }
  }
}

// Hard wall-clock boundary also covers a stalled connect or shutdown. Termination is not proof of cleanup.
const watchdog = setTimeout(() => { console.error('DB-04F timeout; isolate target and investigate.'); process.exit(1); }, 120000);
main().catch(() => { console.error('DB-04F failed; see safe procedure, do not reuse target.'); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
