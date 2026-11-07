import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, db } from './helpers/test-app';
import {
  auth,
  createBook,
  createReview,
  insertReviewDirectly,
  listReviews,
  registerUser,
} from './helpers/fixtures';

async function setupOwnerReview(prefix: string) {
  const alice = await registerUser(`${prefix}-alice`);
  const bob = await registerUser(`${prefix}-bob`);
  const book = await createBook(alice.token, alice.userId);
  const comment = `Owner review ${prefix}`;

  await createReview(alice.token, alice.userId, book.id, {
    rating: 4,
    comment,
  }).then((response) => assert.equal(response.status, 201));

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);

  return { alice, bob, book, review: reviews[0], comment };
}

test('the owner can create and list a review', async () => {
  const { alice, book, review, comment } = await setupOwnerReview('list');

  const reviews = await listReviews(alice.token, book.id);

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, review.id);
  assert.equal(reviews[0].comment, comment);
});

test("denies deleting another user's review", async () => {
  const { alice, bob, book, review } = await setupOwnerReview('delete');

  const deletion = await request(app)
    .delete(`/api/v1/reviews/${review.id}`)
    .set(auth(bob.token));

  assert.equal(deletion.status, 404);

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, review.id);
});

test("denies updating another user's review even with the correct bookId", async () => {
  const { alice, bob, book, review, comment } = await setupOwnerReview('update');

  const update = await request(app)
    .put(`/api/v1/reviews/${review.id}`)
    .set(auth(bob.token))
    .send({
      bookId: book.id,
      userId: bob.userId,
      rating: 1,
      comment: 'Cross-user update attempt',
    });

  assert.equal(update.status, 404);

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews[0].comment, comment);
  assert.equal(reviews[0].rating, 4);
});

test("denies updating another user's review while supplying the attacker's own bookId", async () => {
  const { alice, bob, book, review, comment } = await setupOwnerReview(
    'update-foreign-book'
  );
  const bobBook = await createBook(bob.token, bob.userId);

  const update = await request(app)
    .put(`/api/v1/reviews/${review.id}`)
    .set(auth(bob.token))
    .send({
      bookId: bobBook.id,
      userId: bob.userId,
      rating: 1,
      comment: 'bookId substitution attempt',
    });

  assert.equal(update.status, 404);

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews[0].comment, comment);
});

test('allows the owner to update their own review', async () => {
  const { alice, book, review } = await setupOwnerReview('owner-update');

  const update = await request(app)
    .put(`/api/v1/reviews/${review.id}`)
    .set(auth(alice.token))
    .send({
      bookId: book.id,
      userId: alice.userId,
      rating: 5,
      comment: 'Updated by the owner',
    });

  assert.equal(update.status, 200);

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].comment, 'Updated by the owner');
  assert.equal(reviews[0].rating, 5);
});

test('allows the owner to delete their own review', async () => {
  const { alice, book, review } = await setupOwnerReview('owner-delete');

  await request(app)
    .delete(`/api/v1/reviews/${review.id}`)
    .set(auth(alice.token))
    .expect(200);

  assert.deepEqual(await listReviews(alice.token, book.id), []);
});

test('denies deleting a review attached to a foreign book without modifying it', async () => {
  const alice = await registerUser('inconsistent-delete-a');
  const bob = await registerUser('inconsistent-delete-b');
  const book = await createBook(alice.token, alice.userId);
  const id = insertReviewDirectly({ bookId: book.id, userId: bob.userId });

  await request(app).delete(`/api/v1/reviews/${id}`).set(auth(bob.token)).expect(404);

  const row = db.prepare('SELECT bookId, userId FROM Reviews WHERE id = ?')
    .get(id);
  assert.deepEqual(row, { bookId: book.id, userId: bob.userId });
});

test('lists an owned empty book but denies foreign and nonexistent books', async () => {
  const alice = await registerUser('empty-list-a');
  const bob = await registerUser('empty-list-b');
  const book = await createBook(alice.token, alice.userId);
  const missingId = '00000000-0000-4000-8000-000000000001';

  assert.deepEqual(await listReviews(alice.token, book.id), []);
  await request(app).get(`/api/v1/reviews/${book.id}`).set(auth(bob.token)).expect(404);
  await request(app).get(`/api/v1/reviews/${missingId}`).set(auth(alice.token)).expect(404);
  await createReview(alice.token, alice.userId, missingId).then((res) =>
    assert.equal(res.status, 404)
  );
});

test('excludes reviews owned by another user from an owned book', async () => {
  const { alice, bob, book, review } = await setupOwnerReview('inconsistent-list');
  insertReviewDirectly({ bookId: book.id, userId: bob.userId });

  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].id, review.id);
});

test('uses the token identity instead of a supplied userId', async () => {
  const alice = await registerUser('spoof-a');
  const bob = await registerUser('spoof-b');
  const book = await createBook(alice.token, alice.userId);

  await createReview(bob.token, alice.userId, book.id).then((res) =>
    assert.equal(res.status, 404)
  );
  assert.deepEqual(await listReviews(alice.token, book.id), []);

  await createReview(alice.token, bob.userId, book.id).then((res) =>
    assert.equal(res.status, 201)
  );
  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);
  const row = db.prepare('SELECT userId FROM Reviews WHERE id = ?')
    .get(reviews[0].id);
  assert.deepEqual(row, { userId: alice.userId });

  await request(app)
    .put(`/api/v1/reviews/${reviews[0].id}`)
    .set(auth(bob.token))
    .send({ bookId: book.id, userId: alice.userId, rating: 1, comment: 'Spoofed' })
    .expect(404);
  assert.equal((await listReviews(alice.token, book.id))[0].comment, reviews[0].comment);
});

test('rejects substituting another owned book on an update', async () => {
  const { alice, book, review, comment } = await setupOwnerReview('own-book-substitution');
  const otherBook = await createBook(alice.token, alice.userId);

  await request(app)
    .put(`/api/v1/reviews/${review.id}`)
    .set(auth(alice.token))
    .send({ bookId: otherBook.id, userId: alice.userId, rating: 1, comment: 'Changed' })
    .expect(404);
  assert.equal((await listReviews(alice.token, book.id))[0].comment, comment);
});

test('returns the same denial for missing and foreign review mutations', async () => {
  const { alice, bob, book, review, comment } = await setupOwnerReview('missing-review');
  const missingId = '00000000-0000-4000-8000-000000000002';
  const body = { bookId: book.id, userId: bob.userId, rating: 1, comment: 'Attempted change' };

  const foreignUpdate = await request(app).put(`/api/v1/reviews/${review.id}`)
    .set(auth(bob.token)).send(body).expect(404);
  const missingUpdate = await request(app).put(`/api/v1/reviews/${missingId}`)
    .set(auth(bob.token)).send(body).expect(404);
  assert.deepEqual(foreignUpdate.body, missingUpdate.body);

  const foreignDelete = await request(app).delete(`/api/v1/reviews/${review.id}`)
    .set(auth(bob.token)).expect(404);
  const missingDelete = await request(app).delete(`/api/v1/reviews/${missingId}`)
    .set(auth(bob.token)).expect(404);
  assert.deepEqual(foreignDelete.body, missingDelete.body);
  const reviews = await listReviews(alice.token, book.id);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].comment, comment);
  assert.equal(reviews[0].rating, 4);
});
