import { ListedReview, ReviewDataAccess } from '../models/data-access';
import { Review } from '../types/review.type';
import { PostgresUserClient } from './postgres-user';

// IDs are generated in canonical lowercase form; SQLite compares them as text.
const uuid = (id: string) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);

/** Standalone repository; the caller supplies token-derived userId. */
export class PostgresReviewRepository implements ReviewDataAccess {
  constructor(private readonly client: PostgresUserClient) {}

  async findAll(bookId: string, userId: string): Promise<ListedReview[] | undefined> {
    if (!uuid(bookId) || !uuid(userId)) return undefined;
    try {
      const { rows } = await this.client.query(`
        SELECT r.id, r.rating, r.comment,
          to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
          u.username AS reviewer
        FROM public.books b
        LEFT JOIN public.reviews r ON r.book_id = b.id AND r.user_id = b.user_id
        LEFT JOIN public.users u ON u.id = r.user_id
        WHERE b.id = $1 AND b.user_id = $2
        ORDER BY r.created_at DESC, r.id DESC`, [bookId, userId]);
      if (!rows.length) return undefined;
      if (rows[0].id === null) return [];
      return rows.map((row) => ({
        id: row.id as string, rating: row.rating as number, comment: row.comment as string,
        createdAt: row.createdAt as string, reviewer: row.reviewer as string,
      }));
    } catch {
      throw new Error('Review data access failed');
    }
  }

  async create(review: Review) {
    if (!uuid(review.bookId) || !uuid(review.userId)) return { changes: false };
    try {
      const result = await this.client.query(`
        INSERT INTO public.reviews (id, book_id, user_id, rating, comment)
        SELECT $1, b.id, b.user_id, $2, $3 FROM public.books b
        WHERE b.id = $4 AND b.user_id = $5`,
      [crypto.randomUUID(), review.rating, review.comment, review.bookId, review.userId]);
      return { changes: Boolean(result.rowCount) };
    } catch {
      throw new Error('No se pudo guardar la reseña. Inténtalo de nuevo más tarde.');
    }
  }

  async update(id: string, review: Review) {
    if (!uuid(id) || !uuid(review.bookId) || !uuid(review.userId)) return { changes: false };
    try {
      const result = await this.client.query(`
        UPDATE public.reviews r SET rating = $1, comment = $2
        WHERE r.book_id = $3 AND r.id = $4 AND r.user_id = $5
          AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = r.book_id AND b.user_id = r.user_id)`,
      [review.rating, review.comment, review.bookId, id, review.userId]);
      return { changes: Boolean(result.rowCount) };
    } catch {
      throw new Error('No se pudo actualizar la reseña. Inténtalo de nuevo más tarde.');
    }
  }

  async delete(id: string, userId: string) {
    if (!uuid(id) || !uuid(userId)) return { changes: false };
    try {
      const result = await this.client.query(`
        DELETE FROM public.reviews r WHERE r.id = $1 AND r.user_id = $2
          AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = r.book_id AND b.user_id = r.user_id)`, [id, userId]);
      return { changes: Boolean(result.rowCount) };
    } catch {
      throw new Error('Review data access failed');
    }
  }
}
