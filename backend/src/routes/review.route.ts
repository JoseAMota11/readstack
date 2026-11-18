import { asyncHandler } from '../middlewares/async-handler';
import { Router } from 'express';
import { authMiddleware } from '../middlewares/book.middleware';
import { ReviewController } from '../controllers/review.controller';
import { validateReviewsData } from '../middlewares/review.middleware';

const reviewRouter = Router();

// Routes
reviewRouter.get(
  '/reviews/:bookId',
  authMiddleware,
  asyncHandler(ReviewController.getAllReviews)
);
reviewRouter.post(
  '/reviews',
  authMiddleware,
  validateReviewsData,
  asyncHandler(ReviewController.setReview)
);
reviewRouter.put(
  '/reviews/:id',
  authMiddleware,
  validateReviewsData,
  asyncHandler(ReviewController.updateReview)
);
reviewRouter.delete(
  '/reviews/:id',
  authMiddleware,
  asyncHandler(ReviewController.deleteReview)
);

export default reviewRouter;
