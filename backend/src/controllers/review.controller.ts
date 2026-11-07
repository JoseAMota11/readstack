import { Request, Response } from 'express';
import { ReviewModel } from '../models/review.model';

export class ReviewController {
  static getAllReviews(req: Request, res: Response) {
    const { bookId } = req.params;
    const result = ReviewModel.findAll(bookId, req.userId!);

    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ error: 'Recurso no disponible.' });
    }
  }

  static setReview(req: Request, res: Response) {
    try {
      const { changes } = ReviewModel.create({
        ...req.body,
        userId: req.userId,
      });

      if (changes) {
        res.status(201).json({ message: 'Reseña creada exitosamente.' });
      } else {
        res.status(404).json({ error: 'Recurso no disponible.' });
      }
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      }
    }
  }

  static updateReview(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const { changes } = ReviewModel.update(id, {
        ...req.body,
        userId: req.userId,
      });

      if (changes) {
        res.status(200).json({ message: 'Reseña actualizada exitosamente.' });
      } else {
        res.status(404).json({ error: 'Recurso no disponible.' });
      }
    } catch (error) {
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      }
    }
  }

  static deleteReview(req: Request, res: Response) {
    const { id } = req.params;

    const { changes } = ReviewModel.delete(id, req.userId!);

    if (changes) {
      res.status(200).json({ message: 'Reseña borrada exitosamente.' });
    } else {
      res.status(404).json({ error: 'Recurso no disponible.' });
    }
  }
}
