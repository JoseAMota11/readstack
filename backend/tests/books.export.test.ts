import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import { auth, createBook, registerUser } from './helpers/fixtures';

test('exports only the owner book as escaped CSV and denies foreign export', async () => {
  const alice = await registerUser('csv-a');
  const bob = await registerUser('csv-b');
  const title = 'Private, "quoted" title';
  const book = await createBook(alice.token, alice.userId, {
    title, author: 'Synthetic, Author', genre: ['Fiction', 'Mystery'], isFavorite: true,
  });

  const exported = await request(app).get(`/api/v1/books/${book.id}/export`)
    .set(auth(alice.token)).expect(200);
  assert.match(exported.headers['content-type'], /^text\/csv/);
  assert.equal(exported.headers['content-disposition'], `attachment; filename="book_${book.id}.csv"`);
  assert.match(exported.text, /^"id","title","author","year","genre","coverImage","rating","isFavorite","userId","createdAt","updatedAt"/);
  assert.ok(exported.text.includes('"Private, ""quoted"" title"'));
  assert.ok(exported.text.includes('"Synthetic, Author"'));
  assert.ok(exported.text.includes('"Fiction, Mystery"'));
  assert.ok(exported.text.includes('"Sí"'));
  assert.ok(exported.text.includes(alice.userId));

  const denied = await request(app).get(`/api/v1/books/${book.id}/export`)
    .set(auth(bob.token)).expect(404);
  assert.doesNotMatch(denied.headers['content-type'], /text\/csv/);
  assert.ok(!denied.text.includes(title));
  assert.ok(!denied.text.includes(alice.userId));
});
