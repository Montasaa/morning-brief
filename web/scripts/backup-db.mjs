// Nightly SQLite backup (spec story 84). Run inside the app container:
//   docker exec morning-brief node scripts/backup-db.mjs
// Uses SQLite's online backup, so it is safe while the app is writing.
// Writes /backups/brief-YYYY-MM-DD.db and keeps the newest KEEP files (default 14).
import { readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const source = process.env.DATABASE_PATH || "data/brief.db";
const dir = process.env.BACKUP_DIR || "/backups";
const keep = Number(process.env.BACKUP_KEEP || 14);

const day = new Date().toISOString().slice(0, 10);
const target = path.join(dir, `brief-${day}.db`);

const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(target);
} finally {
  db.close();
}

// Make the copy one self-contained file (no -wal/-shm beside it), then check it.
const check = new Database(target);
check.pragma("journal_mode = DELETE");
const ok = check.pragma("integrity_check", { simple: true });
check.close();
if (ok !== "ok") {
  console.error(`backup ${target} failed integrity_check: ${ok}`);
  process.exit(1);
}

const old = readdirSync(dir).filter((f) => /^brief-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().reverse().slice(keep);
for (const f of old) unlinkSync(path.join(dir, f));
console.log(`backup ${target} ok; removed ${old.length} old`);
