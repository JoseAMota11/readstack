import assert from 'node:assert/strict';
import test from 'node:test';
import { planSyntheticInitialization, refuseSyntheticReset, syntheticFixtures } from '../src/migrations/synthetic-fixtures';

const approved = 'I_APPROVE_SYNTHETIC_PLANNING';

test('planning requires exact opt-in and a valid snapshot', () => {
  const empty = { users: [], books: [], reviews: [] };
  for (const input of [undefined, '', 'yes', 'I_APPROVE_SYNTHETIC_PLANNING ']) {
    assert.throws(() => planSyntheticInitialization(input, empty));
  }
  assert.throws(() => planSyntheticInitialization(approved, null as never));
  assert.throws(() => planSyntheticInitialization(approved, { users: [], books: [], reviews: null } as never));
});

test('empty and exact fixture snapshots produce deterministic, nonduplicating plans', () => {
  let state = { users: [], books: [], reviews: [] } as ReturnType<typeof syntheticFixtures>;
  assert.equal(planSyntheticInitialization(approved, state), 'insert');
  state = syntheticFixtures(); // Simulate applying the planned insertion in memory only.
  assert.equal(planSyntheticInitialization(approved, state), 'unchanged');
  assert.equal(planSyntheticInitialization(approved, state), 'unchanged');
  assert.deepEqual(state, syntheticFixtures());
  state.books[0].title = 'changed';
  assert.throws(() => planSyntheticInitialization(approved, state), /rejected/);
  const partial = syntheticFixtures();
  partial.reviews.pop();
  assert.throws(() => planSyntheticInitialization(approved, partial), /rejected/);
});

test('fixtures have unique identifiers, ownership relationships, reviews and favorites', () => {
  const { users, books, reviews } = syntheticFixtures();
  assert.deepEqual([users.length, books.length, reviews.length, books.filter((book) => book.is_favorite).length], [2, 3, 2, 2]);
  for (const rows of [users, books, reviews]) assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  assert.equal(new Set(users.map((user) => user.email)).size, users.length);
  for (const book of books) assert.ok(users.some((user) => user.id === book.user_id));
  for (const review of reviews) assert.ok(books.some((book) => book.id === review.book_id && book.user_id === review.user_id));
  assert.ok(users.every((user) => books.some((book) => book.user_id === user.id) && reviews.some((review) => review.user_id === user.id)));
});

test('reset always refuses, irrespective of any purported target or authorization', () => {
  assert.throws(() => refuseSyntheticReset(), /not implemented/);
});
