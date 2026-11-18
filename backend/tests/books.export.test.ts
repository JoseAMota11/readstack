import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from './helpers/test-app';
import { auth, createBook, createReview, registerUser } from './helpers/fixtures';

function parseRecord(record: string): string[] {
  const field = /("(?:[^"]|"")*"|[^,\r\n]*)(,|$)/gy;
  const values: string[] = [];
  let position = 0;
  while (true) {
    field.lastIndex = position;
    const match = field.exec(record);
    assert.ok(match, `Invalid CSV record at position ${position}`);
    const value = match[1];
    values.push(value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"') : value);
    position = field.lastIndex;
    if (match[2] === '') break;
  }
  assert.equal(position, record.length);
  return values;
}

test('exports only the owner book as escaped CSV and denies foreign export', async () => {
  const alice = await registerUser('csv-a');
  const bob = await registerUser('csv-b');
  const title = 'Private, "quoted" title';
  const book = await createBook(alice.token, alice.userId, {
    title, author: 'Synthetic, Author', genre: ['Fiction', 'Mystery'], isFavorite: true, rating: 3,
  });
  assert.equal((await createReview(alice.token, alice.userId, book.id, { rating: 5 })).status, 201);

  const exported = await request(app).get(`/api/v1/books/${book.id}/export`)
    .set(auth(alice.token)).expect(200);
  assert.match(exported.headers['content-type'], /^text\/csv/);
  assert.equal(exported.headers['content-disposition'], `attachment; filename="book_${book.id}.csv"`);
  assert.match(exported.text, /^"id","title","author","year","genre","coverImage","rating","isFavorite","userId","createdAt","updatedAt"/);
  assert.ok(exported.text.includes('"Private, ""quoted"" title"'));
  assert.ok(exported.text.includes('"Synthetic, Author"'));
  assert.ok(exported.text.includes('"Fiction, Mystery"'));
  assert.ok(exported.text.includes('"Sí"'));
  assert.match(exported.text, /,3,"Sí",/);
  assert.doesNotMatch(exported.text, /reviewAverageRating|reviewRatingCount/);
  assert.ok(exported.text.includes(alice.userId));

  const denied = await request(app).get(`/api/v1/books/${book.id}/export`)
    .set(auth(bob.token)).expect(404);
  assert.doesNotMatch(denied.headers['content-type'], /text\/csv/);
  assert.ok(!denied.text.includes(title));
  assert.ok(!denied.text.includes(alice.userId));
});

test('exports one quoted Unicode record with cell-level formula protection', async () => {
  const user = await registerUser('csv-unicode');
  const author = '＝SUM(1,2)';
  for (const [genre, expectedGenre] of [
    [['=first', 'Ficción, "二"\n📚'], '\'=first, Ficción, "二"\n📚'],
    [['Ficción', '=second', '+二'], 'Ficción, =second, +二'],
  ] as Array<[string[], string]>) {
    const title = `Café 📚, "読書"\nsecond line ${genre[0]}`;
    const book = await createBook(user.token, user.userId, { title, author, genre });
    const result = await request(app).get(`/api/v1/books/${book.id}/export`).set(auth(user.token)).expect(200);
    const newline = result.text.indexOf('\n');
    assert.ok(newline > 0);
    const header = parseRecord(result.text.slice(0, newline));
    const row = parseRecord(result.text.slice(newline + 1));
    assert.deepEqual(header, ['id', 'title', 'author', 'year', 'genre', 'coverImage', 'rating', 'isFavorite', 'userId', 'createdAt', 'updatedAt']);
    assert.equal(row.length, header.length);
    assert.equal(row[0], book.id);
    assert.equal(row[1], title);
    assert.equal(row[2], `'${author}`);
    assert.equal(row[4], expectedGenre);
    assert.equal(row[8], user.userId);
  }
});
