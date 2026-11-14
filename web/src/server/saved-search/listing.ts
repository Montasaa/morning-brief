// Saved & Search (ticket 15): how both lists show an Item to one Reader.
//
// Unlike the Brief, these lists reach back across every Edition ever posted
// (Editions, Items and Story Threads are never pruned), so each Item is the
// stored version from the newest Edition that carried it. Every Item listed
// follows the same rules as the Brief:
//
// - Sensitive: it reaches the Reader only if they opted into every Sensitive
//   Topic it carries, and is then marked `blurred` (ticket 08).
// - Topics: it carries at least one Topic in the Catalog, so an Item no Reader
//   could ever follow is never listed. Ticket 11 (private Topics) narrows this
//   to Topics in the Catalog *as this Reader sees it*: `listableItemSql` is the
//   one place to do that.
// - Reactions are only ever this Reader's own (ticket 09).
import type { AppContext } from "../app";
import type { ItemStatus, Source } from "../editions/types";
import { followedTopicIds } from "../topics/catalog";
import { topicName } from "../topics/names";
import { sensitiveItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";

export interface ListedThread {
  id: string;
  title: string;
  title_ar: string;
}

/** One Item in the Saved list or in search results. */
export interface ListedItem {
  id: string;
  /** Every Topic the Item carries, in the Edition's order. */
  topics: string[];
  /** The Topic it is shown under: the first one the Reader follows, else its first Catalog Topic. */
  topic: string;
  /** The Story Thread it belongs to, or null. */
  thread: ListedThread | null;
  status: ItemStatus;
  /** When it happened (RFC 3339): the date the list shows. */
  time: string;
  title: string;
  title_ar: string | null;
  summary: string;
  summary_ar: string | null;
  sources: Source[];
  image: string | null;
  warning: string | null;
  warning_ar: string | null;
  /** A sensitive Item: its title and text stay behind its warning until tapped. */
  blurred: boolean;
  /** This Reader's own Like and Save on it. */
  reactions: { like: boolean; save: boolean };
}

export interface ItemList<T extends ListedItem = ListedItem> {
  items: T[];
  /** Display name of every Topic the list mentions, by id. */
  topic_names: Record<string, string>;
  /** The same names in Arabic, from the Catalog; the English name where the Catalog has none. */
  topic_names_ar: Record<string, string>;
}

/**
 * SQL that is true when the Item whose id is `itemId` (an SQL expression such
 * as `i.id`) may be listed to a Reader. Takes one `?` parameter, the Reader's id.
 */
export function listableItemSql(itemId: string): string {
  return `EXISTS (SELECT 1 FROM item_topics ct JOIN topics ctt ON ctt.id = ct.topic_id WHERE ct.item_id = ${itemId})
      AND ${sensitiveItemVisibleSql(itemId)}`;
}

/** The columns `toListedItems` reads, for Items aliased `i`. Takes one `?` parameter, the Reader's id. */
export const LISTED_ITEM_COLUMNS = `
  i.id, i.status, i.time, i.title, i.title_ar, i.summary, i.summary_ar, i.sources, i.image,
  i.warning, i.warning_ar,
  (SELECT json_group_array(topic_id)
     FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = i.id ORDER BY t.position)) AS topics,
  (SELECT json_group_array(topic_id)
     FROM (SELECT t.topic_id FROM item_topics t JOIN topics c ON c.id = t.topic_id
            WHERE t.item_id = i.id ORDER BY t.position)) AS catalog_topics,
  th.id AS thread_id, th.title AS thread_title, th.title_ar AS thread_title_ar,
  ${sensitiveItemSql("i.id")} AS blurred,
  EXISTS (SELECT 1 FROM reactions r WHERE r.reader_id = ? AND r.item_id = i.id AND r.kind = 'like') AS liked`;

/** The join `LISTED_ITEM_COLUMNS` needs, after `FROM items i`. */
export const LISTED_ITEM_JOINS = "LEFT JOIN threads th ON th.id = i.thread_id";

export interface ListedRow {
  id: string;
  status: ItemStatus;
  time: string;
  title: string;
  title_ar: string | null;
  summary: string;
  summary_ar: string | null;
  sources: string;
  image: string | null;
  warning: string | null;
  warning_ar: string | null;
  topics: string;
  catalog_topics: string;
  thread_id: string | null;
  thread_title: string | null;
  thread_title_ar: string | null;
  blurred: number;
  liked: number;
}

/**
 * Rows selected with `LISTED_ITEM_COLUMNS` as the Reader sees them, keeping
 * their order. `saved` says which of them this Reader has saved.
 */
export function toListedItems<R extends ListedRow>(
  ctx: AppContext,
  readerId: number,
  rows: R[],
  saved: (row: R) => boolean,
): ListedItem[] {
  const followed = new Set(followedTopicIds(ctx, readerId));
  return rows.map((r) => {
    const topics = JSON.parse(r.topics) as string[];
    const catalog = JSON.parse(r.catalog_topics) as string[];
    return {
      id: r.id,
      topics,
      topic: catalog.find((t) => followed.has(t)) ?? catalog[0] ?? topics[0]!,
      thread: r.thread_id ? { id: r.thread_id, title: r.thread_title!, title_ar: r.thread_title_ar! } : null,
      status: r.status,
      time: r.time,
      title: r.title,
      title_ar: r.title_ar,
      summary: r.summary,
      summary_ar: r.summary_ar,
      sources: JSON.parse(r.sources) as Source[],
      image: r.image,
      warning: r.warning,
      warning_ar: r.warning_ar,
      blurred: r.blurred === 1,
      reactions: { like: r.liked === 1, save: saved(r) },
    };
  });
}

/** The Topic names (English and Arabic) a list of Items mentions. */
export function topicNamesOf(ctx: AppContext, items: ListedItem[]): Pick<ItemList, "topic_names" | "topic_names_ar"> {
  const topic_names = Object.fromEntries(items.flatMap((i) => i.topics).map((id) => [id, topicName(id)]));
  const arabicName = ctx.db.prepare("SELECT name_ar FROM topics WHERE id = ?").pluck();
  const topic_names_ar = Object.fromEntries(
    Object.entries(topic_names).map(([id, name]) => [id, (arabicName.get(id) as string | undefined) || name]),
  );
  return { topic_names, topic_names_ar };
}
