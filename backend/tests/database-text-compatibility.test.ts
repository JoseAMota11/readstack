import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bookSchema } from '../src/utils/book.schema';
import { reviewSchema } from '../src/utils/review.schema';
import { bookSchemaPartial } from '../src/utils/book.schema';
import request from 'supertest';
import { app } from './helpers/test-app';
import { auth, createBook, createReview, listReviews, registerUser } from './helpers/fixtures';

test('validation rejects NUL but does not broaden rejection to other characters', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const text = 'synthetic\u0000text';
  const valid = { title: 'Title', author: 'Author', year: 2020, genre: ['Genre'], isFavorite: false, userId: id };
  for (const field of ['title', 'author', 'genre'] as const) {
    const input = { ...valid, [field]: field === 'genre' ? ['ok', text] : text };
    assert.equal(bookSchema.safeParse(input).success, false);
    assert.equal(bookSchemaPartial.safeParse(input).success, false);
  }
  assert.equal(reviewSchema.safeParse({ bookId: id, userId: id, rating: 3, comment: text }).success, false);
  const other = 'é\u0001\ud800';
  assert.equal(bookSchema.safeParse({ ...valid, title: other, author: other, genre: ['é\u0001😀'] }).success, true);
  assert.equal(reviewSchema.safeParse({ bookId: id, userId: id, rating: 3, comment: other }).success, true);

  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE fixture (title TEXT, author TEXT, genre TEXT, comment TEXT)');
    db.prepare('INSERT INTO fixture VALUES (?, ?, ?, ?)').run(text, text, JSON.stringify([text, other]), text);
    const row = db.prepare('SELECT title, author, genre, comment FROM fixture').get() as {
      title: string; author: string; genre: string; comment: string;
    };
    assert.deepEqual({ ...row, genre: JSON.parse(row.genre) }, {
      title: text, author: text, genre: [text, other], comment: text,
    });
  } finally {
    db.close();
  }
});

test('genre rejects only unpaired surrogates and NUL on both create and update', async () => {
  const user = await registerUser('unicode');
  const book = await createBook(user.token, user.userId);
  const base = { title: 'Synthetic', author: 'Author', year: 2020, genre: ['ok'], isFavorite: false, userId: user.userId };
  for (const value of ['\ud800', '\udfff', 'a\ud800b', '\udc00\ud800', '\u0000']) {
    for (const req of [
      () => request(app).post('/api/v1/books').set(auth(user.token)).send({ ...base, genre: ['ok', value] }),
      () => request(app).patch(`/api/v1/books/${book.id}`).set(auth(user.token)).send({ genre: ['ok', value] }),
    ]) {
      const response = await req().expect(400);
      assert.equal(response.body.message, 'Error en la validación de los datos.');
      assert.ok(response.body.errors.some((error: { path: unknown[] }) => error.path[0] === 'genre' && error.path[1] === 1));
    }
  }
  const genre = ['😀', '𐀀', 'é\u0001\n', '\ufffd'];
  await request(app).post('/api/v1/books').set(auth(user.token)).send({ ...base, genre }).expect(201);
  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(user.token)).send({ genre }).expect(200);
  const stored = await request(app).get(`/api/v1/books/${book.id}`).set(auth(user.token)).expect(200);
  assert.deepEqual(stored.body.genre, genre);
});

test('book and review create and update reject NUL with existing validation responses', async () => {
  const user = await registerUser('nul-check');
  const book = await createBook(user.token, user.userId);
  const base = { title: 'Title', author: 'Author', year: 2020, genre: ['Genre'], isFavorite: false, userId: user.userId };
  for (const field of ['title', 'author', 'genre'] as const) {
    const invalid = field === 'genre' ? ['valid', 'bad\u0000value'] : 'bad\u0000value';
    for (const operation of [
      () => request(app).post('/api/v1/books').set(auth(user.token)).send({ ...base, [field]: invalid }),
      () => request(app).patch(`/api/v1/books/${book.id}`).set(auth(user.token)).send({ [field]: invalid }),
    ]) {
      const response = await operation().expect(400);
      assert.equal(response.body.message, 'Error en la validación de los datos.');
      assert.ok(response.body.errors.some((error: { path: unknown[] }) => error.path[0] === field));
    }
  }
  assert.equal((await createReview(user.token, user.userId, book.id)).status, 201);
  const [review] = await listReviews(user.token, book.id);
  const payload = { bookId: book.id, userId: user.userId, rating: 3, comment: 'bad\u0000value' };
  for (const operation of [
    () => request(app).post('/api/v1/reviews').set(auth(user.token)).send(payload),
    () => request(app).put(`/api/v1/reviews/${review.id}`).set(auth(user.token)).send(payload),
  ]) {
    const response = await operation().expect(400);
    assert.equal(response.body.message, 'Error en la validación de los datos.');
    assert.ok(response.body.errors.some((error: { path: unknown[] }) => error.path[0] === 'comment'));
  }
  assert.equal((await listReviews(user.token, book.id))[0].comment, review.comment);
});
