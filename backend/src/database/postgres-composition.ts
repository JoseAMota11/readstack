import type { Repositories } from './composition';
import { PostgresUserRepository, PostgresUserClient } from './postgres-user';
import { PostgresBookRepository } from './postgres-book';
import { PostgresReviewRepository } from './postgres-review';

export function composePostgres(client: PostgresUserClient): Repositories {
  return { users: new PostgresUserRepository(client), books: new PostgresBookRepository(client), reviews: new PostgresReviewRepository(client) };
}
