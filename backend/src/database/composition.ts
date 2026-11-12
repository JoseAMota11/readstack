import type { Request } from 'express';
import type { UserDataAccess, BookDataAccess, ReviewDataAccess } from '../models/data-access';

export interface Repositories {
  users: UserDataAccess;
  books: BookDataAccess;
  reviews: ReviewDataAccess;
}

export function repositoriesFor(req: Request): Repositories {
  return req.app.locals.repositories as Repositories;
}
