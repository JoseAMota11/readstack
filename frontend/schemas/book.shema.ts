import { z } from 'zod';

export const bookSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio'),
  author: z.string().min(1, 'El autor es obligatorio'),
  year: z.number().int().min(1000).max(9999),
  genre: z.array(z.string()).min(1, 'Debe incluir al menos un género'),
  coverImage: z.string().url().optional(),
  isFavorite: z.boolean(),
});

export const editBookSchema = bookSchema.extend({
  coverImage: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    bookSchema.shape.coverImage,
  ),
});
