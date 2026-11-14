// The SQLite database: opening it and applying migrations.
//
// Migrations are hand-written SQL files in web/migrations named
// tNN_<slug>.sql (NN = the ticket that adds it). They are applied in lexical
// filename order, each once, and tracked by filename in schema_migrations, so
// branches built in parallel never collide. Never edit a migration that has
// been merged; add a new file instead.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

/** web/migrations, found from the working directory (next and vitest both run in web/). */
export function migrationsDir(): string {
  return path.join(process.cwd(), "migrations");
}

export function openDatabase(file: string, dir: string = migrationsDir()): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db, dir);
  return db;
}

/** Applies every migration file not yet recorded. Returns the filenames it applied. */
export function migrate(db: Db, dir: string = migrationsDir()): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  const done = new Set(
    db.prepare("SELECT filename FROM schema_migrations").pluck().all() as string[],
  );
  // turbopackIgnore: migrations are read at run time; next.config.ts traces the folder.
  const pending = readdirSync(/*turbopackIgnore: true*/ dir)
    .filter((f) => /^t\d{2}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .filter((f) => !done.has(f));
  const record = db.prepare("INSERT INTO schema_migrations (filename) VALUES (?)");
  for (const file of pending) {
    const sql = readFileSync(path.join(/*turbopackIgnore: true*/ dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      record.run(file);
    })();
  }
  return pending;
}
