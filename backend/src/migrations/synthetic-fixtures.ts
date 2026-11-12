// Pure fixture and planning logic; database operations are separate and opt-in.
// These non-login accounts must never be used for authentication testing.
const time = '2026-01-01T00:00:00.000Z';
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const first = '00000000-0000-4000-8000-000000000011';
const second = '00000000-0000-4000-8000-000000000012';
const third = '00000000-0000-4000-8000-000000000013';

export function syntheticFixtures() {
  return {
    users: [
      { id: alice, username: 'Synthetic Alice', email: 'alice@example.test', password: '!disabled', created_at: time },
      { id: bob, username: 'Synthetic Bob', email: 'bob@example.test', password: '!disabled', created_at: time },
    ],
    books: [
      { id: first, user_id: alice, title: 'Synthetic Harbor', author: 'Example Author', year: 2020, genre: ['Fiction'], cover_image: null, rating: null, is_favorite: true, description: null, reading_status: 'pending', created_at: time, updated_at: time },
      { id: second, user_id: alice, title: 'Synthetic Garden', author: 'Example Author', year: 2021, genre: ['History'], cover_image: null, rating: null, is_favorite: false, description: null, reading_status: 'pending', created_at: time, updated_at: time },
      { id: third, user_id: bob, title: 'Synthetic Mountain', author: 'Another Author', year: 2022, genre: ['Fiction'], cover_image: null, rating: null, is_favorite: true, description: null, reading_status: 'pending', created_at: time, updated_at: time },
    ],
    reviews: [
      { id: '00000000-0000-4000-8000-000000000021', book_id: first, user_id: alice, rating: 4, comment: 'Synthetic review', created_at: time },
      { id: '00000000-0000-4000-8000-000000000022', book_id: third, user_id: bob, rating: 5, comment: 'Another synthetic review', created_at: time },
    ],
  };
}

export type SyntheticSnapshot = ReturnType<typeof syntheticFixtures>;

// Exact ordered snapshots only. Callers must normalize types/order, verify the schema
// and target independently, and serialize check and write.
export function planSyntheticInitialization(optIn: unknown, snapshot: SyntheticSnapshot): 'insert' | 'unchanged' {
  if (optIn !== 'I_APPROVE_SYNTHETIC_PLANNING') throw new Error('Synthetic planning not approved');
  if (!snapshot || !Array.isArray(snapshot.users) || !Array.isArray(snapshot.books) || !Array.isArray(snapshot.reviews)) {
    throw new Error('Invalid synthetic snapshot');
  }
  if (!snapshot.users.length && !snapshot.books.length && !snapshot.reviews.length) return 'insert';
  if (JSON.stringify(snapshot) === JSON.stringify(syntheticFixtures())) return 'unchanged';
  throw new Error('Nonempty or changed synthetic snapshot rejected');
}
