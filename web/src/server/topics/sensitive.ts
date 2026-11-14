// Sensitive Topics (ticket 08): Graphic and Adult Trending (`topics.sensitive`).
//
// A Reader opts into a Sensitive Topic by following it, only through
// POST /api/topics/{id}/follow (the Me tab); Adult Trending also needs an 18+
// confirmation, recorded in `age_confirmations`. Onboarding and
// PATCH /api/me never add one.
//
// A sensitive Item is one that carries at least one Sensitive Topic. It reaches
// a Reader only if they opted into every Sensitive Topic it carries, and then
// it is shown blurred with its warning until tapped. Everything that lists
// Items to a Reader (the Brief, Story Threads, Saved & Search) filters with
// `sensitiveItemVisibleSql` and marks with `sensitiveItemSql`, so no path
// shows a sensitive Item to a Reader who has not opted in.
import type { AppContext } from "../app";
import { catalogTopic, followTopic, type CatalogTopic } from "./catalog";

/** The Sensitive Topic that also needs an 18+ confirmation to opt into. */
export const ADULT_TOPIC_ID = "adult-trending";

/**
 * SQL that is true when the Reader may see the Item whose id is `itemId` (an
 * SQL expression such as `i.id`): every Sensitive Topic it carries is one the
 * Reader follows. Takes one `?` parameter, the Reader's id.
 */
export function sensitiveItemVisibleSql(itemId: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM item_topics st JOIN topics stt ON stt.id = st.topic_id AND stt.sensitive = 1
     WHERE st.item_id = ${itemId}
       AND NOT EXISTS (SELECT 1 FROM topic_follows sf WHERE sf.topic_id = st.topic_id AND sf.reader_id = ?))`;
}

/** SQL that is true (1) when the Item whose id is `itemId` carries a Sensitive Topic, so it is shown blurred. No parameters. */
export function sensitiveItemSql(itemId: string): string {
  return `EXISTS (
    SELECT 1 FROM item_topics st JOIN topics stt ON stt.id = st.topic_id AND stt.sensitive = 1
     WHERE st.item_id = ${itemId})`;
}

/** Whether `topicId` is a Sensitive Topic in the Catalog. */
export function isSensitiveTopic(ctx: AppContext, topicId: string): boolean {
  return ctx.db.prepare("SELECT 1 FROM topics WHERE id = ? AND sensitive = 1").pluck().get(topicId) !== undefined;
}

export type FollowResult =
  | { ok: true; topic: CatalogTopic }
  | { ok: false; status: 404 | 422; error: string; reasons: string[] };

/**
 * POST /api/topics/{id}/follow: follow a Catalog Topic, which for a Sensitive
 * Topic is opting into it. Adult Trending needs `{ "age_confirmed": true }` in
 * the request body; the confirmation is recorded each time. Following twice
 * changes nothing (and records nothing new).
 */
export function followOrOptIn(ctx: AppContext, readerId: number, topicId: string, body: unknown): FollowResult {
  const topic = catalogTopic(ctx, readerId, topicId);
  if (!topic) return { ok: false, status: 404, error: "No such Topic in the Catalog.", reasons: [] };
  if (topic.id !== ADULT_TOPIC_ID || topic.followed) return { ok: true, topic: followTopic(ctx, readerId, topicId)! };

  const confirmed = typeof body === "object" && body !== null && (body as Record<string, unknown>).age_confirmed === true;
  if (!confirmed) {
    return {
      ok: false,
      status: 422,
      error: "Confirm you are 18 or over to opt into Adult Trending.",
      reasons: ['Send {"age_confirmed": true} to confirm you are 18 or over.'],
    };
  }
  const { db } = ctx;
  return db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO age_confirmations (reader_id, topic_id, confirmed_at_ms) VALUES (?, ?, ?)").run(
      readerId,
      topicId,
      Date.now(),
    );
    return { ok: true as const, topic: followTopic(ctx, readerId, topicId)! };
  })();
}

/** When the Reader last confirmed they are 18 or over (ISO 8601), or null if they never have. */
export function lastAgeConfirmation(ctx: AppContext, readerId: number): string | null {
  const ms = ctx.db
    .prepare("SELECT MAX(confirmed_at_ms) FROM age_confirmations WHERE reader_id = ?")
    .pluck()
    .get(readerId) as number | null;
  return ms == null ? null : new Date(ms).toISOString();
}
