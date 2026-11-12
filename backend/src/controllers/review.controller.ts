import { Request, Response } from 'express';
import { ReviewModel } from '../models/review.model';

export class ReviewController {
  static async getAllReviews(req: Request, res: Response) {
    const { bookId } = req.params;
    const result = await ReviewModel.findAll(bookId, req.userId!);

    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ error: 'Recurso no disponible.' });
    }
  }

  static async setReview(req: Request, res: Response) {
    try {
      const { changes } = await ReviewModel.create({
        ...req.body,
        userId: req.userId,
      });

      if (changes) {
        res.status(201).json({ message: 'Reseña creada exitosamente.' });
      } else {
        res.status(404).json({ error: 'Recurso no disponible.' });
      }
    } catch (error) {
      const expected = ['No se pudo guardar la reseña. Inténtalo de nuevo más tarde.'];
      res.status(500).json({
        error: error instanceof Error && expected.includes(error.message)
          ? error.message
          : 'Error interno del servidor. Por favor, inténtelo más tarde.',
      });
    }
  }

  static async updateReview(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const { changes } = await ReviewModel.update(id, {
        ...req.body,
        userId: req.userId,
      });

      if (changes) {
        res.status(200).json({ message: 'Reseña actualizada exitosamente.' });
      } else {
        res.status(404).json({ error: 'Recurso no disponible.' });
      }
    } catch (error) {
      const expected = ['No se pudo actualizar la reseña. Inténtalo de nuevo más tarde.'];
      res.status(500).json({
        error: error instanceof Error && expected.includes(error.message)
          ? error.message
          : 'Error interno del servidor. Por favor, inténtelo más tarde.',
      });
    }
  }

  static async deleteReview(req: Request, res: Response) {
    const { id } = req.params;

    const { changes } = await ReviewModel.delete(id, req.userId!);

    if (changes) {
      res.status(200).json({ message: 'Reseña borrada exitosamente.' });
    } else {
      res.status(404).json({ error: 'Recurso no disponible.' });
    }
  }
}
