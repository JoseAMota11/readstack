import { BookDataAccess, BookWithReviews } from '../models/data-access';
import { Book, BooksFilters } from '../types/book.type';
import { PostgresUserClient } from './postgres-user';

const uuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lower = 'abcdefghijklmnopqrstuvwxyz';
// SQLite LIKE stops at U+0000 in the pattern, even though query filters accept it.
const sqlitePattern = (value: string) => value.split('\u0000', 1)[0];

const projection = `b.id, b.title, b.author, b.year, b.genre,
  b.cover_image AS "coverImage", b.rating, b.is_favorite AS "isFavorite",
  b.user_id AS "userId",
  to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
  to_char(b.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "updatedAt",
  a.average AS "reviewAverageRating", COALESCE(a.count, 0) AS "reviewRatingCount"`;
const aggregates = `LEFT JOIN LATERAL (
  SELECT AVG(r.rating)::double precision AS average, COUNT(r.rating) AS count
  FROM public.reviews r WHERE r.book_id = b.id AND r.user_id = b.user_id
) a ON true`;

function mapBook(row: Record<string, unknown>): BookWithReviews {
  return {
    id: row.id as string, title: row.title as string, author: row.author as string,
    year: row.year as number, genre: row.genre as string[],
    coverImage: row.coverImage as string | undefined, rating: row.rating as number | undefined,
    isFavorite: row.isFavorite as boolean, userId: row.userId as string,
    createdAt: row.createdAt as string, updatedAt: row.updatedAt as string,
    reviewAverageRating: row.reviewAverageRating === null ? null : Number(row.reviewAverageRating),
    reviewRatingCount: Number(row.reviewRatingCount),
  };
}

/** Standalone repository; the caller supplies the authenticated userId. */
export class PostgresBookRepository implements BookDataAccess {
  constructor(private readonly client: PostgresUserClient) {}

  async findAll(userId: string, filters?: BooksFilters) {
    const current = filters?.current!;
    const size = filters?.size!;
    if (!uuid(userId)) return { books: [], total: 0, current, totalPages: Math.ceil(0 / size), size };
    const params: unknown[] = [userId];
    const conditions = ['b.user_id = $1'];
    const like = (expression: string, pattern: string) => {
      params.push(sqlitePattern(pattern));
      conditions.push(`translate(${expression}, '${upper}', '${lower}') COLLATE "C" LIKE translate($${params.length}::text, '${upper}', '${lower}') COLLATE "C" ESCAPE ''`);
    };
    if (filters?.title) like('b.title', `%${filters.title}%`);
    if (filters?.author) like('b.author', `%${filters.author}%`);
    if (filters?.year) like('b.year::text', `%${filters.year}%`);
    if (filters?.genre) {
      // Reconstruct the compact JSON array used by SQLite's JSON.stringify storage.
      like(`('[' || COALESCE((SELECT string_agg(item.value::text, ',' ORDER BY item.ordinality)
        FROM jsonb_array_elements(b.genre) WITH ORDINALITY AS item(value, ordinality)), '') || ']')`, `%"${filters.genre}"%`);
    }
    const where = conditions.join(' AND ');
    try {
      const list = await this.client.query(`SELECT ${projection} FROM public.books b ${aggregates}
        WHERE ${where} ORDER BY b.created_at DESC, b.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, size < 0 ? null : size, Math.max((current - 1) * size, 0)]);
      const count = await this.client.query(`SELECT COUNT(*) AS total FROM public.books b WHERE ${where}`, params);
      const total = Number(count.rows[0].total);
      return { books: list.rows.map(mapBook), total, current, totalPages: Math.ceil(total / size), size };
    } catch {
      throw new Error('Book data access failed');
    }
  }

  async findOneById(id: string, userId: string) {
    if (!uuid(id) || !uuid(userId)) return undefined;
    try {
      const result = await this.client.query(`SELECT ${projection} FROM public.books b ${aggregates}
        WHERE b.id = $1 AND b.user_id = $2`, [id, userId]);
      return result.rows.length ? mapBook(result.rows[0]) : undefined;
    } catch {
      throw new Error('Book data access failed');
    }
  }

  async create(book: Book) {
    if (!uuid(book.userId)) throw new Error('El usuario no existe.');
    try {
      const result = await this.client.query(`INSERT INTO public.books
        (id, title, author, year, genre, cover_image, rating, is_favorite, user_id)
        SELECT $1, $2, $3, $4, $5::jsonb, $6, $7, $8, u.id FROM public.users u WHERE u.id = $9`,
      [crypto.randomUUID(), book.title, book.author, book.year, JSON.stringify(book.genre), book.coverImage ?? null,
        book.rating ?? null, book.isFavorite, book.userId]);
      if (!result.rowCount) throw new Error('El usuario no existe.');
      return { changes: true };
    } catch (error) {
      if (error instanceof Error && error.message === 'El usuario no existe.') throw error;
      throw new Error('No se pudo crear el libro. Inténtalo de nuevo más tarde.');
    }
  }

  async update(id: string, book: Partial<Book> & Pick<Book, 'userId'>) {
    const updates: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown, cast = '') => {
      values.push(value); updates.push(`${column} = $${values.length}${cast}`);
    };
    if (book.title !== undefined) add('title', book.title);
    if (book.author !== undefined) add('author', book.author);
    if (book.year !== undefined) add('year', book.year);
    if (book.genre !== undefined) add('genre', JSON.stringify(book.genre), '::jsonb');
    if (book.coverImage !== undefined) add('cover_image', book.coverImage);
    if (book.rating !== undefined) add('rating', book.rating);
    if (book.isFavorite !== undefined) add('is_favorite', book.isFavorite);
    if (!updates.length) throw new Error('No se proporcionaron campos para actualizar.');
    if (!uuid(id) || !uuid(book.userId)) return { changes: false };
    values.push(book.userId, id);
    try {
      const result = await this.client.query(`UPDATE public.books SET ${updates.join(', ')}
        WHERE user_id = $${values.length - 1} AND id = $${values.length}`, values);
      return { changes: Boolean(result.rowCount) };
    } catch {
      throw new Error('No se pudo actualizar el libro. Inténtalo de nuevo más tarde.');
    }
  }

  async delete(id: string, userId: string) {
    if (!uuid(id) || !uuid(userId)) return { changes: false };
    try {
      const result = await this.client.query('DELETE FROM public.books WHERE id = $1 AND user_id = $2', [id, userId]);
      return { changes: Boolean(result.rowCount) };
    } catch {
      throw new Error('Book data access failed');
    }
  }
}
