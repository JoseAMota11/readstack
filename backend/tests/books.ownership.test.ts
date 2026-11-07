import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import { auth, createBook, registerUser } from './helpers/fixtures';

test('lists only the authenticated user books', async () => {
  const alice = await registerUser('alice-list');
  const bob = await registerUser('bob-list');

  await createBook(alice.token, alice.userId);

  const aliceBooks = await request(app)
    .get('/api/v1/books')
    .set(auth(alice.token))
    .expect(200);

  assert.equal(aliceBooks.body.books.length, 1);
  assert.equal(aliceBooks.body.pagination.total, 1);

  const bobBooks = await request(app)
    .get('/api/v1/books')
    .set(auth(bob.token))
    .expect(200);

  assert.equal(bobBooks.body.books.length, 0);
  assert.equal(bobBooks.body.pagination.total, 0);
});

test("denies reading, updating, deleting, and exporting another user's book", async () => {
  const alice = await registerUser('alice-own');
  const bob = await registerUser('bob-other');
  const book = await createBook(alice.token, alice.userId, {
    title: 'Owned by Alice',
  });

  await request(app)
    .get(`/api/v1/books/${book.id}`)
    .set(auth(bob.token))
    .expect(404);

  const update = await request(app)
    .patch(`/api/v1/books/${book.id}`)
    .set(auth(bob.token))
    .send({ title: 'Hijacked by Bob' });

  assert.equal(update.status, 400);

  const deletion = await request(app)
    .delete(`/api/v1/books/${book.id}`)
    .set(auth(bob.token));

  assert.equal(deletion.status, 400);

  await request(app)
    .get(`/api/v1/books/${book.id}/export`)
    .set(auth(bob.token))
    .expect(404);

  const stillOwned = await request(app)
    .get(`/api/v1/books/${book.id}`)
    .set(auth(alice.token))
    .expect(200);

  assert.equal(stillOwned.body.title, 'Owned by Alice');
});

test('allows the owner to read, update, export, and delete a book', async () => {
  const alice = await registerUser('alice-crud');
  const book = await createBook(alice.token, alice.userId);

  const update = await request(app)
    .patch(`/api/v1/books/${book.id}`)
    .set(auth(alice.token))
    .send({ title: 'Updated synthetic title', isFavorite: true })
    .expect(200);

  assert.equal(update.status, 200);

  const updated = await request(app)
    .get(`/api/v1/books/${book.id}`)
    .set(auth(alice.token))
    .expect(200);

  assert.equal(updated.body.title, 'Updated synthetic title');
  assert.equal(updated.body.isFavorite, true);

  const exported = await request(app)
    .get(`/api/v1/books/${book.id}/export`)
    .set(auth(alice.token))
    .expect(200);

  assert.match(exported.headers['content-type'], /text\/csv/);
  assert.match(exported.text, /Updated synthetic title/);

  await request(app)
    .delete(`/api/v1/books/${book.id}`)
    .set(auth(alice.token))
    .expect(200);

  await request(app)
    .get(`/api/v1/books/${book.id}`)
    .set(auth(alice.token))
    .expect(404);
});
