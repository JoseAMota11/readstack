import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresBookRepository } from '../src/database/postgres-book';
import { Book, BooksFilters } from '../src/types/book.type';

const owner = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const id = '00000000-0000-4000-8000-000000000003';
const book: Book = { id, title: 'Synthetic', author: 'Author', year: 2020, genre: ['A', '😀'], isFavorite: false, userId: owner, createdAt: '', updatedAt: '' };
const row = { ...book, coverImage: null, rating: null, createdAt: '2020-01-01 12:30:00', updatedAt: '2020-01-01 12:30:00', reviewAverageRating: 2.5, reviewRatingCount: '2', description: 'not exposed', reading_status: 'pending' };

test('listing scopes, parameterizes filters, ordering and pagination, and maps counts and nulls', async () => {
  let calls = 0;
  const repo = new PostgresBookRepository({ async query(sql, values) {
    calls++;
    assert.match(sql, /b\.user_id = \$1/);
    assert.match(sql, /translate\(b\.title/);
    assert.match(sql, /translate\(b\.author/);
    assert.match(sql, /b\.year::text/);
    assert.match(sql, /jsonb_array_elements\(b\.genre\)/);
    assert.match(sql, /ESCAPE ''/);
    assert.deepEqual(values.slice(0, 5), [owner, '%a%_%', '%author%', '%20%', '%"x%"%']);
    assert.doesNotMatch(sql, /a%_/);
    if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: '3' }], rowCount: 1 };
    assert.match(sql, /ORDER BY b\.created_at DESC, b\.id DESC/);
    assert.match(sql, /r\.book_id = b\.id AND r\.user_id = b\.user_id/);
    assert.match(sql, /AT TIME ZONE 'UTC'/);
    assert.deepEqual(values.slice(-2), [2, 2]);
    return { rows: [row], rowCount: 1 };
  } });
  const filters = { title: 'a%_', author: 'author', year: 20, genre: 'x%' as unknown as string[], current: 2, size: 2 };
  const result = await repo.findAll(owner, filters);
  assert.equal(calls, 2);
  assert.deepEqual(result, { books: [{ id, title: 'Synthetic', author: 'Author', year: 2020, genre: ['A', '😀'], coverImage: null, rating: null, isFavorite: false, userId: owner, createdAt: '2020-01-01 12:30:00', updatedAt: '2020-01-01 12:30:00', reviewAverageRating: 2.5, reviewRatingCount: 2 }], total: 3, current: 2, totalPages: 2, size: 2 });
});

test('detail and mutations constrain both id and acting owner', async () => {
  const repo = new PostgresBookRepository({ async query(sql, values) {
    if (sql.includes('SELECT b.id')) {
      assert.match(sql, /WHERE b\.id = \$1 AND b\.user_id = \$2/);
      return { rows: values[0] === id && values[1] === owner ? [{ ...row, reviewAverageRating: null, reviewRatingCount: '0' }] : [], rowCount: 1 };
    }
    if (sql.includes('UPDATE')) {
      assert.match(sql, /WHERE user_id = \$4 AND id = \$5/);
      assert.deepEqual(values.slice(0, 3), ['Changed', '["A","😀"]', true]);
      return { rows: [], rowCount: values[3] === owner && values[4] === id ? 1 : 0 };
    }
    assert.match(sql, /WHERE id = \$1 AND user_id = \$2/);
    return { rows: [], rowCount: values[0] === id && values[1] === owner ? 1 : 0 };
  } });
  assert.equal((await repo.findOneById(id, owner))?.reviewAverageRating, null);
  assert.equal(await repo.findOneById(id, foreign), undefined);
  const update = { title: 'Changed', genre: ['A', '😀'], isFavorite: true, userId: owner };
  assert.deepEqual(await repo.update(id, update), { changes: true });
  assert.deepEqual(await repo.update(id, { ...update, userId: foreign }), { changes: false });
  assert.deepEqual(await repo.delete(id, owner), { changes: true });
  assert.deepEqual(await repo.delete(id, foreign), { changes: false });
});

test('creation uses generated UUID, JSONB and atomic user lookup, with nulls and false preserved', async () => {
  const repo = new PostgresBookRepository({ async query(sql, values) {
    assert.match(sql, /FROM public\.users u WHERE u\.id = \$9/);
    assert.match(sql, /\$5::jsonb/);
    assert.match(values[0] as string, /^[0-9a-f-]{36}$/);
    assert.deepEqual(values.slice(1), ['Synthetic', 'Author', 2020, '["A","😀"]', null, null, false, owner]);
    return { rows: [], rowCount: 1 };
  } });
  assert.deepEqual(await repo.create(book), { changes: true });
});

test('invalid identifiers and missing users fail safely without issuing invalid UUID SQL', async () => {
  const repo = new PostgresBookRepository({ async query() { throw new Error('unexpected'); } });
  assert.equal(await repo.findOneById('bad', owner), undefined);
  assert.deepEqual(await repo.update('bad', { userId: owner, title: 'x' }), { changes: false });
  assert.deepEqual(await repo.delete(id, 'bad'), { changes: false });
  await assert.rejects(repo.create({ ...book, userId: 'bad' }), { message: 'El usuario no existe.' });
  await assert.rejects(repo.update(id, { userId: owner }), { message: 'No se proporcionaron campos para actualizar.' });
  const missing = new PostgresBookRepository({ async query() { return { rows: [], rowCount: 0 }; } });
  await assert.rejects(missing.create(book), { message: 'El usuario no existe.' });
});

test('query errors are sanitized; filter NUL and backslash retain SQLite pattern semantics', async () => {
  const repo = new PostgresBookRepository({ async query(sql, values) {
    assert.match(sql, /ESCAPE ''/);
    assert.equal(values[1], '%a\\b');
    throw new Error('private connection and SQL');
  } });
  await assert.rejects(repo.findAll(owner, { title: 'a\\b\u0000tail', current: 1, size: 10 } as BooksFilters), { message: 'Book data access failed' });
  const fail = new PostgresBookRepository({ async query() { throw new Error('private driver'); } });
  await assert.rejects(fail.findOneById(id, owner), { message: 'Book data access failed' });
  await assert.rejects(fail.create(book), { message: 'No se pudo crear el libro. Inténtalo de nuevo más tarde.' });
  await assert.rejects(fail.update(id, { title: 'x', userId: owner }), { message: 'No se pudo actualizar el libro. Inténtalo de nuevo más tarde.' });
  await assert.rejects(fail.delete(id, owner), { message: 'Book data access failed' });
});
