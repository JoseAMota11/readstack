import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresReviewRepository } from '../src/database/postgres-review';
import { Review } from '../src/types/review.type';

const owner = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const book = '00000000-0000-4000-8000-000000000003';
const id = '00000000-0000-4000-8000-000000000004';
const review: Review = { id, bookId: book, userId: owner, rating: 4, comment: 'synthetic', createdAt: '' };

test('review listing scopes to owned book, maps explicit fields and distinguishes missing from empty', async () => {
  let rows: Record<string, unknown>[] = [];
  const repo = new PostgresReviewRepository({ async query(sql, values) {
    assert.match(sql, /WHERE b\.id = \$1 AND b\.user_id = \$2/);
    assert.match(sql, /r\.book_id = b\.id AND r\.user_id = b\.user_id/);
    assert.match(sql, /ORDER BY r\.created_at DESC, r\.id DESC/);
    assert.match(sql, /AT TIME ZONE 'UTC'/);
    assert.deepEqual(values, [book, owner]);
    return { rows, rowCount: rows.length };
  } });
  assert.equal(await repo.findAll(book, owner), undefined);
  rows = [{ id: null }];
  assert.deepEqual(await repo.findAll(book, owner), []);
  rows = [{ id, rating: 0, comment: 'synthetic', createdAt: '2026-01-02 03:04:05', reviewer: 'reader', extra: 'not exposed' }];
  assert.deepEqual(await repo.findAll(book, owner), [{ id, rating: 0, comment: 'synthetic', createdAt: '2026-01-02 03:04:05', reviewer: 'reader' }]);
});

test('review mutations are single owner-scoped statements and deny foreign or mismatched owners', async () => {
  const repo = new PostgresReviewRepository({ async query(sql, values) {
    if (sql.includes('INSERT')) {
      assert.match(sql, /FROM public\.books b\s+WHERE b\.id = \$4 AND b\.user_id = \$5/);
      assert.match(values[0] as string, /^[0-9a-f-]{36}$/);
      return { rows: [], rowCount: values[3] === book && values[4] === owner ? 1 : 0 };
    }
    assert.match(sql, /EXISTS \(SELECT 1 FROM public\.books b WHERE b\.id = r\.book_id AND b\.user_id = r\.user_id\)/);
    if (sql.includes('UPDATE')) {
      assert.match(sql, /r\.book_id = \$3 AND r\.id = \$4 AND r\.user_id = \$5/);
      return { rows: [], rowCount: values[2] === book && values[3] === id && values[4] === owner ? 1 : 0 };
    }
    assert.match(sql, /r\.id = \$1 AND r\.user_id = \$2/);
    return { rows: [], rowCount: values[0] === id && values[1] === owner ? 1 : 0 };
  } });
  assert.deepEqual(await repo.create(review), { changes: true });
  assert.deepEqual(await repo.create({ ...review, userId: foreign }), { changes: false });
  assert.deepEqual(await repo.update(id, review), { changes: true });
  assert.deepEqual(await repo.update(id, { ...review, userId: foreign }), { changes: false });
  assert.deepEqual(await repo.update(id, { ...review, bookId: foreign }), { changes: false });
  assert.deepEqual(await repo.delete(id, owner), { changes: true });
  assert.deepEqual(await repo.delete(id, foreign), { changes: false });
});

test('malformed and noncanonical identifiers do not reach the database', async () => {
  const repo = new PostgresReviewRepository({ async query() { throw new Error('must not query'); } });
  assert.equal(await repo.findAll('bad', owner), undefined);
  assert.equal(await repo.findAll(book, 'bad'), undefined);
  assert.deepEqual(await repo.create({ ...review, bookId: 'bad' }), { changes: false });
  assert.deepEqual(await repo.update('bad', review), { changes: false });
  assert.deepEqual(await repo.delete('bad', owner), { changes: false });
  assert.deepEqual(await repo.delete(id.toUpperCase().replace('000000000004', 'ABCDEF000004'), owner), { changes: false });
});

test('query failures are sanitized and retain endpoint-specific mutation errors', async () => {
  const repo = new PostgresReviewRepository({ async query() { throw new Error('private driver SQL'); } });
  await assert.rejects(repo.findAll(book, owner), { message: 'Review data access failed' });
  await assert.rejects(repo.create(review), { message: 'No se pudo guardar la reseña. Inténtalo de nuevo más tarde.' });
  await assert.rejects(repo.update(id, review), { message: 'No se pudo actualizar la reseña. Inténtalo de nuevo más tarde.' });
  await assert.rejects(repo.delete(id, owner), { message: 'Review data access failed' });
});
