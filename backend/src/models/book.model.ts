import { BookDataAccess, BookWithReviews } from './data-access';
import db from '../config/db';
import { Book, BooksFilters } from '../types/book.type';

const reviewAggregates = `
  SELECT bookId, userId, AVG(rating) AS reviewAverageRating,
    COUNT(rating) AS reviewRatingCount
  FROM Reviews WHERE userId = @userId
  GROUP BY bookId, userId
`;

export class BookModel {
  static async findAll(userId: string, filters?: BooksFilters) {
    let query = 'SELECT * FROM Books';
    let countQuery = 'SELECT COUNT(*) AS total FROM Books';
    const conditions: string[] = ['userId = @userId'];
    const params: any = { userId };
    const current = filters?.current!;
    const size = filters?.size!;
    const offset = (current - 1) * size;

    if (filters?.title) {
      conditions.push('title LIKE @title');
      params.title = `%${filters.title}%`;
    }
    if (filters?.author) {
      conditions.push('author LIKE @author');
      params.author = `%${filters.author}%`;
    }
    if (filters?.year) {
      conditions.push('year LIKE @year');
      params.year = `%${filters.year}%`;
    }
    if (filters?.genre) {
      conditions.push('genre LIKE @genre');
      params.genre = `%"${filters.genre}"%`;
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' ORDER BY createdAt DESC LIMIT @size OFFSET @offset';

    const stmt = db.prepare(`
      SELECT books.*, reviews.reviewAverageRating,
        COALESCE(reviews.reviewRatingCount, 0) AS reviewRatingCount
      FROM (${query}) AS books
      LEFT JOIN (${reviewAggregates}) AS reviews
        ON reviews.bookId = books.id AND reviews.userId = books.userId
      ORDER BY books.createdAt DESC
    `);
    const countStmt = db.prepare(countQuery);

    const books = stmt.all({ ...params, size, offset }) as BookWithReviews[];
    const { total } = countStmt.get(params) as { total: number };

    return {
      books: books.map(({ genre, isFavorite, ...rest }) => ({
        ...rest,
        isFavorite: Boolean(isFavorite),
        genre: JSON.parse(genre as any as string),
      })),
      total,
      current,
      totalPages: Math.ceil(total / size),
      size,
    };
  }

  static async findOneById(id: string, userId: string) {
    const stmt = db.prepare(`
      SELECT books.*, reviews.reviewAverageRating,
        COALESCE(reviews.reviewRatingCount, 0) AS reviewRatingCount
      FROM Books AS books
      LEFT JOIN (${reviewAggregates}) AS reviews
        ON reviews.bookId = books.id AND reviews.userId = books.userId
      WHERE books.id = @id AND books.userId = @userId
    `);
    const book = stmt.get({ id, userId }) as BookWithReviews | undefined;

    if (!book) {
      return undefined;
    }

    const { genre, isFavorite, ...rest } = book;

    return {
      ...rest,
      isFavorite: Boolean(isFavorite),
      genre: JSON.parse(genre as any as string),
    };
  }

  static async create(book: Book) {
    const {
      title,
      author,
      year,
      genre,
      coverImage,
      rating,
      isFavorite,
      userId,
    } = book;

    const userExists = db
      .prepare('SELECT 1 FROM Users WHERE id = ?')
      .get(userId);

    if (!userExists) {
      throw new Error('El usuario no existe.');
    }

    const id = crypto.randomUUID();
    const stmt = db.prepare(
      `INSERT INTO Books (
        id,
        title,
        author,
        year,
        genre,
        coverImage,
        rating,
        isFavorite,
        userId
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    try {
      const info = stmt.run(
        id,
        title,
        author,
        year,
        JSON.stringify(genre),
        coverImage,
        rating,
        Number(isFavorite),
        userId
      );

      return { changes: Boolean(info.changes) };
    } catch (error) {
      throw new Error(
        'No se pudo crear el libro. Inténtalo de nuevo más tarde.'
      );
    }
  }

  static async update(id: string, book: Partial<Book> & Pick<Book, 'userId'>) {
    const updates: string[] = [];
    const params: any[] = [];

    if (book.title !== undefined) {
      updates.push('title = ?');
      params.push(book.title);
    }
    if (book.author !== undefined) {
      updates.push('author = ?');
      params.push(book.author);
    }
    if (book.year !== undefined) {
      updates.push('year = ?');
      params.push(book.year);
    }
    if (book.genre !== undefined) {
      updates.push('genre = ?');
      params.push(JSON.stringify(book.genre));
    }
    if (book.coverImage !== undefined) {
      updates.push('coverImage = ?');
      params.push(book.coverImage);
    }
    if (book.rating !== undefined) {
      updates.push('rating = ?');
      params.push(book.rating);
    }
    if (book.isFavorite !== undefined) {
      updates.push('isFavorite = ?');
      params.push(Number(book.isFavorite));
    }

    params.push(book.userId);
    params.push(id);

    if (updates.length === 0) {
      throw new Error('No se proporcionaron campos para actualizar.');
    }

    const query = `
      UPDATE Books
      SET ${updates.join(', ')}
      WHERE userId = ? AND id = ?
    `;

    const stmt = db.prepare(query);

    try {
      const info = stmt.run(...params);

      return { changes: Boolean(info.changes) };
    } catch (error) {
      throw new Error(
        'No se pudo actualizar el libro. Inténtalo de nuevo más tarde.'
      );
    }
  }

  static async delete(id: string, userId: string) {
    const stmt = db.prepare('DELETE FROM Books WHERE id = ? AND userId = ?');
    const info = stmt.run(id, userId);

    return { changes: Boolean(info.changes) };
  }
}

BookModel satisfies BookDataAccess;
