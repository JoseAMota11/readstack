import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { gzipSync } from 'node:zlib';
import bcrypt from 'bcrypt';
import { app, db } from './helpers/test-app';
import { auth, createBook, registerUser } from './helpers/fixtures';
import { createApplication } from '../src/application';
import { BookModel } from '../src/models/book.model';
import { userLoginSchema } from '../src/utils/user.schema';

test('fresh development and production applications sanitize parser errors and preserve client statuses', async () => {
  const original = process.env.NODE_ENV;
  try {
    for (const environment of ['development', 'production']) {
      process.env.NODE_ENV = environment;
      const configuredApp = createApplication(app.locals.repositories);
      assert.equal(configuredApp.get('env'), environment);
      const malformed = await request(configuredApp).post('/api/v1/login')
        .set('Content-Type', 'application/json').send('{"email":').expect(400);
      assert.deepEqual(malformed.body, { error: 'JSON no válido.' });
      const oversized = await request(configuredApp).post('/api/v1/login')
        .send({ email: 'a'.repeat(103000), password: 'synthetic' }).expect(413);
      assert.deepEqual(oversized.body, { error: 'La solicitud es demasiado grande.' });
      assert.equal(malformed.headers['x-powered-by'], undefined);
      for (const body of [Buffer.from('not a gzip stream'), gzipSync('{"synthetic":true}').subarray(0, 12)]) {
        const corrupt = await request(configuredApp).post('/api/v1/login')
          .set('Content-Type', 'application/json').set('Content-Encoding', 'gzip')
          .serialize((value) => value).send(body).expect(400);
        assert.deepEqual(corrupt.body, { error: 'JSON no válido.' });
      }
      const unsupported = await request(configuredApp).post('/api/v1/login')
        .set('Content-Type', 'application/json').set('Content-Encoding', 'unsupported')
        .send('{}').expect(415);
      assert.deepEqual(unsupported.body, { error: 'Codificación no admitida.' });
      const compressedOversized = await request(configuredApp).post('/api/v1/login')
        .set('Content-Type', 'application/json').set('Content-Encoding', 'gzip')
        .serialize((value) => value).send(gzipSync(JSON.stringify({ value: 'a'.repeat(103000) }))).expect(413);
      assert.deepEqual(compressedOversized.body, oversized.body);
      await request(configuredApp).post('/api/v1/nonexistent')
        .set('Content-Type', 'application/json').set('Content-Encoding', 'gzip')
        .serialize((value) => value).send(gzipSync('{"synthetic":true}')).expect(404);
      const atLimit = JSON.stringify({ p: 'x'.repeat(102400 - 8) });
      assert.equal(Buffer.byteLength(atLimit), 102400);
      await request(configuredApp).post('/api/v1/nonexistent')
        .set('Content-Type', 'application/json').send(atLimit).expect(404);
      await request(configuredApp).post('/api/v1/nonexistent')
        .set('Content-Type', 'application/json').send(`${atLimit} `).expect(413);
    }
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});

test('application failures cannot select parser statuses with parser-like error properties', async (t) => {
  const user = await registerUser('error-status');
  t.mock.method(BookModel, 'findOneById', async () => {
    throw Object.assign(new Error('synthetic private detail'), {
      status: 400, type: 'entity.parse.failed', code: 'Z_DATA_ERROR',
    });
  });
  const response = await request(app).get('/api/v1/books/00000000-0000-4000-8000-000000000001')
    .set(auth(user.token)).expect(500);
  assert.deepEqual(response.body, { error: 'Error interno del servidor. Por favor, inténtelo más tarde.' });
});

test('pagination and filter boundaries are checked before repository access', async (t) => {
  const user = await registerUser('bounds');
  const findAll = t.mock.method(BookModel, 'findAll', BookModel.findAll);
  for (const value of ['0', '-1', '1.5', 'NaN', 'Infinity', '1e2', '10001', '']) {
    await request(app).get('/api/v1/books').set(auth(user.token)).query({ current: value }).expect(400);
  }
  for (const value of ['0', '-1', '101', '999999999999999999999', '1.2']) {
    await request(app).get('/api/v1/books').set(auth(user.token)).query({ size: value }).expect(400);
  }
  await request(app).get('/api/v1/books').set(auth(user.token)).query({ size: ['1', '2'] }).expect(400);
  await request(app).get('/api/v1/books').set(auth(user.token)).query({ title: 'a'.repeat(501) }).expect(400);
  assert.equal(findAll.mock.callCount(), 0);
  await request(app).get('/api/v1/books').set(auth(user.token)).query({ current: 10000, size: 100 }).expect(200);
});

test('bounds user-controlled fields and rejects large genre arrays before Zod parses elements', async () => {
  const user = await registerUser('fields');
  const book = { title: 'Synthetic', author: 'Writer', year: 2020, genre: ['Fiction'], isFavorite: false, userId: user.userId };
  await request(app).post('/api/v1/books').set(auth(user.token)).send({ ...book, genre: Array(21).fill({}) }).expect(400);
  await request(app).post('/api/v1/books').set(auth(user.token)).send({ ...book, genre: Array(20).fill('Fiction') }).expect(201);
  const boundaryBook = await createBook(user.token, user.userId, {
    title: 't'.repeat(500), author: 'a'.repeat(500), genre: Array(20).fill('g'.repeat(100)),
    coverImage: `https://example.test/${'c'.repeat(2048 - 'https://example.test/'.length)}`,
  });
  const review = { bookId: boundaryBook.id, userId: user.userId, rating: 3, comment: 'a'.repeat(10000) };
  await request(app).post('/api/v1/reviews').set(auth(user.token)).send(review).expect(201);
  const reviews = await request(app).get(`/api/v1/reviews/${boundaryBook.id}`).set(auth(user.token)).expect(200);
  await request(app).put(`/api/v1/reviews/${reviews.body[0].id}`).set(auth(user.token)).send(review).expect(200);
  await request(app).put(`/api/v1/reviews/${reviews.body[0].id}`).set(auth(user.token))
    .send({ ...review, comment: 'a'.repeat(10001) }).expect(400);
  for (const data of [{ title: 'a'.repeat(501) }, { author: 'a'.repeat(501) }, { genre: ['a'.repeat(101)] }, { coverImage: `https://example.test/${'a'.repeat(2048)}` }]) {
    await request(app).post('/api/v1/books').set(auth(user.token)).send({ ...book, ...data }).expect(400);
  }
  await request(app).post('/api/v1/login').send({ email: 'invalid-email', password: 'synthetic' }).expect(400);
  const created = await createBook(user.token, user.userId);
  await request(app).patch(`/api/v1/books/${created.id}`).set(auth(user.token)).send({ genre: Array(21).fill('x') }).expect(400);
  await request(app).post('/api/v1/reviews').set(auth(user.token))
    .send({ bookId: created.id, userId: user.userId, rating: 3, comment: 'a'.repeat(10001) }).expect(400);
});

test('registration has exact boundaries while login preserves legacy credentials within the body limit', async () => {
  const email = `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(56)}.test`;
  assert.equal(email.length, 254);
  const body = { username: 'boundary-account', email, password: 'Synthetic-'.repeat(102) + 'pass' };
  assert.equal(body.password.length, 1024);
  await request(app).post('/api/v1/register').send(body).expect(200);
  await request(app).post('/api/v1/login').send(body).expect(200);
  const longerEmail = email.replace('@', 'a@');
  assert.equal(longerEmail.length, 255);
  // Establish that email syntax alone would accept it, isolating the length boundary.
  assert.equal(userLoginSchema.safeParse({ email: longerEmail, password: body.password }).success, true);
  await request(app).post('/api/v1/register').send({ ...body, email: longerEmail }).expect(400);
  await request(app).post('/api/v1/register').send({ ...body, password: `${body.password}x` }).expect(400);

  const legacy = await registerUser('legacy-login');
  const password = 'Legacy-synthetic-'.repeat(100);
  assert.ok(password.length > 1024);
  // Synthetic fixture only: emulate an account registered before the new registration caps.
  db.prepare('UPDATE Users SET email = ?, password = ? WHERE id = ?')
    .run(longerEmail, bcrypt.hashSync(password, 10), legacy.userId);
  const login = await request(app).post('/api/v1/login').send({ email: longerEmail, password }).expect(200);
  await request(app).get('/api/v1/books').set(auth(login.body.token)).expect(200);
  await request(app).post('/api/v1/login')
    .send({ email: longerEmail, password: `wrong-${password}` }).expect(401);
  await request(app).post('/api/v1/login')
    .send({ email: longerEmail, password: 'x'.repeat(103000) }).expect(413);
});

test('legacy oversized books remain intact through partial edits; full-field grandfathering remains pending', async () => {
  const owner = await registerUser('legacy-book');
  const other = await registerUser('legacy-other');
  const book = await createBook(owner.token, owner.userId);
  const legacy = {
    title: 't'.repeat(501), author: 'a'.repeat(501), genre: Array(21).fill('g'.repeat(101)),
    coverImage: `https://example.test/${'c'.repeat(2048)}`,
  };
  // Deliberately oversized synthetic fixture, never an existing or shared database.
  db.prepare('UPDATE Books SET title = ?, author = ?, genre = ?, coverImage = ? WHERE id = ? AND userId = ?')
    .run(legacy.title, legacy.author, JSON.stringify(legacy.genre), legacy.coverImage, book.id, owner.userId);
  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(owner.token))
    .send({ ...legacy, year: 2024, isFavorite: false, userId: owner.userId }).expect(400);
  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(other.token)).send({ year: 2024 }).expect(400);
  await request(app).patch(`/api/v1/books/${book.id}`).send({ year: 2024 }).expect(401);
  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(owner.token)).send({ year: 2024 }).expect(200);
  const saved = await request(app).get(`/api/v1/books/${book.id}`).set(auth(owner.token)).expect(200);
  assert.equal(saved.body.year, 2024);
  for (const [key, value] of Object.entries(legacy)) assert.deepEqual(saved.body[key], value);
  await request(app).get(`/api/v1/books/${book.id}`).set(auth(other.token)).expect(404);
});

test('CSV prefixes dangerous cells while preserving quotes and ordinary Unicode', async () => {
  const user = await registerUser('csv-safe');
  for (const prefix of ['=', '+', '-', '@', '\t', '\r', '\n', '  =', '\uFEFF+', '＝', '＋', '－', '＠']) {
    const title = `${prefix}SUM(1,2)`;
    const book = await createBook(user.token, user.userId, { title, author: 'Áuthor, "normal"', genre: ['=formula'] });
    const result = await request(app).get(`/api/v1/books/${book.id}/export`).set(auth(user.token)).expect(200);
    assert.ok(result.text.includes(`"'${title}"`));
    assert.ok(result.text.includes('"Áuthor, ""normal"""'));
    assert.ok(result.text.includes("\"'=formula\""));
  }
});
