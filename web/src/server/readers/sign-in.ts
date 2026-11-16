// Password sign-in. An email and its password start a session on this device.
// A wrong password, an unknown email, a revoked Reader and a Reader with no
// password yet all get the same answer, in about the same time, so the page
// never tells who is a Reader. Failed tries are rate-limited per email.
//
// The Owner chooses their first password on the sign-in page, and only while
// they have none. Every other Reader's password is set by the Owner on the
// Invites page (invites.ts). Any signed-in Reader can change their own.
import type { AppContext } from "../app";
import type { Db } from "../db";
import { hashPassword, passwordProblem, verifyPassword, type PasswordProblem } from "./passwords";
import { hashToken, normalizeEmail, type Reader } from "./readers";
import { createSession, endOtherSessions } from "./sessions";

/** At most this many failed tries per email in SIGN_IN_WINDOW_MS. */
export const MAX_FAILED_SIGN_INS = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

export type SignedIn = { ok: true; reader: Reader; sessionToken: string };

export type SignInResult = SignedIn | { ok: false; reason: "wrong" | "too-many-tries" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** POST /api/auth/sign-in. */
export async function signInWithPassword(ctx: AppContext, rawEmail: unknown, rawPassword: unknown): Promise<SignInResult> {
  const email = normalizeEmail(text(rawEmail));
  const password = text(rawPassword);
  if (tooManyFailures(ctx.db, email)) return { ok: false, reason: "too-many-tries" };

  const row = ctx.db
    .prepare("SELECT id, email, role, password_hash FROM readers WHERE email = ? AND revoked_at_ms IS NULL")
    .get(email) as (Reader & { password_hash: string | null }) | undefined;
  // Always hash, even for an unknown email, so the time taken gives nothing away.
  const stored = email && password ? (row?.password_hash ?? null) : null;
  const ok = await verifyPassword(password, stored, ctx.config.passwordCost);
  if (!ok || !row) {
    recordFailure(ctx.db, email);
    return { ok: false, reason: "wrong" };
  }
  clearFailures(ctx.db, email);
  const { password_hash: _, ...reader } = row;
  return { ok: true, reader, sessionToken: createSession(ctx, reader.id).token };
}

/** Whether the Owner still has to choose a password (the sign-in page then offers it). */
export function ownerNeedsPassword(ctx: AppContext): boolean {
  return !!ctx.db
    .prepare("SELECT 1 FROM readers WHERE role = 'owner' AND revoked_at_ms IS NULL AND password_hash IS NULL")
    .get();
}

export type FirstPasswordResult =
  | SignedIn
  | { ok: false; reason: PasswordProblem | "mismatch" | "refused" | "too-many-tries" };

/**
 * POST /api/auth/first-password: the Owner's first visit. Only the Owner's
 * email, and only while the Owner has no password: it sets the password and
 * signs in. Anything else is refused, the same way whatever the reason.
 */
export async function setOwnerFirstPassword(
  ctx: AppContext,
  rawEmail: unknown,
  rawPassword: unknown,
  rawConfirm: unknown,
): Promise<FirstPasswordResult> {
  const email = normalizeEmail(text(rawEmail));
  const password = text(rawPassword);
  if (tooManyFailures(ctx.db, email)) return { ok: false, reason: "too-many-tries" };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, reason: problem };
  if (password !== text(rawConfirm)) return { ok: false, reason: "mismatch" };

  const hash = await hashPassword(password, ctx.config.passwordCost);
  const { changes } = ctx.db
    .prepare(
      `UPDATE readers SET password_hash = ?
        WHERE role = 'owner' AND email = ? AND revoked_at_ms IS NULL AND password_hash IS NULL`,
    )
    .run(hash, email);
  if (changes !== 1) {
    recordFailure(ctx.db, email);
    return { ok: false, reason: "refused" };
  }
  clearFailures(ctx.db, email);
  const reader = ctx.db.prepare("SELECT id, email, role FROM readers WHERE role = 'owner'").get() as Reader;
  return { ok: true, reader, sessionToken: createSession(ctx, reader.id).token };
}

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; reason: PasswordProblem | "mismatch" | "wrong-current" | "too-many-tries" };

/**
 * POST /api/auth/password: a signed-in Reader changes their own password,
 * giving the current one. This device stays signed in; their others are
 * signed out. `confirm`, when given, must match the new password.
 */
export async function changeOwnPassword(
  ctx: AppContext,
  reader: Reader,
  sessionToken: string,
  input: { current: unknown; next: unknown; confirm?: unknown },
): Promise<ChangePasswordResult> {
  const next = text(input.next);
  if (tooManyFailures(ctx.db, reader.email)) return { ok: false, reason: "too-many-tries" };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, reason: problem };
  if (input.confirm !== undefined && text(input.confirm) !== next) return { ok: false, reason: "mismatch" };

  const stored = ctx.db.prepare("SELECT password_hash FROM readers WHERE id = ?").pluck().get(reader.id) as string | null;
  if (!(await verifyPassword(text(input.current), stored, ctx.config.passwordCost))) {
    recordFailure(ctx.db, reader.email);
    return { ok: false, reason: "wrong-current" };
  }
  const hash = await hashPassword(next, ctx.config.passwordCost);
  ctx.db.prepare("UPDATE readers SET password_hash = ? WHERE id = ?").run(hash, reader.id);
  endOtherSessions(ctx, reader.id, sessionToken);
  clearFailures(ctx.db, reader.email);
  return { ok: true };
}

// --- the rate limit --------------------------------------------------------------
// Kept in the database, so a restart does not reset it. Emails are hashed.

function tooManyFailures(db: Db, email: string): boolean {
  const count = db
    .prepare("SELECT COUNT(*) FROM sign_in_failures WHERE email_hash = ? AND at_ms > ?")
    .pluck()
    .get(hashToken(email), Date.now() - SIGN_IN_WINDOW_MS) as number;
  return count >= MAX_FAILED_SIGN_INS;
}

function recordFailure(db: Db, email: string): void {
  const now = Date.now();
  db.prepare("DELETE FROM sign_in_failures WHERE at_ms <= ?").run(now - SIGN_IN_WINDOW_MS);
  db.prepare("INSERT INTO sign_in_failures (email_hash, at_ms) VALUES (?, ?)").run(hashToken(email), now);
}

/** A good sign-in, or the Owner setting a new password, wipes the slate for that email. */
export function clearFailures(db: Db, email: string): void {
  db.prepare("DELETE FROM sign_in_failures WHERE email_hash = ?").run(hashToken(normalizeEmail(email)));
}
