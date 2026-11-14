// Brief composer: turns the latest Edition into a Reader's Brief.
//
// Ticket 01 is the bare version: every Item of the latest Edition, newest
// first. Later tickets add the Reader (followed Topics, Reactions, sensitive
// opt-ins), top stories and the cover card here, keeping this one entry point.
import type { AppContext } from "../app";
import type { ItemStatus, Source } from "../editions/types";

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
}

export interface Brief {
  edition: BriefEdition | null;
  items: BriefItem[];
}

interface ItemRow extends Omit<BriefItem, "topics" | "sources" | "extras"> {
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
  if (!edition) return { edition: null, items: [] };

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

  return {
    edition,
    items: rows.map((r) => ({
      ...r,
      topics: JSON.parse(r.topics) as string[],
      sources: JSON.parse(r.sources) as Source[],
      extras: JSON.parse(r.extras) as Record<string, unknown>,
    })),
  };
}
