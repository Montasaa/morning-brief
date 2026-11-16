// Invites: the Owner's permission for one email to become a Reader. The Owner
// adds a Reader with an email and a password they choose (and tell the person):
// the Invite is accepted at once and the person can sign in straight away. The
// Owner lists Invites (accepted, revoked, and pending ones left from emailed
// links), resets a Reader's password, and revokes them. Revoking an accepted
// Invite revokes the Reader it became: their devices are signed out and they
// can no longer sign in. Adding the same email again brings them back.
import type { AppContext } from "../app";
import { hashPassword, passwordProblem, type PasswordProblem } from "./passwords";
import { activeReaderByEmail, looksLikeEmail, normalizeEmail } from "./readers";
import { endAllSessions } from "./sessions";
import { clearFailures } from "./sign-in";

export type InviteStatus = "pending" | "accepted" | "revoked";

export interface Invite {
  id: number;
  email: string;
  status: InviteStatus;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  /** The Reader this Invite became, once accepted. */
  reader_id: number | null;
}

interface InviteRow {
  id: number;
  email: string;
  created_at_ms: number;
  accepted_at_ms: number | null;
  revoked_at_ms: number | null;
  reader_id: number | null;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    email: row.email,
    status: row.revoked_at_ms !== null ? "revoked" : row.accepted_at_ms !== null ? "accepted" : "pending",
    created_at: iso(row.created_at_ms)!,
    accepted_at: iso(row.accepted_at_ms),
    revoked_at: iso(row.revoked_at_ms),
    reader_id: row.reader_id,
  };
}

const SELECT = "SELECT id, email, created_at_ms, accepted_at_ms, revoked_at_ms, reader_id FROM invites";

export type CreateInviteResult =
  | { ok: true; invite: Invite }
  | { ok: false; reason: "invalid-email" | PasswordProblem | "already-a-reader" };

/**
 * The Owner adds `email` as a Reader with `password`. They are a Reader at
 * once: the Invite is created accepted. A revoked Reader comes back with the
 * same id (and history); a pending Invite left from emailed links is accepted.
 */
export async function createInvite(
  ctx: AppContext,
  ownerId: number,
  rawEmail: unknown,
  rawPassword: unknown,
): Promise<CreateInviteResult> {
  if (typeof rawEmail !== "string") return { ok: false, reason: "invalid-email" };
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return { ok: false, reason: "invalid-email" };
  const problem = passwordProblem(typeof rawPassword === "string" ? rawPassword : "");
  if (problem) return { ok: false, reason: problem };
  if (activeReaderByEmail(ctx.db, email)) return { ok: false, reason: "already-a-reader" };
  const hash = await hashPassword(rawPassword as string, ctx.config.passwordCost);

  const { db } = ctx;
  return db.transaction((): CreateInviteResult => {
    // Checked again: the hashing above gave another request time to add them.
    if (activeReaderByEmail(db, email)) return { ok: false, reason: "already-a-reader" };
    const now = Date.now();
    db.prepare(
      `INSERT INTO readers (email, role, created_at_ms, password_hash) VALUES (?, 'reader', ?, ?)
       ON CONFLICT (email) DO UPDATE SET revoked_at_ms = NULL, password_hash = excluded.password_hash`,
    ).run(email, now, hash);
    const reader = activeReaderByEmail(db, email)!;
    const pending = db.prepare("SELECT id FROM invites WHERE email = ? AND revoked_at_ms IS NULL").pluck().get(email) as
      | number
      | undefined;
    let id = pending;
    if (id === undefined) {
      id = Number(
        db
          .prepare("INSERT INTO invites (email, invited_by, created_at_ms, accepted_at_ms, reader_id) VALUES (?, ?, ?, ?, ?)")
          .run(email, ownerId, now, now, reader.id).lastInsertRowid,
      );
    } else {
      db.prepare("UPDATE invites SET accepted_at_ms = ?, reader_id = ? WHERE id = ?").run(now, reader.id, id);
    }
    clearFailures(db, email);
    return { ok: true, invite: inviteById(ctx, id)! };
  })();
}

export type ResetPasswordResult =
  | { ok: true; invite: Invite }
  | { ok: false; reason: "not-found" | "not-a-reader" | PasswordProblem };

/**
 * The Owner gives the Reader of an accepted Invite a new password (they forgot
 * theirs, or it got out). Their devices are signed out; the new password
 * works at once, even if they had run into the rate limit.
 */
export async function resetReaderPassword(ctx: AppContext, id: number, rawPassword: unknown): Promise<ResetPasswordResult> {
  const invite = inviteById(ctx, id);
  if (!invite) return { ok: false, reason: "not-found" };
  if (invite.status !== "accepted" || invite.reader_id === null) return { ok: false, reason: "not-a-reader" };
  const problem = passwordProblem(typeof rawPassword === "string" ? rawPassword : "");
  if (problem) return { ok: false, reason: problem };
  const hash = await hashPassword(rawPassword as string, ctx.config.passwordCost);
  const { db } = ctx;
  const readerId = invite.reader_id;
  db.transaction(() => {
    db.prepare("UPDATE readers SET password_hash = ? WHERE id = ? AND role = 'reader'").run(hash, readerId);
    endAllSessions(ctx, readerId);
    clearFailures(db, invite.email);
  })();
  return { ok: true, invite };
}

/** Every Invite, newest first. */
export function listInvites(ctx: AppContext): Invite[] {
  return (ctx.db.prepare(`${SELECT} ORDER BY created_at_ms DESC, id DESC`).all() as InviteRow[]).map(toInvite);
}

export function inviteById(ctx: AppContext, id: number): Invite | null {
  const row = ctx.db.prepare(`${SELECT} WHERE id = ?`).get(id) as InviteRow | undefined;
  return row ? toInvite(row) : null;
}

/**
 * Revoke an Invite. A pending one can no longer be accepted; an accepted one
 * also revokes its Reader (their password is wiped) and signs out all their devices.
 * Revoking twice is harmless. Returns null for an unknown id.
 */
export function revokeInvite(ctx: AppContext, id: number): Invite | null {
  const { db } = ctx;
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as InviteRow | undefined;
  if (!row) return null;
  if (row.revoked_at_ms === null) {
    db.transaction(() => {
      const now = Date.now();
      db.prepare("UPDATE invites SET revoked_at_ms = ? WHERE id = ?").run(now, id);
      if (row.reader_id !== null) {
        db.prepare("UPDATE readers SET revoked_at_ms = ?, password_hash = NULL WHERE id = ? AND role = 'reader'").run(
          now,
          row.reader_id,
        );
        endAllSessions(ctx, row.reader_id);
      }
    })();
  }
  return inviteById(ctx, id);
}
