// Push subscriptions (ticket 18): the devices a Reader has turned push on for.
// Each is a browser PushSubscription, stored against the session that
// subscribed it, so signing out of a device (or being revoked, which ends every
// session) stops its pushes. An endpoint is unique to one browser: subscribing
// it again, as whoever is signed in there now, moves it to them.
import type { AppContext } from "../app";
import type { PushSubscription } from "../outside";
import type { Reader } from "../readers/readers";
import { hashToken } from "../readers/readers";

export interface DeviceSubscription {
  endpoint: string;
  /** When it was subscribed (ISO 8601). */
  created_at: string;
}

export type SubscribeResult = { ok: true; subscription: DeviceSubscription } | { ok: false; reasons: string[] };

const MAX_ENDPOINT_LENGTH = 2048;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** Reads a PushSubscription as the browser serialises it ({endpoint, keys: {p256dh, auth}}). */
function parseSubscription(body: unknown): { ok: true; value: PushSubscription } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const endpoint = b.endpoint;
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH || !isHttpsUrl(endpoint)) {
    reasons.push("endpoint must be the push service's https URL.");
  }
  const keys = (typeof b.keys === "object" && b.keys !== null ? b.keys : {}) as Record<string, unknown>;
  for (const name of ["p256dh", "auth"] as const) {
    const key = keys[name];
    if (typeof key !== "string" || key.length > 200 || !BASE64URL.test(key)) reasons.push(`keys.${name} must be base64url text.`);
  }
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    value: { endpoint: endpoint as string, keys: { p256dh: keys.p256dh as string, auth: keys.auth as string } },
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** POST /api/push/subscriptions: turn push on for this device (the session `sessionToken`). */
export function subscribeDevice(ctx: AppContext, reader: Reader, sessionToken: string, body: unknown): SubscribeResult {
  const parsed = parseSubscription(body);
  if (!parsed.ok) return parsed;
  const { endpoint, keys } = parsed.value;
  const now = Date.now();
  ctx.db
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, reader_id, session_hash, p256dh, auth, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET
         reader_id = excluded.reader_id, session_hash = excluded.session_hash,
         p256dh = excluded.p256dh, auth = excluded.auth,
         created_at_ms = CASE WHEN reader_id = excluded.reader_id THEN created_at_ms ELSE excluded.created_at_ms END`,
    )
    .run(endpoint, reader.id, hashToken(sessionToken), keys.p256dh, keys.auth, now);
  return { ok: true, subscription: listDevices(ctx, reader.id).find((d) => d.endpoint === endpoint)! };
}

/** DELETE /api/push/subscriptions: turn push off for one of the Reader's devices. Another Reader's endpoint is left alone. */
export function unsubscribeDevice(ctx: AppContext, reader: Reader, endpoint: unknown): boolean {
  if (typeof endpoint !== "string") return false;
  const result = ctx.db
    .prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND reader_id = ?")
    .run(endpoint, reader.id);
  return result.changes > 0;
}

/** The Reader's subscribed devices, oldest first. */
export function listDevices(ctx: AppContext, readerId: number): DeviceSubscription[] {
  const rows = ctx.db
    .prepare("SELECT endpoint, created_at_ms FROM push_subscriptions WHERE reader_id = ? ORDER BY created_at_ms, endpoint")
    .all(readerId) as { endpoint: string; created_at_ms: number }[];
  return rows.map((r) => ({ endpoint: r.endpoint, created_at: new Date(r.created_at_ms).toISOString() }));
}

/** Where to push for a Reader: their devices whose session is still signed in. */
export function liveSubscriptions(ctx: AppContext, readerId: number): PushSubscription[] {
  const rows = ctx.db
    .prepare(
      `SELECT p.endpoint, p.p256dh, p.auth FROM push_subscriptions p
         JOIN sessions s ON s.token_hash = p.session_hash AND s.reader_id = p.reader_id
        WHERE p.reader_id = ? AND s.expires_at_ms > ?
        ORDER BY p.created_at_ms, p.endpoint`,
    )
    .all(readerId, Date.now()) as { endpoint: string; p256dh: string; auth: string }[];
  return rows.map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }));
}

/** The push service says the subscription has expired: forget it. */
export function forgetSubscription(ctx: AppContext, endpoint: string): void {
  ctx.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}
