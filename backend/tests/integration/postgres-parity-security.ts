// Explicit invocation only. See DB-04I.md; never run against an unapproved target.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import { Client } from 'pg';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Server } from 'node:http';
import { postgresOptions } from '../../src/database/provider';
import { validatePostgresReadiness } from '../../src/database/readiness';
import { parityCases, parityGenres } from '../helpers/parity-cases';
import { BooksFilters } from '../../src/types/book.type';
import { checkActivity, checkTarget, database, role } from './db04i-guard';

function target() {
  const options = postgresOptions(process.env);
  // Reject configuration before invoking Docker, and never print inspect output.
  const id = process.env.DB04I_CONTAINER_ID || '';
  if (process.env.DB04I_APPROVED !== 'yes' || !/^[a-f0-9]{64}$/.test(id) ||
      options.host !== '127.0.0.1' || options.database !== database || options.user !== role ||
      String(options.port) !== process.env.DB04I_PORT || !/^sha256:[a-f0-9]{64}$/.test(process.env.DB04I_IMAGE_ID || '')) throw new Error('Target rejected');
  const result = spawnSync('docker', ['inspect', id], { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error('Inspection failed');
  checkTarget(process.env, options, JSON.parse(result.stdout));
  return options;
}

async function main() {
  const options = target();
  process.env.SECRET_KEY = randomBytes(32).toString('hex');
  const { createApplication } = await import('../../src/application');
  const { composePostgres } = await import('../../src/database/postgres-composition');
  const { PostgresBookRepository } = await import('../../src/database/postgres-book');
  const client = new Client(options);
  let server: Server | undefined;
  let transaction = false, injectError = false;
  try {
    await client.connect();
    const identity = await client.query('SELECT current_database() AS db, current_user AS role, session_user AS session_role');
    if (identity.rows[0]?.db !== database || identity.rows[0]?.role !== role || identity.rows[0]?.session_role !== role) throw new Error('Identity rejected');
    await validatePostgresReadiness(options, () => ({ connect: async () => {}, query: async (sql) => client.query(sql), end: async () => {} }));
    const collation = await client.query(`SELECT c.collname FROM pg_attribute a JOIN pg_class t ON t.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_collation c ON c.oid = a.attcollation
      WHERE n.nspname = 'public' AND t.relname = 'users' AND a.attname = 'email' AND NOT a.attisdropped`);
    if (collation.rows.length !== 1 || collation.rows[0].collname !== 'C') throw new Error('Collation rejected');
    const empty = await client.query('SELECT NOT EXISTS (SELECT 1 FROM public.users) AND NOT EXISTS (SELECT 1 FROM public.books) AND NOT EXISTS (SELECT 1 FROM public.reviews) AS empty');
    if (empty.rows[0]?.empty !== true) throw new Error('Nonempty target');
    const activity = await client.query(`SELECT (r.rolsuper OR pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER')) AS visible,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()) AS others
      FROM pg_roles r WHERE r.rolname = current_user`);
    checkActivity(activity.rows[0]);
    target();
    await client.query('BEGIN'); transaction = true;
    const adapter = { async query(sql: string, values: unknown[]) {
      if (injectError) { injectError = false; return client.query('SELECT 1 / 0'); }
      return client.query(sql, values);
    } };
    const app = createApplication(composePostgres(adapter));
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });
    const api = () => request(server!);
    const password = 'Synthetic-pass-1';
    const suffix = randomBytes(8).toString('hex');
    const email = `Parity${suffix}@example.test`;
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    async function register(address: string, name: string) {
      await api().post('/api/v1/register').send({ username: name, email: address, password }).timeout(5000).expect(200);
      const login = await api().post('/api/v1/login').send({ email: address, password }).timeout(5000).expect(200);
      const token = login.body.token as string;
      return { token, id: (jwt.verify(token, process.env.SECRET_KEY!) as jwt.JwtPayload).id as string };
    }
    const alice = await register(email, 'SyntheticAlice');
    const bob = await register(email.toLowerCase(), 'SyntheticBob');
    assert.notEqual(alice.id, bob.id);
    await api().post('/api/v1/login').send({ email: `PARITY${suffix}@example.test`, password }).timeout(5000).expect(401);
    await client.query('SAVEPOINT duplicate_probe');
    await api().post('/api/v1/register').send({ username: 'Duplicate', email, password }).timeout(5000).expect(409, { error: 'Este correo ya está en uso.' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_probe');
    await api().post('/api/v1/books').set(auth(alice.token)).send({ title: 'AbC Éclair 100%_done', author: 'Writer', year: 2024, genre: parityGenres, isFavorite: false, userId: bob.id }).timeout(5000).expect(201);
    const repo = new PostgresBookRepository(adapter);
    const sqlite = new Database(':memory:');
    try {
      sqlite.exec('CREATE TABLE fixture (title TEXT, author TEXT, year INTEGER, genre TEXT)');
      sqlite.prepare('INSERT INTO fixture VALUES (?, ?, ?, ?)').run('AbC Éclair 100%_done', 'Writer', 2024, JSON.stringify(parityGenres));
      for (const [field, value, expected] of parityCases) {
        const pattern = field === 'genre' ? `%"${value}"%` : `%${value}%`;
        const result = sqlite.prepare(`SELECT count(*) AS n FROM fixture WHERE ${field} LIKE ?`).get(pattern) as { n: number };
        assert.equal(Boolean(result.n), expected);
        const actual = await repo.findAll(alice.id, { [field]: value, current: 1, size: 10 } as unknown as BooksFilters);
        assert.equal(actual.total, result.n, `Parity mismatch for ${field} ${JSON.stringify(value)}`);
      }
    } finally { sqlite.close(); }
    const list = await repo.findAll(alice.id, { current: 1, size: 10 } as BooksFilters);
    assert.equal(list.total, 1);
    assert.deepEqual(list.books[0].genre, parityGenres);
    const id = list.books[0].id;
    assert.equal((await repo.findAll(bob.id, { current: 1, size: 10 } as BooksFilters)).total, 0);
    await api().get(`/api/v1/books/${id}`).set(auth(bob.token)).timeout(5000).expect(404);
    await api().get(`/api/v1/books/${id}/export`).set(auth(bob.token)).timeout(5000).expect(404);
    await api().patch(`/api/v1/books/${id}`).set(auth(bob.token)).send({ title: 'intrusion', userId: alice.id }).timeout(5000).expect(400);
    await api().delete(`/api/v1/books/${id}`).set(auth(bob.token)).timeout(5000).expect(400);
    const review = { bookId: id, userId: alice.id, rating: 3, comment: 'synthetic' };
    await api().post('/api/v1/reviews').set(auth(bob.token)).send(review).timeout(5000).expect(404);
    await api().post('/api/v1/reviews').set(auth(alice.token)).send(review).timeout(5000).expect(201);
    await api().get(`/api/v1/reviews/${id}`).set(auth(bob.token)).timeout(5000).expect(404);
    const reviews = await api().get(`/api/v1/reviews/${id}`).set(auth(alice.token)).timeout(5000).expect(200);
    assert.equal(reviews.body.length, 1);
    const reviewId = reviews.body[0].id;
    await api().put(`/api/v1/reviews/${reviewId}`).set(auth(bob.token)).send(review).timeout(5000).expect(404);
    await api().delete(`/api/v1/reviews/${reviewId}`).set(auth(bob.token)).timeout(5000).expect(404);
    const unchanged = await api().get(`/api/v1/reviews/${id}`).set(auth(alice.token)).timeout(5000).expect(200);
    assert.equal(unchanged.body.length, 1);
    assert.equal(unchanged.body[0].comment, 'synthetic');
    assert.equal((await repo.findOneById(id, alice.id))?.title, 'AbC Éclair 100%_done');
    for (const [method, path, body, status, error] of [
      ['get', '/api/v1/books/not-a-uuid', undefined, 404, 'Este libro no está disponible'],
      ['get', '/api/v1/books/not-a-uuid/export', undefined, 404, 'Este libro no está disponible'],
      ['patch', '/api/v1/books/not-a-uuid', { title: 'changed' }, 400, 'No se pudo actualizar el libro. Verifica los datos e inténtalo de nuevo.'],
      ['delete', '/api/v1/books/not-a-uuid', undefined, 400, 'No se pudo borrar el libro. Verifica los datos e inténtalo de nuevo.'],
      ['get', '/api/v1/reviews/not-a-uuid', undefined, 404, 'Recurso no disponible.'],
      ['put', '/api/v1/reviews/not-a-uuid', review, 404, 'Recurso no disponible.'],
      ['delete', '/api/v1/reviews/not-a-uuid', undefined, 404, 'Recurso no disponible.'],
    ] as const) {
      const call = api()[method](path).set(auth(alice.token)).timeout(5000);
      await (body ? call.send(body) : call).expect(status, { error });
    }
    const invalidReview = await api().post('/api/v1/reviews').set(auth(alice.token)).send({ ...review, bookId: 'not-a-uuid' }).timeout(5000).expect(400);
    assert.equal(invalidReview.body.message, 'Error en la validación de los datos.');
    await client.query('SAVEPOINT error_probe');
    injectError = true;
    const failure = await api().get('/api/v1/books').set(auth(alice.token)).timeout(5000).expect(500);
    assert.deepEqual(failure.body, { error: 'Ocurrió un error al obtener los libros.' });
    assert.doesNotMatch(failure.text, /division|zero|SELECT|postgres|connection|stack|sql/i);
    await client.query('ROLLBACK TO SAVEPOINT error_probe');
    assert.equal((await repo.findAll(alice.id, { current: 1, size: 10 } as BooksFilters)).total, 1);
    console.log('DB-04I assertions passed; rollback still required.');
  } finally {
    if (server) {
      try { await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())); }
      catch { process.exitCode = 1; console.error('HTTP shutdown failed; isolate target.'); }
    }
    if (transaction) {
      try { await client.query('ROLLBACK'); console.log('DB-04I rollback completed.'); }
      catch { process.exitCode = 1; console.error('Rollback failed; isolate target.'); }
    }
    try { await client.end(); } catch { process.exitCode = 1; console.error('Client shutdown failed; isolate target.'); }
  }
}

const watchdog = setTimeout(() => { console.error('DB-04I timeout; isolate target.'); process.exit(1); }, 120000);
main().catch(() => { console.error('DB-04I failed; isolate target and consult the procedure.'); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
