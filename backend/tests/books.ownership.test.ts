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

test('uses the token identity when creating a book with a foreign userId', async () => {
  const alice = await registerUser('book-spoof-a');
  const bob = await registerUser('book-spoof-b');
  const book = await createBook(alice.token, bob.userId, { title: 'Spoofed owner book' });

  const owned = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(owned.body.userId, alice.userId);
  await request(app).get(`/api/v1/books/${book.id}`).set(auth(bob.token)).expect(404);
  const bobList = await request(app).get('/api/v1/books').set(auth(bob.token)).expect(200);
  assert.equal(bobList.body.pagination.total, 0);
});

test('rejects PATCH bodies without mutable fields independently of ownership', async () => {
  const alice = await registerUser('empty-patch-a');
  const bob = await registerUser('empty-patch-b');
  const book = await createBook(alice.token, alice.userId, { title: 'Unchanged' });
  const missingId = '00000000-0000-4000-8000-000000000002';
  const bodies = [{}, { userId: alice.userId }, { unknown: 'ignored' }];
  let expected: unknown;
  for (const id of [book.id, missingId]) {
    for (const token of [alice.token, bob.token]) {
      for (const body of bodies) {
        const result = await request(app).patch(`/api/v1/books/${id}`).set(auth(token)).send(body).expect(400);
        expected ??= result.body;
        assert.equal(result.body.message, 'No se proporcionaron campos para actualizar.');
        assert.deepEqual(result.body, expected);
      }
    }
  }
  await request(app).patch(`/api/v1/books/${book.id}`).send({}).expect(401);
  const unchanged = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(unchanged.body.title, 'Unchanged');
});

test('PATCH preserves falsy values and ignores spoofed ownership', async () => {
  const alice = await registerUser('patch-spoof-a');
  const bob = await registerUser('patch-spoof-b');
  const book = await createBook(alice.token, alice.userId, { title: 'Original', isFavorite: true, rating: 3 });

  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(bob.token))
    .send({ title: 'Hijacked', userId: alice.userId }).expect(400);
  const unchanged = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(unchanged.body.title, 'Original');
  assert.equal(unchanged.body.userId, alice.userId);

  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(alice.token))
    .send({ title: 'Updated', rating: 0, isFavorite: false, userId: bob.userId, unknown: 'ignored' }).expect(200);
  const updated = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(updated.body.title, 'Updated');
  assert.equal(updated.body.rating, 0);
  assert.equal(updated.body.isFavorite, false);
  assert.equal(updated.body.userId, alice.userId);
  await request(app).get(`/api/v1/books/${book.id}`).set(auth(bob.token)).expect(404);
});

test('persists favorite toggles and denies another user changing them', async () => {
  const alice = await registerUser('favorite-a');
  const bob = await registerUser('favorite-b');
  const book = await createBook(alice.token, alice.userId, { isFavorite: true });
  const bobBook = await createBook(bob.token, bob.userId, { isFavorite: true });

  const created = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(created.body.isFavorite, true);
  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(bob.token))
    .send({ isFavorite: false }).expect(400);
  const unchanged = await request(app).get(`/api/v1/books/${book.id}`).set(auth(alice.token)).expect(200);
  assert.equal(unchanged.body.isFavorite, true);

  await request(app).patch(`/api/v1/books/${book.id}`).set(auth(alice.token))
    .send({ isFavorite: false }).expect(200);
  const listed = await request(app).get('/api/v1/books').set(auth(alice.token)).expect(200);
  assert.equal(listed.body.books.find((item: { id: string }) => item.id === book.id).isFavorite, false);
  const stillBob = await request(app).get(`/api/v1/books/${bobBook.id}`).set(auth(bob.token)).expect(200);
  assert.equal(stillBob.body.isFavorite, true);
});
