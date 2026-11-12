import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { UserDataAccess } from '../models/data-access';
import { User } from '../types/user.type';

// Same cost as SQLite's synthetic comparison for an unknown account.
const DUMMY_PASSWORD_HASH = '$2b$10$gcjnO0Jf9YpGNkK2F3e2fOaPOLP9HvXACl/KXS7u.Ze3ygT8cXOOW';

export interface PostgresUserClient {
  query(sql: string, values: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

/** Uses the application-supplied PostgreSQL query client. */
export class PostgresUserRepository implements UserDataAccess {
  constructor(private readonly client: PostgresUserClient) {}

  async create(user: User) {
    const id = crypto.randomUUID();
    const password = bcrypt.hashSync(user.password, 10);
    try {
      const result = await this.client.query(
        'INSERT INTO public.users (id, username, email, password) VALUES ($1, $2, $3, $4)',
        [id, user.username, user.email, password],
      );
      return { id, changes: Boolean(result.rowCount) };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505' &&
          'constraint' in error && error.constraint === 'users_email_key') {
        // The existing registration controller maps this code to its established 409 response.
        throw Object.assign(new Error('Duplicate email'), { code: 'SQLITE_CONSTRAINT_UNIQUE' });
      }
      throw new Error('User data access failed');
    }
  }

  async find(user: Pick<User, 'email' | 'password'>) {
    let rows: Record<string, unknown>[];
    try {
      ({ rows } = await this.client.query(
        'SELECT id, username, password FROM public.users WHERE email = $1', [user.email],
      ));
    } catch {
      throw new Error('User data access failed');
    }
    const dbUser = rows[0];
    const hash = typeof dbUser?.password === 'string' ? dbUser.password : DUMMY_PASSWORD_HASH;
    const valid = bcrypt.compareSync(user.password, hash);
    if (!dbUser || !valid) throw new Error('Credenciales inválidas.');
    if (typeof dbUser.id !== 'string' || typeof dbUser.username !== 'string') {
      throw new Error('User data access failed');
    }
    return { token: jwt.sign({ id: dbUser.id, username: dbUser.username }, config.SECRET_KEY, { expiresIn: '6h' }) };
  }
}
