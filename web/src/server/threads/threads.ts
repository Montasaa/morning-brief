// Story Threads (ticket 14). Thread identity comes from the Edition: ingest
// stores each Thread (`threads`) and links every Item to its Thread through
// `items.thread_id`. A new development is always a new Item, so a Thread reads
// as a dated timeline of its Items across every Edition, newest first.
//
// What a Reader sees of a Thread follows the same rules as their Brief: only
// Items carrying a Topic they follow (in their Catalog: another Reader's
// private Topic never counts, and is stripped from an Item's `topics`), and a
// sensitive Item (one carrying a Sensitive Topic) only once they have opted
// into every Sensitive Topic it carries (followed it). A Thread none of whose
// Items the Reader can see does not exist for them (404, and it is not listed).
//
// A Thread is *active* when the latest Edition carries one of its Items that
// the Reader can see. The Threads tab lists the Threads a Reader follows, then
// the other active ones, each group by its newest development.
import type { AppContext } from "../app";
import { imageKindOf, type ImageKind, type ItemStatus, type Source } from "../editions/types";
import { topicNamesOf } from "../saved-search/listing";
import { hiddenTopicIds, VISIBLE_TO_READER } from "../topics/catalog";
import { blurredItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";

export interface ThreadDevelopment {
  id: string;
  title: string;
  title_ar: string | null;
  time: string;
  /** It carries a Sensitive Topic the Reader has not turned the blur off for: its title stays behind its warning until tapped. */
  blurred: boolean;
  warning: string | null;
  warning_ar: string | null;
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
  /** How the picture is shown (rework ticket 10): photo, card or none. */
  image_kind: ImageKind;
  warning: string | null;
  warning_ar: string | null;
  topics: string[];
  /** The first of its Topics the Reader follows. */
  topic: string;
  /** It carries a Sensitive Topic the Reader has not turned the blur off for: shown blurred with its warning until tapped. */
  blurred: boolean;
  /** Explicit media (`nsfw_media`): its picture stays blurred until tapped, whatever the blur switch says. */
  media_blurred: boolean;
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
 * Items the Reader `@reader` may see: at least one followed Topic in their
 * Catalog, and every Sensitive Topic opted into. Takes one `?` parameter, the
 * Reader's id (for `sensitiveItemVisibleSql`), besides `@reader`.
 */
const VISIBLE_ITEMS = `
  visible AS (
    SELECT i.* FROM items i
     WHERE i.thread_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM item_topics it
                     JOIN topic_follows f ON f.topic_id = it.topic_id AND f.reader_id = @reader
                     JOIN topics t ON t.id = it.topic_id
                    WHERE it.item_id = i.id AND ${VISIBLE_TO_READER})
       AND ${sensitiveItemVisibleSql("i.id")})`;

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
  latest_blurred: number;
  latest_warning: string | null;
  latest_warning_ar: string | null;
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
              n.time AS latest_time, n.time_ms AS latest_ms,
              ${blurredItemSql("n.id")} AS latest_blurred, n.warning AS latest_warning, n.warning_ar AS latest_warning_ar
         FROM threads th
         JOIN newest n ON n.thread_id = th.id AND n.rank = 1
         LEFT JOIN thread_follows tf ON tf.thread_id = th.id AND tf.reader_id = @reader
        WHERE @thread IS NULL OR th.id = @thread`,
    )
    .all(readerId, readerId, { reader: readerId, thread: threadId ?? null }) as SummaryRow[];
}

function toSummary(r: SummaryRow): ThreadSummary {
  return {
    id: r.id,
    title: r.title,
    title_ar: r.title_ar,
    followed: r.followed === 1,
    active: r.active === 1,
    count: r.count,
    latest: {
      id: r.latest_id,
      title: r.latest_title,
      title_ar: r.latest_title_ar,
      time: r.latest_time,
      blurred: r.latest_blurred === 1,
      warning: r.latest_warning,
      warning_ar: r.latest_warning_ar,
    },
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

interface TimelineRow extends Omit<TimelineItem, "date" | "sources" | "image_kind" | "topics" | "topic" | "blurred" | "media_blurred"> {
  sources: string;
  image_kind: ImageKind | null;
  nsfw_media: number;
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
              v.image_kind, v.nsfw_media, v.warning, v.warning_ar, v.edition_id,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = v.id ORDER BY t.position)) AS topics,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT t.topic_id FROM item_topics t
                         JOIN topic_follows f ON f.topic_id = t.topic_id AND f.reader_id = @reader
                        WHERE t.item_id = v.id ORDER BY t.position)) AS followed_topics,
              ${blurredItemSql("v.id")} AS blurred
         FROM visible v
        WHERE v.thread_id = @thread
        ORDER BY v.time_ms DESC, v.id`,
    )
    .all(readerId, readerId, { reader: readerId, thread: threadId }) as TimelineRow[];

  const hidden = hiddenTopicIds(ctx, readerId); // other Readers' private Topics (ticket 11)
  const items = rows.map(({ followed_topics, nsfw_media, ...r }): TimelineItem => ({
    ...r,
    date: riyadhDate(r.time),
    sources: JSON.parse(r.sources) as Source[],
    image_kind: imageKindOf(r),
    media_blurred: nsfw_media === 1,
    topics: (JSON.parse(r.topics) as string[]).filter((t) => !hidden.has(t)),
    topic: (JSON.parse(followed_topics) as string[]).filter((t) => !hidden.has(t))[0]!,
    blurred: r.blurred === 1,
  }));

  return { thread, items, ...topicNamesOf(ctx, items) };
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
