import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || 'library.db';

const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'test' ? undefined : console.log,
});

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS Users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS Books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    year INTEGER NOT NULL,
    genre TEXT NOT NULL,
    coverImage TEXT,
    rating REAL,
    isFavorite INTEGER NOT NULL DEFAULT 0 CHECK (isFavorite IN (0, 1)),
    userId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES Users (id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS Reviews (
    id TEXT PRIMARY KEY,
    bookId TEXT NOT NULL,
    userId TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 5),
    comment TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bookId) REFERENCES Books (id) ON DELETE CASCADE,
    FOREIGN KEY (userId) REFERENCES Users (id) ON DELETE CASCADE
  );
`);

export default db;

console.log('Tables created successfully!');
