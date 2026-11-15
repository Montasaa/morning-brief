// Magic-link sign-in. Only the Owner, Readers who are not revoked, and people
// with a live Invite can sign in. Asking for a link never reveals which of
// these an email is: the caller always gets the same answer, and only an
// allowed email receives a link.
import type { AppContext } from "../app";
import type { Db } from "../db";
import { activeReaderByEmail, hashToken, looksLikeEmail, newToken, normalizeEmail, type Reader } from "./readers";
import { createSession } from "./sessions";

/** A link asked for on the sign-in page. */
export const SIGN_IN_LINK_TTL_MS = 15 * 60 * 1000;
/** The link in an Invite email, which may sit in an inbox for a while. */
export const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * At most this many unused links per email in one sign-in-link lifetime, so a
 * stranger cannot flood an inbox. Links that were used to sign in don't count.
 */
export const MAX_LINKS_PER_WINDOW = 5;

export type MagicLinkRequest = { ok: true } | { ok: false; reason: "invalid-email" };

/** Whether this email may sign in right now: the Owner, an active Reader, or a live Invite. */
function maySignIn(db: Db, email: string): boolean {
  if (activeReaderByEmail(db, email)) return true;
  return liveInvite(db, email) !== null;
}

function liveInvite(db: Db, email: string): { id: number } | null {
  return (
    (db
      .prepare("SELECT id FROM invites WHERE email = ? AND revoked_at_ms IS NULL AND accepted_at_ms IS NULL")
      .get(email) as { id: number } | undefined) ?? null
  );
}

/**
 * POST /api/auth/magic-link. `origin` is where the link points (PUBLIC_ORIGIN,
 * or the request's origin in local runs).
 */
export async function requestMagicLink(ctx: AppContext, rawEmail: unknown, origin: string): Promise<MagicLinkRequest> {
  if (typeof rawEmail !== "string") return { ok: false, reason: "invalid-email" };
  const email = normalizeEmail(rawEmail);
  if (!looksLikeEmail(email)) return { ok: false, reason: "invalid-email" };
  if (!maySignIn(ctx.db, email)) return { ok: true };

  const recent = ctx.db
    .prepare("SELECT COUNT(*) FROM magic_links WHERE email = ? AND created_at_ms > ? AND used_at_ms IS NULL")
    .pluck()
    .get(email, Date.now() - SIGN_IN_LINK_TTL_MS) as number;
  if (recent >= MAX_LINKS_PER_WINDOW) return { ok: true };

  const url = issueLink(ctx, email, SIGN_IN_LINK_TTL_MS, origin);
  await sendQuietly(ctx, {
    to: email,
    subject: "Your Morning Brief sign-in link",
    text: [
      "Open this link to sign in to Morning Brief:",
      "",
      url,
      "",
      "It works once and expires in 15 minutes. If you did not ask for it, you can ignore this email.",
    ].join("\n"),
    html: emailHtml("Sign in to Morning Brief", url, "It works once and expires in 15 minutes. If you did not ask for it, you can ignore this email."),
  });
  return { ok: true };
}

/** Emails an Invite with its own longer-lived magic link. */
export async function sendInviteEmail(ctx: AppContext, email: string, origin: string): Promise<void> {
  const url = issueLink(ctx, email, INVITE_LINK_TTL_MS, origin);
  await sendQuietly(ctx, {
    to: email,
    subject: "You're invited to Morning Brief",
    text: [
      "You have been invited to read Morning Brief, a personal daily news brief.",
      "",
      "Open this link to sign in:",
      "",
      url,
      "",
      "It works once and expires in 7 days. After that, ask for a new link on the sign-in page with this email address.",
    ].join("\n"),
    html: emailHtml(
      "You're invited to Morning Brief",
      url,
      "It works once and expires in 7 days. After that, ask for a new link on the sign-in page with this email address.",
    ),
  });
}

function issueLink(ctx: AppContext, email: string, ttlMs: number, origin: string): string {
  const { token, hash } = newToken();
  const now = Date.now();
  ctx.db
    .prepare("INSERT INTO magic_links (token_hash, email, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)")
    .run(hash, email, now, now + ttlMs);
  return `${origin}${ctx.config.basePath}/api/auth/callback?token=${token}`;
}

/** A failed send must not change the response, or it would tell who is invited. */
async function sendQuietly(ctx: AppContext, message: Parameters<AppContext["services"]["email"]["send"]>[0]) {
  try {
    await ctx.services.email.send(message);
  } catch (err) {
    // Never log the address or the link.
    console.error("Morning Brief: sending a sign-in email failed:", err instanceof Error ? err.name : "error");
  }
}

function emailHtml(heading: string, url: string, note: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return [
    `<h1 style="font-size:20px">${esc(heading)}</h1>`,
    `<p><a href="${esc(url)}">Sign in to Morning Brief</a></p>`,
    `<p style="color:#6b6760">${esc(note)}</p>`,
  ].join("\n");
}

export type Redeemed = { ok: true; reader: Reader; sessionToken: string } | { ok: false };

/**
 * GET /api/auth/callback: use a magic link once. A first sign-in through an
 * Invite accepts it and makes the person a Reader (again, if they were revoked).
 */
export function redeemMagicLink(ctx: AppContext, token: string | null): Redeemed {
  if (!token) return { ok: false };
  const { db } = ctx;
  return db.transaction((): Redeemed => {
    const now = Date.now();
    const link = db
      .prepare("SELECT email, expires_at_ms, used_at_ms FROM magic_links WHERE token_hash = ?")
      .get(hashToken(token)) as { email: string; expires_at_ms: number; used_at_ms: number | null } | undefined;
    if (!link || link.used_at_ms !== null || link.expires_at_ms <= now) return { ok: false };
    db.prepare("UPDATE magic_links SET used_at_ms = ? WHERE token_hash = ?").run(now, hashToken(token));

    let reader = activeReaderByEmail(db, link.email);
    if (!reader) {
      const invite = liveInvite(db, link.email);
      if (!invite) return { ok: false }; // revoked since the link was sent
      db.prepare(
        `INSERT INTO readers (email, role, created_at_ms) VALUES (?, 'reader', ?)
         ON CONFLICT (email) DO UPDATE SET revoked_at_ms = NULL`,
      ).run(link.email, now);
      reader = activeReaderByEmail(db, link.email)!;
      db.prepare("UPDATE invites SET accepted_at_ms = ?, reader_id = ? WHERE id = ?").run(now, reader.id, invite.id);
    }
    const session = createSession(ctx, reader.id);
    return { ok: true, reader, sessionToken: session.token };
  })();
}
