// Sessions: one per signed-in device, carried in an HttpOnly cookie that lasts
// a year, so a Reader stays signed in on their phone. Only a hash of the
// cookie's token is stored.
import type { AppContext } from "../app";
import { hashToken, newToken, type Reader } from "./readers";

export const SESSION_COOKIE = "mb_session";
export const SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

export function createSession(ctx: AppContext, readerId: number): { token: string; expiresAtMs: number } {
  const { token, hash } = newToken();
  const now = Date.now();
  const expiresAtMs = now + SESSION_LIFETIME_MS;
  ctx.db
    .prepare("INSERT INTO sessions (token_hash, reader_id, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)")
    .run(hash, readerId, now, expiresAtMs);
  return { token, expiresAtMs };
}

/** The signed-in Reader for a session token, or null if it is unknown, expired or the Reader is revoked. */
export function readerForSession(ctx: AppContext, token: string | null | undefined): Reader | null {
  if (!token) return null;
  const row = ctx.db
    .prepare(
      `SELECT r.id, r.email, r.role
         FROM sessions s JOIN readers r ON r.id = s.reader_id
        WHERE s.token_hash = ? AND s.expires_at_ms > ? AND r.revoked_at_ms IS NULL`,
    )
    .get(hashToken(token), Date.now()) as Reader | undefined;
  return row ?? null;
}

export function endSession(ctx: AppContext, token: string | null | undefined): void {
  if (!token) return;
  ctx.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function endAllSessions(ctx: AppContext, readerId: number): void {
  ctx.db.prepare("DELETE FROM sessions WHERE reader_id = ?").run(readerId);
}

// --- the cookie ----------------------------------------------------------------

/** The session token from a request's Cookie header, or null. */
export function sessionTokenFrom(req: Request): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

function cookieAttributes(ctx: AppContext, req: Request): string {
  const origin = ctx.config.publicOrigin || new URL(req.url).origin;
  const secure = origin.startsWith("https:") ? "; Secure" : "";
  return `Path=${ctx.config.basePath || "/"}; HttpOnly; SameSite=Lax${secure}`;
}

export function sessionCookieHeader(ctx: AppContext, req: Request, token: string): string {
  const maxAge = Math.floor(SESSION_LIFETIME_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; ${cookieAttributes(ctx, req)}`;
}

export function clearedSessionCookieHeader(ctx: AppContext, req: Request): string {
  return `${SESSION_COOKIE}=; Max-Age=0; ${cookieAttributes(ctx, req)}`;
}
