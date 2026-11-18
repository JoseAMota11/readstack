import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import { auth, PASSWORD, registerUser } from './helpers/fixtures';
import { UserModel } from '../src/models/user.model';
import { BookModel } from '../src/models/book.model';
import { ReviewModel } from '../src/models/review.model';

const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const sensitive = 'synthetic SQL SELECT private; credential and stack marker';

test('async model rejections complete every route without exposing details', async (t) => {
  const user = await registerUser('async');
  const review = { bookId: id, userId: otherId, rating: 3, comment: 'synthetic' };
  const book = { title: 'Synthetic', author: 'Author', year: 2020, genre: ['Test'], isFavorite: false, userId: otherId };
  const cases = [
    { model: UserModel, method: 'create', request: () => request(app).post('/api/v1/register').send({ username: 'async-fail', email: 'async-fail@example.test', password: PASSWORD }) },
    { model: UserModel, method: 'find', request: () => request(app).post('/api/v1/login').send({ email: 'async-fail@example.test', password: PASSWORD }) },
    { model: BookModel, method: 'findAll', request: () => request(app).get('/api/v1/books').set(auth(user.token)) },
    { model: BookModel, method: 'findOneById', request: () => request(app).get(`/api/v1/books/${id}`).set(auth(user.token)) },
    { model: BookModel, method: 'findOneById', request: () => request(app).get(`/api/v1/books/${id}/export`).set(auth(user.token)) },
    { model: BookModel, method: 'create', request: () => request(app).post('/api/v1/books').set(auth(user.token)).send(book) },
    { model: BookModel, method: 'update', request: () => request(app).patch(`/api/v1/books/${id}`).set(auth(user.token)).send({ title: 'Changed' }) },
    { model: BookModel, method: 'delete', request: () => request(app).delete(`/api/v1/books/${id}`).set(auth(user.token)) },
    { model: ReviewModel, method: 'findAll', request: () => request(app).get(`/api/v1/reviews/${id}`).set(auth(user.token)) },
    { model: ReviewModel, method: 'create', request: () => request(app).post('/api/v1/reviews').set(auth(user.token)).send(review) },
    { model: ReviewModel, method: 'update', request: () => request(app).put(`/api/v1/reviews/${id}`).set(auth(user.token)).send(review) },
    { model: ReviewModel, method: 'delete', request: () => request(app).delete(`/api/v1/reviews/${id}`).set(auth(user.token)) },
  ];

  for (const item of cases) {
    const mock = t.mock.method(item.model as any, item.method, async () => {
      await Promise.resolve();
      throw new Error(sensitive);
    });
    const response = await item.request().timeout({ deadline: 2000 }).expect(500);
    assert.equal(mock.mock.callCount(), 1, item.method);
    assert.doesNotMatch(JSON.stringify(response.body), /synthetic SQL|credential|stack marker/);
    mock.mock.restore();
  }
});

test('authentication runs before async data access and token identity overrides body owner', async (t) => {
  const user = await registerUser('async-owner');
  const mock = t.mock.method(ReviewModel, 'create', async (review) => {
    await Promise.resolve();
    assert.equal(review.userId, user.userId);
    return { changes: false };
  });
  const body = { bookId: id, userId: otherId, rating: 3, comment: 'synthetic' };
  await request(app).post('/api/v1/reviews').send(body).expect(401);
  assert.equal(mock.mock.callCount(), 0);
  await request(app).post('/api/v1/reviews').set(auth(user.token)).send(body).expect(404);
  assert.equal(mock.mock.callCount(), 1);
});

test('non-Error rejections are sanitized and do not leave requests open', async (t) => {
  const user = await registerUser('async-reject');
  t.mock.method(BookModel, 'create', async () => Promise.reject(sensitive));
  const response = await request(app).post('/api/v1/books').set(auth(user.token))
    .send({ title: 'Synthetic', author: 'Author', year: 2020, genre: ['Test'], isFavorite: false, userId: user.userId })
    .timeout({ deadline: 2000 }).expect(500);
  assert.doesNotMatch(JSON.stringify(response.body), /synthetic SQL|credential|stack marker/);
});
