import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../helpers/test-app';
import {
  auth,
  createBook,
  createReview,
  insertReviewDirectly,
  listReviews,
  registerUser,
} from '../helpers/fixtures';

// SEC-04 probes. These encode the required behavior and are expected to fail
// until SEC-04 enforces review and book ownership. Run with:
//   npm run test:security
function assertDenied(status: number, context: string) {
  assert.ok(
    status === 403 || status === 404,
    `${context}: expected 403 or 404, received ${status}`
  );
}

test('P1: cross-user review listing must be denied', async () => {
  const alice = await registerUser('p1-alice');
  const bob = await registerUser('p1-bob');
  const book = await createBook(alice.token, alice.userId);

  await createReview(alice.token, alice.userId, book.id, {
    comment: 'Private review owned by Alice',
  }).then((response) => assert.equal(response.status, 201));

  const response = await request(app)
    .get(`/api/v1/reviews/${book.id}`)
    .set(auth(bob.token));

  assertDenied(response.status, 'cross-user review listing');
});

test('P2: cross-user review creation must be denied', async () => {
  const alice = await registerUser('p2-alice');
  const bob = await registerUser('p2-bob');
  const book = await createBook(alice.token, alice.userId);

  const response = await createReview(bob.token, bob.userId, book.id, {
    comment: 'Review written on a foreign book',
  });

  assertDenied(response.status, 'cross-user review creation');
});

test('P3: updating a review attached to a foreign book must be denied', async () => {
  const alice = await registerUser('p3-alice');
  const bob = await registerUser('p3-bob');
  const book = await createBook(alice.token, alice.userId);

  // Reproduce the inconsistent state the current API can create (P2): a review
  // whose userId matches the caller but whose book belongs to another user.
  const seededComment = 'Seeded inconsistent ownership review';
  const reviewId = insertReviewDirectly({
    bookId: book.id,
    userId: bob.userId,
    rating: 3,
    comment: seededComment,
  });

  const response = await request(app)
    .put(`/api/v1/reviews/${reviewId}`)
    .set(auth(bob.token))
    .send({
      bookId: book.id,
      userId: bob.userId,
      rating: 1,
      comment: 'Mutated through a foreign book',
    });

  assertDenied(response.status, 'foreign-book review update');

  const reviews = await listReviews(alice.token, book.id);
  const seeded = reviews.find((review) => review.id === reviewId);

  assert.ok(seeded, 'seeded review should still exist');
  assert.equal(seeded.comment, seededComment);
});
