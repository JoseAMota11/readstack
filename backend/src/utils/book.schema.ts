import { z } from 'zod';

function hasOnlyPairedSurrogates(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

export const bookSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').refine((value) => !value.includes('\u0000'), 'No se permite el carácter NUL.'),
  author: z.string().min(1, 'El autor es obligatorio').refine((value) => !value.includes('\u0000'), 'No se permite el carácter NUL.'),
  year: z.number().int().min(1000).max(9999),
  genre: z.array(z.string()
    .refine((value) => !value.includes('\u0000'), 'No se permite el carácter NUL.')
    .refine(hasOnlyPairedSurrogates, 'El género contiene un carácter Unicode no válido.'))
    .min(1, 'Debe incluir al menos un género'),
  coverImage: z.string().url().optional(),
  rating: z.number().min(0).max(5).optional(),
  isFavorite: z.boolean(),
  userId: z.string().uuid(),
});

export const bookSchemaPartial = bookSchema.partial();
