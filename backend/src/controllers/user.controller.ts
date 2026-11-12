import { UserModel } from '../models/user.model';
import { User } from '../types/user.type';
import { Request, Response } from 'express';

export class UserController {
  static async register(req: Request, res: Response) {
    const user = req.body as User;

    try {
      const { changes } = await UserModel.create(user);

      if (changes) {
        res.status(200).json({ message: 'Usuario creado satisfactoriamente' });
      } else {
        res.status(500).json({ error: 'Error interno del servidor. Por favor, inténtelo más tarde.' });
      }
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        res.status(409).json({ error: 'Este correo ya está en uso.' });
      } else {
        res.status(500).json({
          error: 'Error interno del servidor. Por favor, inténtelo más tarde.',
        });
      }
    }
  }

  static async login(req: Request, res: Response) {
    const user = req.body as Pick<User, 'email' | 'password'>;

    try {
      const { token } = await UserModel.find(user);

      res.status(200).json({ token });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Credenciales inválidas.'
      ) {
        res.status(401).json({ message: 'Email o contraseña incorrectos.' });
      } else {
        res.status(500).json({ error: 'Error interno del servidor. Por favor, inténtelo más tarde.' });
      }
    }
  }
}
