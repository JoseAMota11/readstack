CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  email text COLLATE "C" NOT NULL UNIQUE,
  password text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  year integer NOT NULL,
  genre jsonb NOT NULL CHECK (jsonb_typeof(genre) = 'array'),
  cover_image text,
  rating double precision,
  is_favorite boolean NOT NULL DEFAULT false,
  description text,
  reading_status text NOT NULL DEFAULT 'pending'
    CHECK (reading_status IN ('pending', 'reading', 'finished', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, user_id)
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  book_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 0 AND 5),
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id, user_id) REFERENCES books (id, user_id) ON DELETE CASCADE
);

CREATE INDEX books_user_created_id_idx
  ON books (user_id, created_at DESC, id DESC);

CREATE INDEX reviews_book_user_created_id_idx
  ON reviews (book_id, user_id, created_at DESC, id DESC);
