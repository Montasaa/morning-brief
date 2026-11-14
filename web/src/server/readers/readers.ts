// Readers: who they are, who may sign in, and the Owner created at setup.
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "../db";

export type ReaderRole = "owner" | "reader";

export interface Reader {
  id: number;
  email: string;
  role: ReaderRole;
}

/** Emails are compared trimmed and lowercased everywhere. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A plain shape check; Resend has the final say on deliverability. */
export function looksLikeEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** A fresh random token for a magic link or a session, and the hash that is stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The Reader with this email who is not revoked, or null. */
export function activeReaderByEmail(db: Db, email: string): Reader | null {
  return (
    (db
      .prepare("SELECT id, email, role FROM readers WHERE email = ? AND revoked_at_ms IS NULL")
      .get(normalizeEmail(email)) as Reader | undefined) ?? null
  );
}

/**
 * Setup: create the Owner from OWNER_EMAIL if there is no Owner yet. Runs every
 * time the app opens its database, so it is idempotent. An existing Owner is
 * never replaced from the environment.
 */
export function ensureOwner(db: Db, ownerEmail: string): void {
  const email = normalizeEmail(ownerEmail);
  if (!email) return;
  const hasOwner = db.prepare("SELECT 1 FROM readers WHERE role = 'owner'").get();
  if (hasOwner) return;
  db.prepare(
    `INSERT INTO readers (email, role, created_at_ms) VALUES (?, 'owner', ?)
     ON CONFLICT (email) DO UPDATE SET role = 'owner', revoked_at_ms = NULL`,
  ).run(email, Date.now());
}
