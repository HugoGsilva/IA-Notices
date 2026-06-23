import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Folder containing the generated SQL migrations. Resolved relative to this
 * module so it works the same from `src` (tsx) and `dist` (compiled): the
 * `drizzle/` folder sits at the project root, two levels up from `db/`.
 */
const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

/**
 * Open a SQLite database, apply pending migrations and return a Drizzle handle.
 *
 * Pass `:memory:` for an isolated, temporary database (used in tests). For a
 * file path, parent directories are created automatically.
 */
export function createDb(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
