import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app, db } from './test-app';
import { TEST_SECRET } from './test-env';

export const PASSWORD = 'Synthetic-pass-1';

let counter = 0;

function uniqueLabel(prefix: string): string {
  counter += 1;
  return `${prefix.slice(0, 12)}-${randomUUID().slice(0, 8)}-${counter}`;
}

export type TestUser = {
  token: string;
  userId: string;
  email: string;
  username: string;
};

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function registerUser(prefix = 'user'): Promise<TestUser> {
  const username = uniqueLabel(prefix);
  const email = `${username}@example.test`;

  await request(app)
    .post('/api/v1/register')
    .send({ username, email, password: PASSWORD })
    .expect(200);

  const login = await request(app)
    .post('/api/v1/login')
    .send({ email, password: PASSWORD })
    .expect(200);

  const token = login.body.token as string;
  const decoded = jwt.verify(token, TEST_SECRET) as jwt.JwtPayload;

  return { token, userId: decoded.id as string, email, username };
}

export async function createBook(
  token: string,
  userId: string,
  overrides: Record<string, unknown> = {}
) {
  const body = {
    title: uniqueLabel('Synthetic Book'),
    author: 'Synthetic Author',
    year: 2020,
    genre: ['Synthetic'],
    isFavorite: false,
    userId,
    ...overrides,
  };
  const title = body.title as string;

  await request(app)
    .post('/api/v1/books')
    .set(auth(token))
    .send(body)
    .expect(201);

  const list = await request(app)
    .get('/api/v1/books')
    .query({ title, size: 10 })
    .set(auth(token))
    .expect(200);

  const book = (list.body.books as Array<{ id: string; title: string }>).find(
    (item) => item.title === title
  );

  if (!book) {
    throw new Error('Created book was not returned by the listing endpoint.');
  }

  return book;
}

export async function createReview(
  token: string,
  userId: string,
  bookId: string,
  overrides: Record<string, unknown> = {}
) {
  return request(app)
    .post('/api/v1/reviews')
    .set(auth(token))
    .send({
      bookId,
      userId,
      rating: 4,
      comment: uniqueLabel('Synthetic review'),
      ...overrides,
    });
}

export async function listReviews(token: string, bookId: string) {
  const response = await request(app)
    .get(`/api/v1/reviews/${bookId}`)
    .set(auth(token))
    .expect(200);

  return response.body as Array<{
    id: string;
    rating: number;
    comment: string;
    reviewer: string;
  }>;
}

// Only used to reproduce an ownership state that the current API cannot create
// once foreign-book review creation is blocked.
export function insertReviewDirectly(params: {
  bookId: string;
  userId: string;
  rating?: number;
  comment?: string;
}): string {
  const id = randomUUID();

  db.prepare(
    'INSERT INTO Reviews (id, bookId, userId, rating, comment) VALUES (?, ?, ?, ?, ?)'
  ).run(
    id,
    params.bookId,
    params.userId,
    params.rating ?? 3,
    params.comment ?? uniqueLabel('Seeded review')
  );

  return id;
}
