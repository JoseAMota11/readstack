import { Book, BooksFilters } from '../types/book.type';
import { Review } from '../types/review.type';
import { User } from '../types/user.type';

type Changes = { changes: boolean };
export type BookWithReviews = Book & {
  reviewAverageRating: number | null;
  reviewRatingCount: number;
};
export type ListedReview = Pick<Review, 'id' | 'rating' | 'comment' | 'createdAt'> & {
  reviewer: string;
};

export interface UserDataAccess {
  create(user: User): Promise<Changes & { id: string }>;
  find(user: Pick<User, 'email' | 'password'>): Promise<{ token: string }>;
}

export interface BookDataAccess {
  findAll(userId: string, filters?: BooksFilters): Promise<{
    books: BookWithReviews[];
    total: number;
    current: number;
    totalPages: number;
    size: number;
  }>;
  findOneById(id: string, userId: string): Promise<BookWithReviews | undefined>;
  create(book: Book): Promise<Changes>;
  update(id: string, book: Partial<Book> & Pick<Book, 'userId'>): Promise<Changes>;
  delete(id: string, userId: string): Promise<Changes>;
}

export interface ReviewDataAccess {
  findAll(bookId: string, userId: string): Promise<ListedReview[] | undefined>;
  create(review: Review): Promise<Changes>;
  update(id: string, review: Review): Promise<Changes>;
  delete(id: string, userId: string): Promise<Changes>;
}
