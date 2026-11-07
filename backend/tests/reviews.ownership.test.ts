import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import {
  auth,
  createBook,
  createReview,
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

  assert.equal(deletion.status, 400);

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

  assert.equal(update.status, 400);

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

  assert.equal(update.status, 400);

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
