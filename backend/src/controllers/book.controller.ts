import { Request, Response } from 'express';
import { BookModel } from '../models/book.model';
import { BooksFilters } from '../types/book.type';
import { Parser } from 'json2csv';

export class BookController {
  static async getAllBooks(req: Request, res: Response) {
    const filters = req.query as any as BooksFilters;

    const current = filters?.current ? Number(filters.current) : 1;
    const size = filters?.size ? Number(filters.size) : 10;

    try {
      const result = await BookModel.findAll(req.userId!, {
        ...filters,
        current,
        size,
      });

      res.status(200).json({
        books: result.books,
        pagination: {
          total: result.total,
          current: result.current,
          totalPages: result.totalPages,
          size: result.size,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ error: 'Ocurrió un error al obtener los libros.' });
    }
  }

  static async getOneBook(req: Request, res: Response) {
    const { id } = req.params;
    const result = await BookModel.findOneById(id, req.userId!);

    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ error: 'Este libro no está disponible' });
    }
  }

  static async setBook(req: Request, res: Response) {
    try {
      const { changes } = await BookModel.create({ ...req.body, userId: req.userId });

      if (changes) {
        res.status(201).json({ message: 'Libro creado exitosamente.' });
      } else {
        res.status(400).json({
          error:
            'No se pudo crear el libro. Verifica los datos e inténtalo de nuevo.',
        });
      }
    } catch (error) {
      const expected = ['El usuario no existe.', 'No se pudo crear el libro. Inténtalo de nuevo más tarde.'];
      res.status(500).json({
        error: error instanceof Error && expected.includes(error.message)
          ? error.message
          : 'Error interno del servidor. Por favor, inténtelo más tarde.',
      });
    }
  }

  static async updateBook(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const { changes } = await BookModel.update(id, {
        ...req.body,
        userId: req.userId!,
      });

      if (changes) {
        res.status(200).json({ message: 'Libro actualizado exitosamente.' });
      } else {
        res.status(400).json({
          error:
            'No se pudo actualizar el libro. Verifica los datos e inténtalo de nuevo.',
        });
      }
    } catch (error) {
      const expected = ['No se proporcionaron campos para actualizar.', 'No se pudo actualizar el libro. Inténtalo de nuevo más tarde.'];
      res.status(500).json({
        error: error instanceof Error && expected.includes(error.message)
          ? error.message
          : 'Error interno del servidor. Por favor, inténtelo más tarde.',
      });
    }
  }

  static async deleteBook(req: Request, res: Response) {
    const { id } = req.params;

    const { changes } = await BookModel.delete(id, req.userId!);

    if (changes) {
      res.status(200).json({ message: 'Libro borrado exitosamente.' });
    } else {
      res.status(400).json({
        error:
          'No se pudo borrar el libro. Verifica los datos e inténtalo de nuevo.',
      });
    }
  }

  static async exportBookToCSV(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const book = await BookModel.findOneById(id, req.userId!);

      if (!book) {
        res.status(404).json({ error: 'Este libro no está disponible' });
        return;
      }

      const data = {
        id: book.id,
        title: book.title,
        author: book.author,
        year: book.year,
        genre: book.genre.join(', '),
        coverImage: book.coverImage || '',
        rating: book.rating || '',
        isFavorite: book.isFavorite ? 'Sí' : 'No',
        userId: book.userId,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
      };

      const parser = new Parser();
      const csv = parser.parse(data);

      res.header('Content-Type', 'text/csv');
      res.header(
        'Content-Disposition',
        `attachment; filename="book_${id}.csv"`
      );
      res.send(csv);
    } catch (error) {
      res.status(500).json({ message: 'Error al exportar el libro.' });
    }
  }
}
