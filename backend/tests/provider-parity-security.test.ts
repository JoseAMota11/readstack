import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app as sqliteApp } from './helpers/test-app';
import { TEST_SECRET } from './helpers/test-env';
import { createApplication } from '../src/application';
import { composePostgres } from '../src/database/postgres-composition';
import { PostgresBookRepository } from '../src/database/postgres-book';
import { BooksFilters } from '../src/types/book.type';
import { parityCases, parityGenres } from './helpers/parity-cases';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const auth = { Authorization: `Bearer ${jwt.sign({ id: owner, username: 'synthetic' }, TEST_SECRET)}` };

test('SQLite search baseline and PostgreSQL parameter construction, including compact JSON genres', async () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE fixture (title TEXT, author TEXT, year INTEGER, genre TEXT)');
    db.prepare('INSERT INTO fixture VALUES (?, ?, ?, ?)').run('AbC Éclair 100%_done', 'Writer', 2024, JSON.stringify(parityGenres));
    for (const [field, value, expected] of parityCases) {
      const pattern = field === 'genre' ? `%"${value}"%` : `%${value}%`;
      const found = db.prepare(`SELECT count(*) AS n FROM fixture WHERE ${field} LIKE ?`).get(pattern) as { n: number };
      assert.equal(Boolean(found.n), expected, `${field}: ${JSON.stringify(value)}`);
      let calls = 0;
      const repo = new PostgresBookRepository({ async query(sql, values) {
        calls++;
        assert.match(sql, /b\.user_id = \$1/);
        assert.match(sql, /COLLATE "C" LIKE translate\(\$2::text/);
        assert.match(sql, /ESCAPE ''/);
        if (field === 'genre') assert.match(sql, /jsonb_array_elements\(b\.genre\) WITH ORDINALITY/);
        assert.equal(values[1], pattern);
        return sql.includes('COUNT(*) AS total') ? { rows: [{ total: '0' }], rowCount: 1 } : { rows: [], rowCount: 0 };
      } });
      await repo.findAll(owner, { [field]: value, current: 1, size: 10 } as BooksFilters);
      assert.equal(calls, 2);
    }
  } finally { db.close(); }
});

test('malformed route IDs retain endpoint-specific inaccessible-resource responses for both providers', async () => {
  let queries = 0;
  const pgApp = createApplication(composePostgres({ async query() { queries++; throw new Error('must not query'); } }));
  for (const app of [sqliteApp, pgApp]) {
    for (const [method, path, body, status, error] of [
      ['get', '/api/v1/books/not-a-uuid', undefined, 404, 'Este libro no está disponible'],
      ['get', '/api/v1/books/not-a-uuid/export', undefined, 404, 'Este libro no está disponible'],
      ['patch', '/api/v1/books/not-a-uuid', { title: 'changed' }, 400, 'No se pudo actualizar el libro. Verifica los datos e inténtalo de nuevo.'],
      ['delete', '/api/v1/books/not-a-uuid', undefined, 400, 'No se pudo borrar el libro. Verifica los datos e inténtalo de nuevo.'],
      ['get', '/api/v1/reviews/not-a-uuid', undefined, 404, 'Recurso no disponible.'],
      ['put', '/api/v1/reviews/not-a-uuid', { bookId: id, userId: other, rating: 3, comment: 'synthetic' }, 404, 'Recurso no disponible.'],
      ['delete', '/api/v1/reviews/not-a-uuid', undefined, 404, 'Recurso no disponible.'],
    ] as const) {
      const req = request(app)[method](path).set(auth);
      const response = await (body ? req.send(body) : req).expect(status);
      assert.deepEqual(response.body, { error });
    }
    const invalid = await request(app).post('/api/v1/reviews').set(auth)
      .send({ bookId: 'not-a-uuid', userId: other, rating: 3, comment: 'synthetic' }).expect(400);
    assert.equal(invalid.body.message, 'Error en la validación de los datos.');
  }
  assert.equal(queries, 0);
});

test('registration case sensitivity and duplicate response: SQLite and injected PostgreSQL constraint', async () => {
  const emails = new Set<string>();
  const pgApp = createApplication(composePostgres({ async query(sql, values) {
    assert.match(sql, /INSERT INTO public\.users/);
    const email = values[2] as string;
    if (emails.has(email)) throw Object.assign(new Error('private driver'), { code: '23505', constraint: 'users_email_key' });
    emails.add(email);
    return { rows: [], rowCount: 1 };
  } }));
  for (const [app, prefix] of [[sqliteApp, 'sqlite'], [pgApp, 'postgres']] as const) {
    const user = { username: 'Synthetic', email: `${prefix}ParityCase@example.test`, password: 'Password123!' };
    await request(app).post('/api/v1/register').send(user).expect(200, { message: 'Usuario creado satisfactoriamente' });
    await request(app).post('/api/v1/register').send({ ...user, email: `${prefix}paritycase@example.test` }).expect(200);
    await request(app).post('/api/v1/register').send(user).expect(409, { error: 'Este correo ya está en uso.' });
  }
});

test('PostgreSQL driver failures are sanitized through all HTTP routes', async () => {
  const app = createApplication(composePostgres({ async query() { throw new Error('SELECT secret synthetic-credential stack-marker driver-detail'); } }));
  const book = { title: 'Synthetic', author: 'Author', year: 2020, genre: ['Test'], isFavorite: false, userId: other };
  const review = { bookId: id, userId: other, rating: 3, comment: 'synthetic' };
  const calls = [
    request(app).post('/api/v1/register').send({ username: 'Synthetic', email: 'failure@example.test', password: 'Password123!' }),
    request(app).post('/api/v1/login').send({ email: 'failure@example.test', password: 'Password123!' }),
    request(app).get('/api/v1/books').set(auth), request(app).get(`/api/v1/books/${id}`).set(auth),
    request(app).get(`/api/v1/books/${id}/export`).set(auth), request(app).post('/api/v1/books').set(auth).send(book),
    request(app).patch(`/api/v1/books/${id}`).set(auth).send({ title: 'Changed' }), request(app).delete(`/api/v1/books/${id}`).set(auth),
    request(app).get(`/api/v1/reviews/${id}`).set(auth), request(app).post('/api/v1/reviews').set(auth).send(review),
    request(app).put(`/api/v1/reviews/${id}`).set(auth).send(review), request(app).delete(`/api/v1/reviews/${id}`).set(auth),
  ];
  for (const call of calls) {
    const response = await call.expect(500);
    assert.doesNotMatch(response.text, /SELECT|synthetic-credential|stack-marker|driver-detail/);
  }
});

test('PostgreSQL HTTP mutations use token owner and atomic book/review predicates', async () => {
  const statements: string[] = [];
  let bookInsert: { sql: string; values: unknown[] } | undefined;
  const app = createApplication(composePostgres({ async query(sql, values) {
    statements.push(sql);
    if (sql.includes('INSERT INTO public.books')) {
      bookInsert = { sql, values };
    } else if (sql.includes('INSERT INTO public.reviews')) {
      assert.match(sql, /FROM public\.books b\s+WHERE b\.id = \$4 AND b\.user_id = \$5/);
      assert.deepEqual(values.slice(3), [id, owner]);
    } else if (sql.includes('UPDATE public.reviews')) {
      assert.match(sql, /r\.book_id = \$3 AND r\.id = \$4 AND r\.user_id = \$5/);
      assert.match(sql, /b\.id = r\.book_id AND b\.user_id = r\.user_id/);
      assert.deepEqual(values.slice(2), [id, id, owner]);
    } else if (sql.includes('DELETE FROM public.reviews')) {
      assert.match(sql, /r\.id = \$1 AND r\.user_id = \$2/);
      assert.match(sql, /b\.id = r\.book_id AND b\.user_id = r\.user_id/);
      assert.deepEqual(values, [id, owner]);
    } else if (sql.includes('UPDATE public.books')) {
      assert.match(sql, /WHERE user_id = \$2 AND id = \$3/);
      assert.deepEqual(values.slice(1), [owner, id]);
    } else if (sql.includes('DELETE FROM public.books')) {
      assert.match(sql, /WHERE id = \$1 AND user_id = \$2/);
      assert.deepEqual(values, [id, owner]);
    } else {
      assert.match(sql, /WHERE b\.id = \$1 AND b\.user_id = \$2/);
      assert.deepEqual(values, [id, owner]);
    }
    return { rows: [], rowCount: 0 };
  } }));
  const book = { title: 'Synthetic', author: 'Author', year: 2020, genre: ['Quote"here', 'Back\\slash', '100%', 'under_score', '😀', 'é\n'], isFavorite: false, userId: other };
  const review = { bookId: id, userId: other, rating: 3, comment: 'synthetic' };
  await request(app).get(`/api/v1/books/${id}`).set(auth).expect(404);
  await request(app).get(`/api/v1/reviews/${id}`).set(auth).expect(404);
  await request(app).post('/api/v1/books').set(auth).send(book).expect(500);
  await request(app).patch(`/api/v1/books/${id}`).set(auth).send({ title: 'Changed', userId: other }).expect(400);
  await request(app).delete(`/api/v1/books/${id}`).set(auth).expect(400);
  await request(app).post('/api/v1/reviews').set(auth).send(review).expect(404);
  await request(app).put(`/api/v1/reviews/${id}`).set(auth).send(review).expect(404);
  await request(app).delete(`/api/v1/reviews/${id}`).set(auth).expect(404);
  assert.equal(statements.length, 8);
  assert.ok(bookInsert);
  assert.match(bookInsert.sql, /FROM public\.users u WHERE u\.id = \$9/);
  assert.equal(bookInsert.values[8], owner);
  assert.equal(bookInsert.values[4], JSON.stringify(book.genre));
});
