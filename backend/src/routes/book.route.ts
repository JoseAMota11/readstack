import { asyncHandler } from '../middlewares/async-handler';
import { Router } from 'express';
import { BookController } from '../controllers/book.controller';
import {
  authMiddleware,
  validateBooksData,
  validateBooksDataPartial,
} from '../middlewares/book.middleware';

const bookRouter = Router();

// Routes
bookRouter.get('/books', authMiddleware, asyncHandler(BookController.getAllBooks));
bookRouter.get('/books/:id', authMiddleware, asyncHandler(BookController.getOneBook));
bookRouter.get(
  '/books/:id/export',
  authMiddleware,
  asyncHandler(BookController.exportBookToCSV)
);
bookRouter.post(
  '/books',
  authMiddleware,
  validateBooksData,
  asyncHandler(BookController.setBook)
);
bookRouter.patch(
  '/books/:id',
  authMiddleware,
  validateBooksDataPartial,
  asyncHandler(BookController.updateBook)
);
bookRouter.delete('/books/:id', authMiddleware, asyncHandler(BookController.deleteBook));

export default bookRouter;
