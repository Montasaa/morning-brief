// Brief composer: turns the latest Edition into a Reader's Brief.
//
// The Items of the latest Edition that carry a Topic the Reader follows (ticket
// 07), in Swipe order: the cover card, then the top stories (for now the
// Edition's fallback `top_stories`), then the rest grouped by Topic, ordered
// by the Scorer (./score.ts) within a group and groups ordered by their best
// Item. Items the Reader hid are left out and opened ones are dimmed (ticket
// 09). Each Item appears once, under its best-matching followed Topic (for now
// the first of its Topics, in the Edition's order, that the Reader follows),
// with the Reader's other followed Topics as tags. `groups` drive the progress
// bars. Sensitive Items reach only Readers who opted into their Sensitive
// Topics, and are marked blurred (ticket 08). Later tickets add per-Reader top
// stories and Widgets here, keeping this one entry point.
import type { AppContext } from "../app";
import type { ItemStatus, Source } from "../editions/types";
import { readerReactions, toItemReactions, type Reaction } from "../reactions";
import { followedTopicIds } from "../topics/catalog";
import { sensitiveItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";
import { topicName } from "../topics/names";
import { scoreItems, type ScoredReaction } from "./score";

export interface BriefEdition {
  id: string;
  kind: "morning" | "evening";
  generated_at: string;
  item_count: number;
}

export interface BriefItem {
  id: string;
  topics: string[];
  thread_id: string | null;
  status: ItemStatus;
  time: string;
  title: string;
  title_ar: string | null;
  summary: string;
  summary_ar: string | null;
  sources: Source[];
  image: string | null;
  warning: string | null;
  warning_ar: string | null;
  /** Kind-specific extras (try_url, genres, stars_gained, reliability, tag, voices, ...). */
  extras: Record<string, unknown>;
  /** The followed Topic this Item is shown under (its group): the best match. */
  topic: string;
  /** The Item's other Topics that the Reader follows, shown as tags. */
  tags: string[];
  /** A top story: shown first, with the "Top for you" badge. */
  top: boolean;
  /** A sensitive Item (it carries a Sensitive Topic the Reader opted into): blurred with its warning until tapped, every time. */
  blurred: boolean;
  /** This Reader's Like and Save on the Item (ticket 09), for the dock. */
  reactions: { like: boolean; save: boolean };
  /** The Reader has opened this Item before: shown dimmed. */
  dimmed: boolean;
}

/** One progress bar: the top stories, or the Items shown under one Topic, in Brief order. */
export interface BriefGroup {
  kind: "top" | "topic";
  topic: string | null;
  item_ids: string[];
}

/** A Widget on the cover card. Ticket 17 fills these in; until then the slots are empty. */
export interface BriefWidget {
  kind: string;
  [field: string]: unknown;
}

export interface BriefCover {
  /** The Edition's date in Asia/Riyadh, YYYY-MM-DD. */
  date: string;
  widgets: BriefWidget[];
}

export interface Brief {
  edition: BriefEdition | null;
  cover: BriefCover | null;
  /** Items in the order the Reader swipes through them. */
  items: BriefItem[];
  groups: BriefGroup[];
  /** Display name of every Topic the Brief mentions, by id. */
  topic_names: Record<string, string>;
  /** The same names in Arabic, from the Catalog; the English name where the Catalog has none. */
  topic_names_ar: Record<string, string>;
  /** When the next Edition is due (RFC 3339, +03:00): 19:15 after a morning Edition, 06:00 the next day after an evening one. */
  next_edition_at: string | null;
}

interface ItemRow
  extends Omit<BriefItem, "topics" | "sources" | "extras" | "topic" | "tags" | "top" | "blurred" | "reactions" | "dimmed"> {
  topics: string;
  sources: string;
  extras: string;
  blurred: number;
  time_ms: number;
}

/** The Brief of the Reader with id `reader.id`: only the Topics they follow. */
export function composeBrief(ctx: AppContext, reader: { id: number }): Brief {
  const { db } = ctx;
  const edition = db
    .prepare(
      `SELECT e.id, e.kind, e.generated_at,
              (SELECT COUNT(*) FROM edition_items ei WHERE ei.edition_id = e.id) AS item_count
         FROM editions e
        ORDER BY e.generated_at_ms DESC, e.received_at DESC
        LIMIT 1`,
    )
    .get() as BriefEdition | undefined;
  if (!edition) return { edition: null, cover: null, items: [], groups: [], topic_names: {}, topic_names_ar: {}, next_edition_at: null };

  const rows = db
    .prepare(
      `SELECT i.id, i.thread_id, i.status, i.time, i.time_ms, i.title, i.title_ar, i.summary, i.summary_ar,
              i.sources, i.image, i.warning, i.warning_ar, i.extras,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = i.id ORDER BY t.position)
              ) AS topics,
              ${sensitiveItemSql("i.id")} AS blurred
         FROM edition_items ei
         JOIN items i ON i.id = ei.item_id
        WHERE ei.edition_id = ? AND ${sensitiveItemVisibleSql("i.id")}
        ORDER BY i.time_ms DESC, ei.position`,
    )
    .all(edition.id, reader.id) as ItemRow[];

  const followed = new Set(followedTopicIds(ctx, reader.id));
  // Only this Reader's own Reactions: never another Reader's (ticket 09).
  const reactions = readerReactions(ctx, reader.id);
  const reactionsTo = (id: string) => toItemReactions(reactions.filter((r) => r.item_id === id));
  const timeMs = new Map(rows.map((r) => [r.id, r.time_ms]));
  const newestFirst = rows.flatMap(({ time_ms: _, ...r }): BriefItem[] => {
    const topics = JSON.parse(r.topics) as string[];
    const mine = topics.filter((t) => followed.has(t));
    if (mine.length === 0) return [];
    const mark = reactionsTo(r.id);
    if (mark.hide) return []; // hidden from this Reader's Brief only
    return [
      {
        ...r,
        topics,
        sources: JSON.parse(r.sources) as Source[],
        extras: JSON.parse(r.extras) as Record<string, unknown>,
        topic: mine[0]!,
        tags: mine.slice(1),
        top: false,
        blurred: r.blurred === 1,
        reactions: { like: mark.like, save: mark.save },
        dimmed: mark.open,
      },
    ];
  });

  // Ranked by the Scorer; the sort is stable, so ties stay newest first.
  const scores = scoreItems(
    newestFirst.map((i) => ({ ...i, time_ms: timeMs.get(i.id)! })),
    { followed, reactions: reactionSubjects(ctx, reactions), asOfMs: Date.parse(edition.generated_at) },
  );
  const ranked = [...newestFirst].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);

  const topIds = JSON.parse(
    (db.prepare("SELECT top_stories FROM editions WHERE id = ?").pluck().get(edition.id) as string | null) ?? "[]",
  ) as string[];
  const tops = topIds.flatMap((id): BriefItem[] => {
    const item = ranked.find((i) => i.id === id);
    return item ? [{ ...item, top: true }] : [];
  });

  // Groups in order of their best-scored Item; Items by score within each.
  const byTopic = new Map<string, BriefItem[]>();
  for (const item of ranked) {
    if (tops.some((t) => t.id === item.id)) continue;
    const group = byTopic.get(item.topic) ?? [];
    group.push(item);
    byTopic.set(item.topic, group);
  }

  const groups: BriefGroup[] = [];
  if (tops.length) groups.push({ kind: "top", topic: null, item_ids: tops.map((i) => i.id) });
  for (const [topic, items] of byTopic) groups.push({ kind: "topic", topic, item_ids: items.map((i) => i.id) });

  const items = [...tops, ...[...byTopic.values()].flat()];
  const topic_names = Object.fromEntries(items.flatMap((i) => i.topics).map((id) => [id, topicName(id)]));
  const arabicName = db.prepare("SELECT name_ar FROM topics WHERE id = ?").pluck();
  const topic_names_ar = Object.fromEntries(
    Object.entries(topic_names).map(([id, name]) => [id, (arabicName.get(id) as string | undefined) || name]),
  );

  return {
    edition,
    cover: { date: riyadhDate(edition.generated_at), widgets: [] },
    items,
    groups,
    topic_names,
    topic_names_ar,
    next_edition_at: nextEditionAt(edition),
  };
}

/** The Topics and Story Thread of each Item the Reader reacted to, for the Scorer. */
function reactionSubjects(ctx: AppContext, reactions: Reaction[]): ScoredReaction[] {
  const subject = ctx.db.prepare(
    `SELECT i.thread_id,
            (SELECT json_group_array(topic_id) FROM item_topics t WHERE t.item_id = i.id) AS topics
       FROM items i WHERE i.id = ?`,
  );
  return reactions.flatMap((r) => {
    const row = subject.get(r.item_id) as { thread_id: string | null; topics: string } | undefined;
    return row ? [{ kind: r.kind, reason: r.reason, thread_id: row.thread_id, topics: JSON.parse(row.topics) as string[] }] : [];
  });
}

const RIYADH_OFFSET_MS = 3 * 3_600_000;

/** The YYYY-MM-DD date of an instant in Asia/Riyadh (UTC+3 all year). */
function riyadhDate(at: string | number): string {
  return new Date(new Date(at).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** Gathering runs at 06:00 and 19:15 Asia/Riyadh. */
function nextEditionAt(edition: BriefEdition): string {
  const date = riyadhDate(edition.generated_at);
  if (edition.kind === "morning") return `${date}T19:15:00+03:00`;
  const nextDay = riyadhDate(Date.parse(`${date}T12:00:00+03:00`) + 86_400_000);
  return `${nextDay}T06:00:00+03:00`;
}
