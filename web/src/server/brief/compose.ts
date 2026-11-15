// Brief composer: turns the latest Edition into a Reader's Brief.
//
// The Items of the latest Edition that carry a Topic the Reader follows (ticket
// 07), in Swipe order: the cover card, then the top stories (for now the
// Edition's fallback `top_stories`), then the rest grouped by Topic, ordered
// by the Scorer (./score.ts) within a group and groups ordered by their best
// Item. Items the Reader hid are left out and opened ones are dimmed (ticket
// 09). The top stories are the ones picked for this Reader after ingest, with
// their why-lines (ticket 13, ./top-picker.ts), as long as they are still in
// the Reader's Brief; with none picked, the Edition's own `top_stories`. Each Item appears once, under its best-matching followed Topic (for now
// the first of its Topics, in the Edition's order, that the Reader follows),
// with the Reader's other followed Topics as tags. `groups` drive the progress
// bars. Sensitive Items reach only Readers who opted into their Sensitive
// Topics, and are marked blurred (ticket 08) unless the Reader turned the blur
// off for all of them (rework ticket 10). A sensitive Item is never a top story
// and never the first Item after the Cover (see `placeSensitiveGroups`). Later
// tickets add Widgets here, keeping this one entry point.
import type { AppContext } from "../app";
import { imageKindOf, type ImageKind, type ItemStatus, type Source } from "../editions/types";
import { readerReactions, toItemReactions, type Reaction } from "../reactions";
import { threadSummaries, type ThreadSummary } from "../threads/threads";
import { followedTopicIds, hiddenTopicIds } from "../topics/catalog";
import { blurredItemSql, sensitiveItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";
import { topicName } from "../topics/names";
import { scoreItems, type ScoredReaction } from "./score";
import { scoredTopStories, storedTopStories } from "./top-stories";

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
  /** How the picture is shown (rework ticket 10): the Edition's `image_kind`, else photo with an image, else none. */
  image_kind: ImageKind;
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
  /** On a top story Claude picked (ticket 13): "why this matters to you". Null otherwise. */
  why_for_you: string | null;
  why_for_you_ar: string | null;
  /** It carries a Sensitive Topic: never a top story, never first, never in a push (rework ticket 10). */
  sensitive: boolean;
  /**
   * Blurred with its warning until tapped, every time: a sensitive Item, unless the Reader turned the blur
   * off (Display `unblurred`) for every Sensitive Topic it carries.
   */
  blurred: boolean;
  /** Its picture stays blurred until tapped whatever the blur switch says: the Edition marked it NSFW media. */
  media_blurred: boolean;
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
  /** The Story Threads of the Brief's Items, by id, for the Thread chip (ticket 14). */
  threads: Record<string, ThreadSummary>;
  /**
   * Nothing but sensitive Items (rework ticket 10): the Reader follows only Sensitive Topics, or
   * nothing else made it into this Edition. The Brief opens on the Cover and a nothing-to-show note,
   * and the sensitive Items come after it.
   */
  nothing_to_show: boolean;
}

interface ItemRow
  extends Omit<
    BriefItem,
    | "topics" | "sources" | "extras" | "topic" | "tags" | "top" | "why_for_you" | "why_for_you_ar"
    | "image_kind" | "sensitive" | "blurred" | "media_blurred" | "reactions" | "dimmed"
  > {
  topics: string;
  sources: string;
  extras: string;
  image_kind: ImageKind | null;
  sensitive: number;
  blurred: number;
  nsfw_media: number;
  time_ms: number;
}

/** A Reader's Brief before the top stories are taken out (ticket 13: the top picker chooses from it). */
export interface RankedBrief {
  edition: BriefEdition;
  /** The latest Edition's Items the Reader follows, may see and has not hidden: highest score first, ties newest first. */
  ranked: BriefItem[];
  /** The Edition's own `top_stories`, the fallback tops. */
  editionTopIds: string[];
}

/** The ranked Items of the Reader with id `reader.id`; null before the first Edition. */
export function rankBrief(ctx: AppContext, reader: { id: number }): RankedBrief | null {
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
  if (!edition) return null;

  const rows = db
    .prepare(
      `SELECT i.id, i.thread_id, i.status, i.time, i.time_ms, i.title, i.title_ar, i.summary, i.summary_ar,
              i.sources, i.image, i.image_kind, i.nsfw_media, i.warning, i.warning_ar, i.extras,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = i.id ORDER BY t.position)
              ) AS topics,
              ${sensitiveItemSql("i.id")} AS sensitive,
              ${blurredItemSql("i.id")} AS blurred
         FROM edition_items ei
         JOIN items i ON i.id = ei.item_id
        WHERE ei.edition_id = ? AND ${sensitiveItemVisibleSql("i.id")}
        ORDER BY i.time_ms DESC, ei.position`,
    )
    .all(reader.id, edition.id, reader.id) as ItemRow[];

  const followed = new Set(followedTopicIds(ctx, reader.id));
  const hidden = hiddenTopicIds(ctx, reader.id); // other Readers' private Topics (ticket 11)
  // Only this Reader's own Reactions: never another Reader's (ticket 09).
  const reactions = readerReactions(ctx, reader.id);
  const reactionsTo = (id: string) => toItemReactions(reactions.filter((r) => r.item_id === id));
  const timeMs = new Map(rows.map((r) => [r.id, r.time_ms]));
  const newestFirst = rows.flatMap(({ time_ms: _, nsfw_media, ...r }): BriefItem[] => {
    const topics = (JSON.parse(r.topics) as string[]).filter((t) => !hidden.has(t));
    const mine = topics.filter((t) => followed.has(t));
    if (mine.length === 0) return [];
    const mark = reactionsTo(r.id);
    if (mark.hide) return []; // hidden from this Reader's Brief only
    return [
      {
        ...r,
        topics,
        sources: JSON.parse(r.sources) as Source[],
        image_kind: imageKindOf(r),
        extras: JSON.parse(r.extras) as Record<string, unknown>,
        topic: mine[0]!,
        tags: mine.slice(1),
        top: false,
        why_for_you: null,
        why_for_you_ar: null,
        sensitive: r.sensitive === 1,
        blurred: r.blurred === 1,
        media_blurred: nsfw_media === 1,
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

  const editionTopIds = JSON.parse(
    (db.prepare("SELECT top_stories FROM editions WHERE id = ?").pluck().get(edition.id) as string | null) ?? "[]",
  ) as string[];
  return { edition, ranked, editionTopIds };
}

/** The Brief of the Reader with id `reader.id`: only the Topics they follow. */
export function composeBrief(ctx: AppContext, reader: { id: number }): Brief {
  const { db } = ctx;
  const rankedBrief = rankBrief(ctx, reader);
  if (!rankedBrief) {
    return { edition: null, cover: null, items: [], groups: [], topic_names: {}, topic_names_ar: {}, next_edition_at: null, threads: {}, nothing_to_show: false };
  }
  const { edition, ranked, editionTopIds } = rankedBrief;

  // Top stories (ticket 13): the ones Claude picked for this Reader after ingest that are still in their
  // Brief (not hidden, still followed), with their why-lines. When Claude failed, the Scorer's best Items
  // as they are now. When nothing was picked for this Reader, the Edition's own top stories.
  // Never a sensitive Item, whoever picked it (rework ticket 10).
  const inBrief = new Map(ranked.filter((i) => !i.sensitive).map((i) => [i.id, i]));
  const top = (id: string, why: string | null = null, why_ar: string | null = null): BriefItem[] => {
    const item = inBrief.get(id);
    return item ? [{ ...item, top: true, why_for_you: why, why_for_you_ar: why_ar }] : [];
  };
  const picked = storedTopStories(ctx, reader.id, edition.id);
  let tops =
    picked?.picked_by === "claude"
      ? picked.stories.flatMap((s) => top(s.item_id, s.why, s.why_ar))
      : picked
        ? scoredTopStories([...inBrief.keys()], editionTopIds).flatMap((id) => top(id))
        : [];
  if (tops.length === 0) tops = editionTopIds.flatMap((id) => top(id));

  // Groups in order of their best-scored Item; Items by score within each.
  const byTopic = new Map<string, BriefItem[]>();
  for (const item of ranked) {
    if (tops.some((t) => t.id === item.id)) continue;
    const group = byTopic.get(item.topic) ?? [];
    group.push(item);
    byTopic.set(item.topic, group);
  }

  const topicGroups = placeSensitiveGroups([...byTopic.values()]);
  const groups: BriefGroup[] = [];
  if (tops.length) groups.push({ kind: "top", topic: null, item_ids: tops.map((i) => i.id) });
  for (const items of topicGroups) groups.push({ kind: "topic", topic: items[0]!.topic, item_ids: items.map((i) => i.id) });

  const items = [...tops, ...topicGroups.flat()];
  const catalogName = db.prepare("SELECT name FROM topics WHERE id = ?").pluck();
  const topic_names = Object.fromEntries(
    items.flatMap((i) => i.topics).map((id) => [id, (catalogName.get(id) as string | undefined) || topicName(id)]),
  );
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
    threads: threadSummaries(ctx, reader.id, items.flatMap((i) => (i.thread_id ? [i.thread_id] : []))),
    nothing_to_show: items.length > 0 && items[0]!.sensitive,
  };
}

/**
 * Sensitive Items never open the Brief (rework ticket 10): a group led by a
 * sensitive Item (every group of a Sensitive Topic, and any group whose best
 * Item is sensitive) moves after the first group led by one that is not.
 * Groups keep their order otherwise, and Items their order inside a group.
 * When no group is led by a non-sensitive Item, nothing moves: the Brief
 * opens on its nothing-to-show note (`nothing_to_show`).
 */
function placeSensitiveGroups(groups: BriefItem[][]): BriefItem[][] {
  const first = groups.findIndex((g) => !g[0]!.sensitive);
  if (first <= 0) return groups;
  return [groups[first]!, ...groups.slice(0, first), ...groups.slice(first + 1)];
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
