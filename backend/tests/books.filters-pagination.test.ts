import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, db } from './helpers/test-app';
import { auth, createBook, registerUser } from './helpers/fixtures';

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
