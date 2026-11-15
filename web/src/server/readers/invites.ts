// Invites: the Owner's permission for one email to become a Reader. The Owner
// creates them, lists them (pending, accepted, revoked) and revokes them.
// Revoking an accepted Invite revokes the Reader it became: their devices are
// signed out and they can no longer sign in.
import type { AppContext } from "../app";
import { activeReaderByEmail, looksLikeEmail, normalizeEmail } from "./readers";
import { endAllSessions } from "./sessions";
import { sendInviteEmail } from "./sign-in";

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
  | { ok: false; reason: "invalid-email" | "already-a-reader" | "already-invited" };

/** The Owner invites `email`. The invited person is emailed a sign-in link straight away. */
export async function createInvite(
  ctx: AppContext,
  ownerId: number,
  rawEmail: unknown,
  origin: string,
): Promise<CreateInviteResult> {
  if (typeof rawEmail !== "string") return { ok: false, reason: "invalid-email" };
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return { ok: false, reason: "invalid-email" };
  if (activeReaderByEmail(ctx.db, email)) return { ok: false, reason: "already-a-reader" };
  const live = ctx.db.prepare(`${SELECT} WHERE email = ? AND revoked_at_ms IS NULL`).get(email);
  if (live) return { ok: false, reason: "already-invited" };

  const { lastInsertRowid } = ctx.db
    .prepare("INSERT INTO invites (email, invited_by, created_at_ms) VALUES (?, ?, ?)")
    .run(email, ownerId, Date.now());
  await sendInviteEmail(ctx, email, origin);
  return { ok: true, invite: inviteById(ctx, Number(lastInsertRowid))! };
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
 * Revoke an Invite. A pending one can no longer be used to sign in; an
 * accepted one also revokes its Reader and signs out all their devices.
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
        db.prepare("UPDATE readers SET revoked_at_ms = ? WHERE id = ? AND role = 'reader'").run(now, row.reader_id);
        endAllSessions(ctx, row.reader_id);
      }
      // Links already emailed stop working too.
      db.prepare("UPDATE magic_links SET used_at_ms = ? WHERE email = ? AND used_at_ms IS NULL").run(now, row.email);
    })();
  }
  return inviteById(ctx, id);
}
