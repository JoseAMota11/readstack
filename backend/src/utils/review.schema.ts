import { z } from 'zod';

export const reviewSchema = z.object({
  bookId: z.string().uuid(),
  userId: z.string().uuid(),
  rating: z
    .number()
    .int()
    .min(0, 'La calificación debe ser al menos 0')
    .max(5, 'La calificación no puede ser mayor a 5'),
  comment: z.string().min(1, 'El comentario no puede estar vacío').refine((value) => !value.includes('\u0000'), 'No se permite el carácter NUL.'),
});
