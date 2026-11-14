// Ask limits: how many questions a Reader may ask Claude each day. The Owner
// has no limit. Other Readers get DEFAULT_DAILY_ASK_LIMIT unless the Owner sets
// their own. The count resets at 00:00 Asia/Riyadh (UTC+3 all year, no
// daylight saving) and covers questions about every Item.
import type { AppContext } from "../app";
import type { Reader } from "../readers/readers";

export const DEFAULT_DAILY_ASK_LIMIT = 20;
/** The most the Owner can set; a guard against typos, not a policy. */
export const MAX_DAILY_ASK_LIMIT = 1000;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** What a Reader sees on the Ask sheet. */
export interface AskLimit {
  unlimited: boolean;
  /** Questions allowed per day, or null for the Owner. */
  daily: number | null;
  /** Questions asked since 00:00 Asia/Riyadh today. */
  used_today: number;
  /** Questions left today, or null for the Owner. */
  remaining: number | null;
  /** When the count resets (RFC 3339, +03:00), or null for the Owner. */
  resets_at: string | null;
}

/** The YYYY-MM-DD day in Asia/Riyadh that an instant falls on. */
export function riyadhDay(ms: number): string {
  return new Date(ms + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 Asia/Riyadh on the day after `day`, as RFC 3339. */
function nextMidnight(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return `${new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)}T00:00:00+03:00`;
}

/** The daily limit that applies to a Reader, or null when they have none (the Owner). */
export function dailyLimitFor(ctx: AppContext, reader: Pick<Reader, "id" | "role">): number | null {
  if (reader.role === "owner") return null;
  const set = ctx.db.prepare("SELECT daily_limit FROM ask_limits WHERE reader_id = ?").pluck().get(reader.id) as
    | number
    | undefined;
  return set ?? DEFAULT_DAILY_ASK_LIMIT;
}

/** A Reader's limit and today's usage, as of `now`. */
export function askLimitFor(ctx: AppContext, reader: Pick<Reader, "id" | "role">, now = Date.now()): AskLimit {
  const day = riyadhDay(now);
  const used = ctx.db
    .prepare("SELECT COUNT(*) FROM asks WHERE reader_id = ? AND ask_day = ?")
    .pluck()
    .get(reader.id, day) as number;
  const daily = dailyLimitFor(ctx, reader);
  if (daily === null) return { unlimited: true, daily: null, used_today: used, remaining: null, resets_at: null };
  return {
    unlimited: false,
    daily,
    used_today: used,
    remaining: Math.max(0, daily - used),
    resets_at: nextMidnight(day),
  };
}

export type SetAskLimitResult =
  | { ok: true; reader_id: number; ask_limit: AskLimit }
  | { ok: false; reason: "invalid-limit" | "no-such-reader" | "owner-has-no-limit" };

/**
 * The Owner sets a Reader's daily limit: a whole number from 0 (no asking) to
 * MAX_DAILY_ASK_LIMIT, or null to go back to the default. It applies straight
 * away, to questions already asked today too.
 */
export function setAskLimit(ctx: AppContext, readerId: number, raw: unknown): SetAskLimitResult {
  if (raw !== null && !(Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= MAX_DAILY_ASK_LIMIT)) {
    return { ok: false, reason: "invalid-limit" };
  }
  const reader = ctx.db.prepare("SELECT id, role FROM readers WHERE id = ?").get(readerId) as
    | Pick<Reader, "id" | "role">
    | undefined;
  if (!reader) return { ok: false, reason: "no-such-reader" };
  if (reader.role === "owner") return { ok: false, reason: "owner-has-no-limit" };

  if (raw === null) {
    ctx.db.prepare("DELETE FROM ask_limits WHERE reader_id = ?").run(reader.id);
  } else {
    ctx.db
      .prepare(
        `INSERT INTO ask_limits (reader_id, daily_limit, set_at_ms) VALUES (?, ?, ?)
         ON CONFLICT (reader_id) DO UPDATE SET daily_limit = excluded.daily_limit, set_at_ms = excluded.set_at_ms`,
      )
      .run(reader.id, raw, Date.now());
  }
  return { ok: true, reader_id: reader.id, ask_limit: askLimitFor(ctx, reader) };
}

export interface ReaderAskUsage {
  id: number;
  email: string;
  role: Reader["role"];
  ask_limit: AskLimit;
}

/** Every current Reader (the Owner first) with their limit and today's usage, for the Owner. */
export function askUsage(ctx: AppContext): ReaderAskUsage[] {
  const readers = ctx.db
    .prepare(
      `SELECT id, email, role FROM readers WHERE revoked_at_ms IS NULL
        ORDER BY role = 'owner' DESC, email`,
    )
    .all() as Reader[];
  const now = Date.now();
  return readers.map((r) => ({ ...r, ask_limit: askLimitFor(ctx, r, now) }));
}
