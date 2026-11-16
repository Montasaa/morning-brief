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
// with the Reader's other followed Topics as tags. Sensitive Items reach only
// Readers who opted into their Sensitive Topics, and are marked blurred
// (ticket 08) unless the Reader turned the blur off for all of them (rework
// ticket 10). A sensitive Item is never a top story and never the first Item
// after the Cover.
//
// `groups` (rework ticket 11) are arranged by the Reader's Display
// (./arrange.ts): the top stories, then Pinned Topics, then `topic_order`,
// then the rest by `rank`. A followed Topic with nothing in the Brief is still
// a group, `nothing_qualified`. Display never changes the ranking: the top
// stories and the Items inside each group are the same whatever it says.
// Widgets are added by `withWidgets` (src/server/widgets), keeping this one
// entry point.
import type { AppContext } from "../app";
import { getDisplay } from "../display/display";
import { imageKindOf, type ImageKind, type ItemStatus, type Source } from "../editions/types";
import { readerReactions, toItemReactions, type Reaction } from "../reactions";
import { threadSummaries, type ThreadSummary } from "../threads/threads";
import { followedTopicIds, hiddenTopicIds } from "../topics/catalog";
import { blurredItemSql, isSensitiveTopic, sensitiveItemSql, sensitiveItemVisibleSql } from "../topics/sensitive";
import { topicName } from "../topics/names";
import { arrangeBrief } from "./arrange";
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
  /** Its picture stays blurred until tapped whatever the blur switch says: the Edition marked it explicit media (`nsfw_media`). */
  media_blurred: boolean;
  /** This Reader's Like and Save on the Item (ticket 09), for the dock. */
  reactions: { like: boolean; save: boolean };
  /** The Reader has opened this Item before: shown dimmed. */
  dimmed: boolean;
}

/** The top stories, or the Items shown under one followed Topic, in Display order (rework ticket 11). */
export interface BriefGroup {
  kind: "top" | "topic";
  /** The Topic; null for the top stories. */
  topic: string | null;
  /** A Pinned Topic (Display `pinned`): first after the top stories, with a pin mark. */
  pinned: boolean;
  /** A Collapsed Topic (Display `collapsed`): shown as its headlines only. Its Items are still listed. */
  collapsed: boolean;
  /** The group's Items, by score. Display never changes them or their order. */
  item_ids: string[];
  /** A followed Topic that no Item in this Brief carries: an empty group, shown as a "nothing qualified" note. */
  nothing_qualified: boolean;
  /** The Edition's own note on why nothing qualified, when it carries one (Edition v3 carries none yet: null). */
  note: string | null;
  /** The Topic is a Sensitive Topic: Edit mode shows its blur switch. */
  sensitive: boolean;
  /**
   * Its ranked place, which Display never changes: 0 for the top stories, then the Topic groups by their
   * best Item, then the nothing-qualified ones in Catalog order. Arranging puts unlisted Topics in this order.
   */
  rank: number;
}

/** A Widget on the cover card. Ticket 17 fills these in; until then the slots are empty. */
export interface BriefWidget {
  kind: string;
  [field: string]: unknown;
}

export interface BriefCover {
  /** The Edition's date in Asia/Riyadh, YYYY-MM-DD. */
  date: string;
  /** The Widgets the Reader is eligible for, in their Display `widgets` order (rework ticket 11). */
  widgets: BriefWidget[];
  /** Widgets the Reader is eligible for but removed from their Cover: Edit mode offers to add them back. */
  more_widgets: BriefWidget[];
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
    return {
      edition: null,
      cover: null,
      items: [],
      groups: [],
      topic_names: {},
      topic_names_ar: {},
      next_edition_at: null,
      threads: {},
      nothing_to_show: false,
    };
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
  const groupOf = (items: BriefItem[]) => {
    const byTopic = new Map<string, BriefItem[]>();
    for (const item of items) {
      if (tops.some((t) => t.id === item.id)) continue;
      byTopic.set(item.topic, [...(byTopic.get(item.topic) ?? []), item]);
    }
    return [...byTopic.values()];
  };
  let topicItems = groupOf(ranked);
  // A Sensitive Item never opens the Brief. With no top stories, arranging moves a group led by a
  // non-Sensitive Item to the front; when every group is led by a Sensitive Item, the best non-Sensitive
  // Item leads instead, as the top story. Neither depends on the Display.
  if (tops.length === 0 && topicItems.every((g) => g[0]!.sensitive)) {
    const lead = ranked.find((i) => !i.sensitive);
    if (lead) {
      tops = top(lead.id);
      topicItems = groupOf(ranked);
    }
  }

  const carried = new Set(ranked.flatMap((i) => i.topics));
  const groups: BriefGroup[] = [];
  if (tops.length) groups.push(newGroup(ctx, null, tops, 0));
  // Ranks: 0 for the top stories, then 1, 2, ... for the Topic groups.
  const nextRank = () => groups.filter((g) => g.kind === "topic").length + 1;
  for (const items of topicItems) groups.push(newGroup(ctx, items[0]!.topic, items, nextRank()));
  for (const topic of visibleFollowedTopics(ctx, reader.id)) {
    if (!carried.has(topic)) groups.push(newGroup(ctx, topic, [], nextRank(), { nothingQualified: true }));
  }

  const items = [...tops, ...topicItems.flat()];
  const catalogName = db.prepare("SELECT name FROM topics WHERE id = ?").pluck();
  const named = [...items.flatMap((i) => i.topics), ...groups.flatMap((g) => (g.topic ? [g.topic] : []))];
  const topic_names = Object.fromEntries(
    named.map((id) => [id, (catalogName.get(id) as string | undefined) || topicName(id)]),
  );
  const arabicName = db.prepare("SELECT name_ar FROM topics WHERE id = ?").pluck();
  const topic_names_ar = Object.fromEntries(
    Object.entries(topic_names).map(([id, name]) => [id, (arabicName.get(id) as string | undefined) || name]),
  );

  const brief = arrangeBrief(
    {
      edition,
      cover: { date: riyadhDate(edition.generated_at), widgets: [], more_widgets: [] },
      items,
      groups,
      topic_names,
      topic_names_ar,
      next_edition_at: nextEditionAt(edition),
      threads: threadSummaries(ctx, reader.id, items.flatMap((i) => (i.thread_id ? [i.thread_id] : []))),
      nothing_to_show: false,
    },
    getDisplay(ctx, reader.id),
  );
  // Only when the Brief holds nothing but Sensitive Items: it opens on the Cover and this note.
  return { ...brief, nothing_to_show: brief.items[0]?.sensitive === true };
}

/** A group before arranging: the top stories (`topic` null) or a Topic's Items, at ranked place `rank`. */
function newGroup(
  ctx: AppContext,
  topic: string | null,
  items: BriefItem[],
  rank: number,
  { nothingQualified = false } = {},
): BriefGroup {
  return {
    kind: topic === null ? "top" : "topic",
    topic,
    pinned: false,
    collapsed: false,
    item_ids: items.map((i) => i.id),
    nothing_qualified: nothingQualified,
    note: null,
    sensitive: topic !== null && isSensitiveTopic(ctx, topic),
    rank,
  };
}

/** The Topics the Reader follows and may see, in Catalog order. */
function visibleFollowedTopics(ctx: AppContext, readerId: number): string[] {
  const hidden = hiddenTopicIds(ctx, readerId);
  return followedTopicIds(ctx, readerId).filter((t) => !hidden.has(t));
}

/**
 * Every followed Topic as a group, for Me › Display's arranging controls: the Brief's groups (top stories
 * included, arranged by the stored Display), then a group for each followed Topic that has none in the Brief
 * (its Items are all top stories or filed under another Topic, or there is no Edition yet), so it can still be
 * pinned, ordered and collapsed. `sensitive_item_ids` lets the browser keep a Sensitive Item off the top.
 */
export function arrangeableGroups(ctx: AppContext, reader: { id: number }): { groups: BriefGroup[]; sensitive_item_ids: string[] } {
  const brief = composeBrief(ctx, reader);
  const grouped = new Set(brief.groups.map((g) => g.topic));
  const extra = visibleFollowedTopics(ctx, reader.id).filter((t) => !grouped.has(t));
  const last = brief.groups.reduce((max, g) => Math.max(max, g.rank), 0);
  return {
    groups: [...brief.groups, ...extra.map((topic, i) => newGroup(ctx, topic, [], last + i + 1))],
    sensitive_item_ids: brief.items.filter((i) => i.sensitive).map((i) => i.id),
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
