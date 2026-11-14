// Story Threads (ticket 14). Thread identity comes from the Edition: ingest
// stores each Thread (`threads`) and links every Item to its Thread through
// `items.thread_id`. A new development is always a new Item, so a Thread reads
// as a dated timeline of its Items across every Edition, newest first.
//
// What a Reader sees of a Thread follows the same rules as their Brief: only
// Items carrying a Topic they follow, and a sensitive Item (one carrying a
// Sensitive Topic) only once they have opted into every Sensitive Topic it
// carries (followed it). A Thread none of whose Items the Reader can see does
// not exist for them (404, and it is not listed).
//
// A Thread is *active* when the latest Edition carries one of its Items that
// the Reader can see. The Threads tab lists the Threads a Reader follows, then
// the other active ones, each group by its newest development.
import type { AppContext } from "../app";
import type { ItemStatus, Source } from "../editions/types";
import { topicName } from "../topics/names";

export interface ThreadDevelopment {
  id: string;
  title: string;
  title_ar: string | null;
  time: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  title_ar: string;
  /** Whether the Reader follows this Thread. */
  followed: boolean;
  /** The latest Edition carries one of its Items the Reader can see. */
  active: boolean;
  /** How many of its Items (developments) the Reader can see. */
  count: number;
  /** The newest development the Reader can see. */
  latest: ThreadDevelopment;
}

export interface TimelineItem {
  id: string;
  /** The day of the development in Asia/Riyadh, YYYY-MM-DD. */
  date: string;
  time: string;
  status: ItemStatus;
  title: string;
  title_ar: string | null;
  summary: string;
  summary_ar: string | null;
  sources: Source[];
  image: string | null;
  warning: string | null;
  warning_ar: string | null;
  topics: string[];
  /** The first of its Topics the Reader follows. */
  topic: string;
  /** It carries a Sensitive Topic: shown blurred with its warning until tapped. */
  blurred: boolean;
  /** The Edition the stored version of this Item came from. */
  edition_id: string;
}

export interface ThreadTimeline {
  thread: ThreadSummary;
  /** Newest first. */
  items: TimelineItem[];
  topic_names: Record<string, string>;
  topic_names_ar: Record<string, string>;
}

/**
 * Items the Reader `@reader` may see: at least one followed Topic, and every
 * Sensitive Topic opted into. (Ticket 08's `sensitiveItemVisibleSql` states the
 * same sensitive rule for the Brief.)
 */
const VISIBLE_ITEMS = `
  visible AS (
    SELECT i.* FROM items i
     WHERE i.thread_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM item_topics t
                     JOIN topic_follows f ON f.topic_id = t.topic_id AND f.reader_id = @reader
                    WHERE t.item_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM item_topics st
                         JOIN topics stt ON stt.id = st.topic_id AND stt.sensitive = 1
                        WHERE st.item_id = i.id
                          AND NOT EXISTS (SELECT 1 FROM topic_follows sf
                                           WHERE sf.topic_id = st.topic_id AND sf.reader_id = @reader)))`;

const LATEST_EDITION = `(SELECT id FROM editions ORDER BY generated_at_ms DESC, received_at DESC LIMIT 1)`;

interface SummaryRow {
  id: string;
  title: string;
  title_ar: string;
  followed: number;
  active: number;
  count: number;
  latest_id: string;
  latest_title: string;
  latest_title_ar: string | null;
  latest_time: string;
  latest_ms: number;
}

function summaries(ctx: AppContext, readerId: number, threadId?: string): SummaryRow[] {
  return ctx.db
    .prepare(
      `WITH ${VISIBLE_ITEMS},
       newest AS (
         SELECT v.*, ROW_NUMBER() OVER (PARTITION BY v.thread_id ORDER BY v.time_ms DESC, v.id) AS rank
           FROM visible v)
       SELECT th.id, th.title, th.title_ar,
              tf.reader_id IS NOT NULL AS followed,
              EXISTS (SELECT 1 FROM visible a JOIN edition_items ei ON ei.item_id = a.id
                       WHERE a.thread_id = th.id AND ei.edition_id = ${LATEST_EDITION}) AS active,
              (SELECT COUNT(*) FROM visible c WHERE c.thread_id = th.id) AS count,
              n.id AS latest_id, n.title AS latest_title, n.title_ar AS latest_title_ar,
              n.time AS latest_time, n.time_ms AS latest_ms
         FROM threads th
         JOIN newest n ON n.thread_id = th.id AND n.rank = 1
         LEFT JOIN thread_follows tf ON tf.thread_id = th.id AND tf.reader_id = @reader
        WHERE @thread IS NULL OR th.id = @thread`,
    )
    .all({ reader: readerId, thread: threadId ?? null }) as SummaryRow[];
}

function toSummary(r: SummaryRow): ThreadSummary {
  return {
    id: r.id,
    title: r.title,
    title_ar: r.title_ar,
    followed: r.followed === 1,
    active: r.active === 1,
    count: r.count,
    latest: { id: r.latest_id, title: r.latest_title, title_ar: r.latest_title_ar, time: r.latest_time },
  };
}

/** One Thread as the Reader sees it, or null when they can see none of its Items. */
export function threadSummary(ctx: AppContext, readerId: number, threadId: string): ThreadSummary | null {
  const row = summaries(ctx, readerId, threadId)[0];
  return row ? toSummary(row) : null;
}

/** The given Threads as the Reader sees them, by id (for the Thread chips on Brief cards). */
export function threadSummaries(ctx: AppContext, readerId: number, threadIds: Iterable<string>): Record<string, ThreadSummary> {
  const wanted = new Set(threadIds);
  if (wanted.size === 0) return {};
  return Object.fromEntries(
    summaries(ctx, readerId)
      .filter((r) => wanted.has(r.id))
      .map((r) => [r.id, toSummary(r)]),
  );
}

/** The Threads tab: the Threads the Reader follows, then the other active ones; newest development first in each. */
export function listThreads(ctx: AppContext, readerId: number): ThreadSummary[] {
  const rows = summaries(ctx, readerId).filter((r) => r.followed === 1 || r.active === 1);
  rows.sort((a, b) => b.followed - a.followed || b.latest_ms - a.latest_ms || a.id.localeCompare(b.id));
  return rows.map(toSummary);
}

interface TimelineRow extends Omit<TimelineItem, "date" | "sources" | "topics" | "topic" | "blurred"> {
  sources: string;
  topics: string;
  followed_topics: string;
  blurred: number;
}

/** The Thread's dated timeline for the Reader, newest first, or null when they can see none of it. */
export function threadTimeline(ctx: AppContext, readerId: number, threadId: string): ThreadTimeline | null {
  const thread = threadSummary(ctx, readerId, threadId);
  if (!thread) return null;
  const rows = ctx.db
    .prepare(
      `WITH ${VISIBLE_ITEMS}
       SELECT v.id, v.time, v.status, v.title, v.title_ar, v.summary, v.summary_ar, v.sources, v.image,
              v.warning, v.warning_ar, v.edition_id,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = v.id ORDER BY t.position)) AS topics,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT t.topic_id FROM item_topics t
                         JOIN topic_follows f ON f.topic_id = t.topic_id AND f.reader_id = @reader
                        WHERE t.item_id = v.id ORDER BY t.position)) AS followed_topics,
              EXISTS (SELECT 1 FROM item_topics st JOIN topics stt ON stt.id = st.topic_id AND stt.sensitive = 1
                       WHERE st.item_id = v.id) AS blurred
         FROM visible v
        WHERE v.thread_id = @thread
        ORDER BY v.time_ms DESC, v.id`,
    )
    .all({ reader: readerId, thread: threadId }) as TimelineRow[];

  const items = rows.map(({ followed_topics, ...r }): TimelineItem => ({
    ...r,
    date: riyadhDate(r.time),
    sources: JSON.parse(r.sources) as Source[],
    topics: JSON.parse(r.topics) as string[],
    topic: (JSON.parse(followed_topics) as string[])[0]!,
    blurred: r.blurred === 1,
  }));

  const topic_names = Object.fromEntries(items.flatMap((i) => i.topics).map((id) => [id, topicName(id)]));
  const arabicName = ctx.db.prepare("SELECT name_ar FROM topics WHERE id = ?").pluck();
  const topic_names_ar = Object.fromEntries(
    Object.entries(topic_names).map(([id, name]) => [id, (arabicName.get(id) as string | undefined) || name]),
  );
  return { thread, items, topic_names, topic_names_ar };
}

/** Follow a Thread. Following twice changes nothing. Null when the Reader can see none of it. */
export function followThread(ctx: AppContext, readerId: number, threadId: string): ThreadSummary | null {
  if (!threadSummary(ctx, readerId, threadId)) return null;
  ctx.db
    .prepare("INSERT INTO thread_follows (reader_id, thread_id, followed_at_ms) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .run(readerId, threadId, Date.now());
  return threadSummary(ctx, readerId, threadId);
}

/** Unfollow a Thread. Unfollowing twice changes nothing. Null when the Reader can see none of it. */
export function unfollowThread(ctx: AppContext, readerId: number, threadId: string): ThreadSummary | null {
  if (!threadSummary(ctx, readerId, threadId)) return null;
  ctx.db.prepare("DELETE FROM thread_follows WHERE reader_id = ? AND thread_id = ?").run(readerId, threadId);
  return threadSummary(ctx, readerId, threadId);
}

/** The YYYY-MM-DD date of an instant in Asia/Riyadh (UTC+3 all year). */
function riyadhDate(at: string): string {
  return new Date(Date.parse(at) + 3 * 3_600_000).toISOString().slice(0, 10);
}
