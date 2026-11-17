import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { bookSchema, bookSchemaPartial } from '../utils/book.schema';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res
      .status(401)
      .json({ message: 'No estás autenticado. Por favor, inicia sesión.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res
      .status(401)
      .json({ message: 'No estás autenticado. Por favor, inicia sesión.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.SECRET_KEY) as jwt.JwtPayload;

    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({
      message: 'Tu sesión ha expirado. Por favor, inicia sesión nuevamente.',
    });
  }
};

export const validateBooksData = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (Array.isArray(req.body?.genre) && req.body.genre.length > 20) {
    res.status(400).json({ message: 'Demasiados géneros.' });
    return;
  }
  try {
    bookSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof Error && 'errors' in error) {
      res.status(400).json({
        message: 'Error en la validación de los datos.',
        errors: (error as any).errors,
      });
    } else {
      res.status(400).json({ message: 'Datos no válidos.' });
    }
  }
};

export const validateBooksDataPartial = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (Array.isArray(req.body?.genre) && req.body.genre.length > 20) {
    res.status(400).json({ message: 'Demasiados géneros.' });
    return;
  }
  try {
    bookSchemaPartial.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof Error && 'errors' in error) {
      res.status(400).json({
        message: 'Error en la validación de los datos.',
        errors: (error as any).errors,
      });
    } else {
      res.status(400).json({ message: 'Datos no válidos.' });
    }
  }
};
