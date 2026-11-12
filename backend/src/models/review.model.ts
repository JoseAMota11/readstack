import { ListedReview, ReviewDataAccess } from './data-access';
import db from '../config/db';
import { Review } from '../types/review.type';

export class ReviewModel {
  static async findAll(bookId: string, userId: string) {
    const book = db
      .prepare('SELECT 1 FROM Books WHERE id = ? AND userId = ?')
      .get(bookId, userId);

    if (!book) return undefined;

    const stmt = db.prepare(`
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.createdAt,
        u.username AS reviewer
      FROM Reviews r
      JOIN Users u ON r.userId = u.id
      JOIN Books b ON b.id = r.bookId AND b.userId = r.userId
      WHERE r.bookId = ? AND r.userId = ? AND b.userId = ?
      ORDER BY r.createdAt DESC
    `);

    return stmt.all(bookId, userId, userId) as ListedReview[];
  }

  static async create(review: Review) {
    const { bookId, userId, rating, comment } = review;

    const id = crypto.randomUUID();
    const stmt = db.prepare(
      `INSERT INTO Reviews (
        id,
        bookId,
        userId,
        rating,
        comment
      ) SELECT ?, id, userId, ?, ? FROM Books WHERE id = ? AND userId = ?`
    );

    try {
      const info = stmt.run(id, rating, comment, bookId, userId);

      return { changes: Boolean(info.changes) };
    } catch (error) {
      throw new Error(
        'No se pudo guardar la reseña. Inténtalo de nuevo más tarde.'
      );
    }
  }

  static async update(id: string, review: Review) {
    const { bookId, userId, rating, comment } = review;

    const stmt = db.prepare(
      `UPDATE Reviews 
       SET rating = ?, comment = ? 
       WHERE bookId = ? AND id = ? AND userId = ?
         AND EXISTS (
           SELECT 1 FROM Books b
           WHERE b.id = Reviews.bookId AND b.userId = Reviews.userId
         )`
    );

    try {
      const info = stmt.run(rating, comment, bookId, id, userId);

      return { changes: Boolean(info.changes) };
    } catch (error) {
      throw new Error(
        'No se pudo actualizar la reseña. Inténtalo de nuevo más tarde.'
      );
    }
  }

  static async delete(id: string, userId: string) {
    const stmt = db.prepare(`
      DELETE FROM Reviews WHERE id = ? AND userId = ?
        AND EXISTS (
          SELECT 1 FROM Books b
          WHERE b.id = Reviews.bookId AND b.userId = Reviews.userId
        )
    `);
    const info = stmt.run(id, userId);

    return { changes: Boolean(info.changes) };
  }
}

ReviewModel satisfies ReviewDataAccess;
