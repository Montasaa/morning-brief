// Brief composer: turns the latest Edition into a Reader's Brief.
//
// Every Item of the latest Edition, in Swipe order: the cover card, then the
// top stories (for now the Edition's fallback `top_stories`), then the rest
// grouped by Topic (for now each Item's first Topic), newest first within a
// group and groups ordered by their newest Item. `groups` drive the progress
// bars. Later tickets add the Reader (followed Topics, Reactions, sensitive
// opt-ins), per-Reader top stories, scoring and Widgets here, keeping this one
// entry point.
import type { AppContext } from "../app";
import type { ItemStatus, Source } from "../editions/types";
import { topicName } from "../topics/names";

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
  /** The Topic this Item is shown under (its group). */
  topic: string;
  /** The Item's other Topics, shown as tags. */
  tags: string[];
  /** A top story: shown first, with the "Top for you" badge. */
  top: boolean;
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
  /** When the next Edition is due (RFC 3339, +03:00): 19:15 after a morning Edition, 06:00 the next day after an evening one. */
  next_edition_at: string | null;
}

interface ItemRow extends Omit<BriefItem, "topics" | "sources" | "extras" | "topic" | "tags" | "top"> {
  topics: string;
  sources: string;
  extras: string;
}

export function composeBrief(ctx: AppContext): Brief {
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
  if (!edition) return { edition: null, cover: null, items: [], groups: [], topic_names: {}, next_edition_at: null };

  const rows = db
    .prepare(
      `SELECT i.id, i.thread_id, i.status, i.time, i.title, i.title_ar, i.summary, i.summary_ar,
              i.sources, i.image, i.warning, i.warning_ar, i.extras,
              (SELECT json_group_array(topic_id)
                 FROM (SELECT topic_id FROM item_topics t WHERE t.item_id = i.id ORDER BY t.position)
              ) AS topics
         FROM edition_items ei
         JOIN items i ON i.id = ei.item_id
        WHERE ei.edition_id = ?
        ORDER BY i.time_ms DESC, ei.position`,
    )
    .all(edition.id) as ItemRow[];

  const newestFirst = rows.map((r): BriefItem => {
    const topics = JSON.parse(r.topics) as string[];
    return {
      ...r,
      topics,
      sources: JSON.parse(r.sources) as Source[],
      extras: JSON.parse(r.extras) as Record<string, unknown>,
      topic: topics[0]!,
      tags: topics.slice(1),
      top: false,
    };
  });

  const topIds = JSON.parse(
    (db.prepare("SELECT top_stories FROM editions WHERE id = ?").pluck().get(edition.id) as string | null) ?? "[]",
  ) as string[];
  const tops = topIds.flatMap((id): BriefItem[] => {
    const item = newestFirst.find((i) => i.id === id);
    return item ? [{ ...item, top: true }] : [];
  });

  // Groups in order of their newest Item; Items newest first within each.
  const byTopic = new Map<string, BriefItem[]>();
  for (const item of newestFirst) {
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

  return {
    edition,
    cover: { date: riyadhDate(edition.generated_at), widgets: [] },
    items,
    groups,
    topic_names,
    next_edition_at: nextEditionAt(edition),
  };
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
