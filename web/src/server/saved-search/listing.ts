// Saved & Search (ticket 15): how both lists show an Item to one Reader.
//
// Unlike the Brief, these lists reach back across every Edition ever posted
// (Editions, Items and Story Threads are never pruned), so each Item is the
// stored version from the newest Edition that carried it. Every Item listed
// follows the same rules as the Brief:
//
// - Sensitive: it reaches the Reader only if they opted into every Sensitive
//   Topic it carries, and is then marked `blurred` (ticket 08) unless they turned
//   the blur off for every one of them (rework ticket 10). Explicit media (`nsfw_media`) is
//   `media_blurred` whatever the switch says.
// - Topics: it carries at least one Topic in the Catalog as this Reader sees it
//   (ticket 11: another Reader's private Topic does not count, and is stripped
//   from the Item's `topics`), so an Item they could never follow is never
//   listed. Both rules are `itemVisibleSql` (../topics/visibility.ts), the one
//   place for them.
// - Reactions are only ever this Reader's own (ticket 09).
import type { AppContext } from "../app";
import { imageKindOf, type ImageKind, type ItemStatus, type Source } from "../editions/types";
import { followedTopicIds, hiddenTopicIds } from "../topics/catalog";
import { topicName } from "../topics/names";
import { blurredItemSql } from "../topics/sensitive";

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
  /** How the picture is shown (rework ticket 10): photo, card or none. */
  image_kind: ImageKind;
  warning: string | null;
  warning_ar: string | null;
  /** A sensitive Item the Reader has not turned the blur off for: its title and text stay behind its warning until tapped. */
  blurred: boolean;
  /** Explicit media (`nsfw_media`): its picture stays blurred until tapped, whatever the blur switch says. */
  media_blurred: boolean;
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

/** The columns `toListedItems` reads, for Items aliased `i`. Takes two `?` parameters, both the Reader's id. */
export const LISTED_ITEM_COLUMNS = `
  i.id, i.status, i.time, i.title, i.title_ar, i.summary, i.summary_ar, i.sources, i.image,
  i.image_kind, i.nsfw_media, i.warning, i.warning_ar,
  (SELECT json_group_array(topic_id)
     FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = i.id ORDER BY t.position)) AS topics,
  (SELECT json_group_array(topic_id)
     FROM (SELECT t.topic_id FROM item_topics t JOIN topics c ON c.id = t.topic_id
            WHERE t.item_id = i.id ORDER BY t.position)) AS catalog_topics,
  th.id AS thread_id, th.title AS thread_title, th.title_ar AS thread_title_ar,
  ${blurredItemSql("i.id")} AS blurred,
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
  image_kind: ImageKind | null;
  nsfw_media: number;
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
  const hidden = hiddenTopicIds(ctx, readerId); // other Readers' private Topics (ticket 11)
  return rows.map((r) => {
    const topics = (JSON.parse(r.topics) as string[]).filter((t) => !hidden.has(t));
    const catalog = (JSON.parse(r.catalog_topics) as string[]).filter((t) => !hidden.has(t));
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
      image_kind: imageKindOf(r),
      warning: r.warning,
      warning_ar: r.warning_ar,
      blurred: r.blurred === 1,
      media_blurred: r.nsfw_media === 1,
      reactions: { like: r.liked === 1, save: saved(r) },
    };
  });
}

/** The Topic names (English and Arabic) a list of Items mentions. */
export function topicNamesOf(ctx: AppContext, items: { topics: string[] }[]): Pick<ItemList, "topic_names" | "topic_names_ar"> {
  const catalogName = ctx.db.prepare("SELECT name FROM topics WHERE id = ?").pluck();
  const topic_names = Object.fromEntries(
    items.flatMap((i) => i.topics).map((id) => [id, (catalogName.get(id) as string | undefined) || topicName(id)]),
  );
  const arabicName = ctx.db.prepare("SELECT name_ar FROM topics WHERE id = ?").pluck();
  const topic_names_ar = Object.fromEntries(
    Object.entries(topic_names).map(([id, name]) => [id, (arabicName.get(id) as string | undefined) || name]),
  );
  return { topic_names, topic_names_ar };
}
