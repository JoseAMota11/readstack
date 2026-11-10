import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, db } from './helpers/test-app';
import { auth, createBook, createReview, insertReviewDirectly, registerUser } from './helpers/fixtures';

test('filters and paginates books and totals within the authenticated user', async () => {
  const alice = await registerUser('filter-a');
  const bob = await registerUser('filter-b');
  const first = await createBook(alice.token, alice.userId, {
    title: 'Shared Harbor One', author: 'Shared Writer', year: 2020, genre: ['Shared Genre'],
  });
  const second = await createBook(alice.token, alice.userId, {
    title: 'Shared Harbor Two', author: 'Other Writer', year: 2020, genre: ['Shared Genre'],
  });
  const other = await createBook(alice.token, alice.userId, {
    title: 'Different Mountain', author: 'Shared Writer', year: 1999, genre: ['Other Genre'],
  });
  const foreign = await createBook(bob.token, bob.userId, {
    title: 'Shared Harbor Foreign', author: 'Shared Writer', year: 2020, genre: ['Shared Genre'],
  });

  // Set distinct timestamps only on synthetic fixtures in the isolated test database.
  const setCreatedAt = db.prepare('UPDATE Books SET createdAt = ? WHERE id = ? AND userId = ?');
  assert.equal(setCreatedAt.run('2020-01-01 00:00:01', first.id, alice.userId).changes, 1);
  assert.equal(setCreatedAt.run('2020-01-01 00:00:02', second.id, alice.userId).changes, 1);

  const ids = (books: Array<{ id: string }>) => books.map((book) => book.id).sort();
  const expected = [first.id, second.id].sort();
  const filters = [
    { query: { title: 'Shared Harbor' }, expected },
    { query: { author: 'Shared Writer' }, expected: [first.id, other.id].sort() },
    { query: { year: '2020' }, expected },
    { query: { genre: 'Shared Genre' }, expected },
    { query: { title: 'Harbor', author: 'Shared Writer', year: '2020', genre: 'Shared Genre' }, expected: [first.id] },
  ];

  for (const filter of filters) {
    const result = await request(app).get('/api/v1/books').set(auth(alice.token))
      .query(filter.query).expect(200);
    assert.deepEqual(ids(result.body.books), filter.expected, 'filtered results must match all filters and exclude foreign books');
    assert.equal(result.body.pagination.total, filter.expected.length, 'filtered totals must exclude foreign books');
  }

  const page1 = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Shared Harbor', current: 1, size: 1 }).expect(200);
  const page2 = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Shared Harbor', current: 2, size: 1 }).expect(200);
  for (const [index, page] of [page1, page2].entries()) {
    assert.deepEqual(page.body.pagination, { total: 2, current: index + 1, totalPages: 2, size: 1 });
    assert.equal(page.body.books.length, 1);
  }
  assert.deepEqual(ids([...page1.body.books, ...page2.body.books]), expected);
  const beyond = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Shared Harbor', current: 3, size: 1 }).expect(200);
  assert.deepEqual(beyond.body.books, []);
  assert.equal(beyond.body.pagination.total, 2);
  const empty = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Never matching title' }).expect(200);
  assert.deepEqual(empty.body.books, []);
  assert.equal(empty.body.pagination.total, 0);
  const bobList = await request(app).get('/api/v1/books').set(auth(bob.token))
    .query({ title: 'Shared Harbor' }).expect(200);
  assert.deepEqual(ids(bobList.body.books), [foreign.id]);
  assert.equal(bobList.body.pagination.total, 1);
  const allAlice = await request(app).get('/api/v1/books').set(auth(alice.token)).expect(200);
  assert.deepEqual(ids(allAlice.body.books), [first.id, second.id, other.id].sort());
  assert.equal(allAlice.body.pagination.total, 3);
});

test('book reads aggregate only matching owner reviews without changing manual ratings or pagination', async () => {
  const alice = await registerUser('aggregate-a');
  const bob = await registerUser('aggregate-b');
  const empty = await createBook(alice.token, alice.userId, { title: 'Aggregate Empty', rating: 2 });
  const rated = await createBook(alice.token, alice.userId, { title: 'Aggregate Rated', rating: 4 });
  const foreign = await createBook(bob.token, bob.userId, { title: 'Aggregate Rated', rating: 1 });

  const timestamp = db.prepare('UPDATE Books SET createdAt = ? WHERE id = ?');
  timestamp.run('2020-01-01 00:00:01', empty.id);
  timestamp.run('2020-01-01 00:00:02', rated.id);
  const detail = async (token: string, id: string) =>
    (await request(app).get(`/api/v1/books/${id}`).set(auth(token)).expect(200)).body;
  const check = (book: any, average: number | null, count: number, manual: number) => {
    assert.equal(book.reviewAverageRating, average);
    assert.equal(book.reviewRatingCount, count);
    assert.equal(book.rating, manual);
  };

  check(await detail(alice.token, empty.id), null, 0, 2);
  check(await detail(alice.token, rated.id), null, 0, 4);
  assert.equal((await createReview(alice.token, alice.userId, rated.id, { rating: 5 })).status, 201);
  check(await detail(alice.token, rated.id), 5, 1, 4);
  assert.equal((await createReview(alice.token, alice.userId, rated.id, { rating: 0 })).status, 201);
  assert.equal((await createReview(alice.token, alice.userId, rated.id, { rating: 2 })).status, 201);
  assert.equal((await createReview(bob.token, bob.userId, foreign.id, { rating: 1 })).status, 201);
  insertReviewDirectly({ bookId: rated.id, userId: bob.userId, rating: 5 });
  insertReviewDirectly({ bookId: foreign.id, userId: alice.userId, rating: 5 });
  insertReviewDirectly({ bookId: empty.id, userId: bob.userId, rating: 5 });

  check(await detail(alice.token, rated.id), 7 / 3, 3, 4);
  check(await detail(alice.token, empty.id), null, 0, 2);
  check(await detail(bob.token, foreign.id), 1, 1, 1);
  const foreignDetail = await request(app).get(`/api/v1/books/${foreign.id}`).set(auth(alice.token)).expect(404);
  const missingDetail = await request(app).get('/api/v1/books/00000000-0000-4000-8000-000000000001').set(auth(alice.token)).expect(404);
  assert.deepEqual(foreignDetail.body, missingDetail.body);

  const page1 = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Aggregate', current: 1, size: 1 }).expect(200);
  const page2 = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Aggregate', current: 2, size: 1 }).expect(200);
  assert.deepEqual(page1.body.pagination, { total: 2, current: 1, totalPages: 2, size: 1 });
  assert.deepEqual(page2.body.pagination, { total: 2, current: 2, totalPages: 2, size: 1 });
  assert.equal(page1.body.books[0].id, rated.id);
  assert.equal(page2.body.books[0].id, empty.id);
  check(page1.body.books[0], 7 / 3, 3, 4);
  check(page2.body.books[0], null, 0, 2);
  const bobList = await request(app).get('/api/v1/books').set(auth(bob.token)).expect(200);
  assert.equal(bobList.body.books.length, 1);
  check(bobList.body.books[0], 1, 1, 1);

  db.prepare('UPDATE Reviews SET rating = 1 WHERE bookId = ? AND userId = ?').run(rated.id, alice.userId);
  check(await detail(alice.token, rated.id), 1, 3, 4);
  const updatedList = await request(app).get('/api/v1/books').set(auth(alice.token))
    .query({ title: 'Aggregate Rated' }).expect(200);
  check(updatedList.body.books[0], 1, 3, 4);
  assert.deepEqual(db.prepare('SELECT rating FROM Books WHERE id = ?').get(rated.id), { rating: 4 });
});
