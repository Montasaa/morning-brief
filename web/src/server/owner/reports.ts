// "Bad source" reports for the Owner (ticket 10). A Reader's hide with the
// reason `bad_source` is the one Reaction that reaches anyone else: it reports
// the Item to the Owner so the Topic's Gathering Rules can be fixed. Other hide
// reasons stay private.
//
// Reports are read straight from the Readers' current hides, so undoing the
// hide (or changing its reason) withdraws the report. They count Readers and
// never name them.
import type { AppContext } from "../app";
import type { Source } from "../editions/types";
import { topicName } from "../topics/names";

export interface ReportTopic {
  id: string;
  name: string;
  name_ar: string;
}

/** One reported Item, with how many Readers reported it. */
export interface BadSourceReport {
  item: { id: string; title: string; title_ar: string | null; time: string };
  /** The Item's Topics, primary first. */
  topics: ReportTopic[];
  /** The sources the Item cites; a report counts against each of them. */
  sources: Source[];
  /** Readers who hid this Item as a bad source. */
  readers: number;
  /** When the latest of those hides was made (RFC 3339, UTC). */
  last_reported_at: string;
}

/** One source (by its title, as Editions name it) across every reported Item that cites it. */
export interface ReportedSource {
  source: string;
  /** Reported Items citing this source, most reported first. */
  item_ids: string[];
  /** Distinct Readers who reported any of those Items. */
  readers: number;
}

export interface BadSourceReports {
  reports: BadSourceReport[];
  sources: ReportedSource[];
}

interface HideRow {
  item_id: string;
  reader_id: number;
  created_at_ms: number;
}

interface ItemRow {
  id: string;
  title: string;
  title_ar: string | null;
  time: string;
  sources: string;
}

/** Every Item Readers currently hide as a bad source, grouped by Item and by source, most reported first. */
export function badSourceReports(ctx: AppContext): BadSourceReports {
  const { db } = ctx;
  const hides = db
    .prepare(
      `SELECT item_id, reader_id, created_at_ms FROM reactions
        WHERE kind = 'hide' AND reason = 'bad_source'`,
    )
    .all() as HideRow[];

  const byItem = new Map<string, { readers: Set<number>; lastMs: number }>();
  for (const h of hides) {
    const entry = byItem.get(h.item_id) ?? { readers: new Set<number>(), lastMs: 0 };
    entry.readers.add(h.reader_id);
    entry.lastMs = Math.max(entry.lastMs, h.created_at_ms);
    byItem.set(h.item_id, entry);
  }

  const itemRow = db.prepare("SELECT id, title, title_ar, time, sources FROM items WHERE id = ?");
  const itemTopics = db.prepare(
    `SELECT it.topic_id AS id, t.name AS name, t.name_ar AS name_ar
       FROM item_topics it LEFT JOIN topics t ON t.id = it.topic_id
      WHERE it.item_id = ? ORDER BY it.position`,
  );

  const reports: (BadSourceReport & { readerIds: Set<number> })[] = [];
  for (const [itemId, { readers, lastMs }] of byItem) {
    const row = itemRow.get(itemId) as ItemRow | undefined;
    if (!row) continue;
    const topics = (itemTopics.all(itemId) as { id: string; name: string | null; name_ar: string | null }[]).map(
      (t) => ({ id: t.id, name: t.name ?? topicName(t.id), name_ar: t.name_ar ?? t.name ?? topicName(t.id) }),
    );
    reports.push({
      item: { id: row.id, title: row.title, title_ar: row.title_ar, time: row.time },
      topics,
      sources: JSON.parse(row.sources) as Source[],
      readers: readers.size,
      last_reported_at: new Date(lastMs).toISOString(),
      readerIds: readers,
    });
  }
  reports.sort(
    (a, b) =>
      b.readers - a.readers ||
      b.last_reported_at.localeCompare(a.last_reported_at) ||
      a.item.id.localeCompare(b.item.id),
  );

  const bySource = new Map<string, { item_ids: string[]; readers: Set<number> }>();
  for (const report of reports) {
    for (const title of new Set(report.sources.map((s) => s.title.trim()))) {
      const entry = bySource.get(title) ?? { item_ids: [], readers: new Set<number>() };
      entry.item_ids.push(report.item.id);
      for (const r of report.readerIds) entry.readers.add(r);
      bySource.set(title, entry);
    }
  }
  const sources = [...bySource]
    .map(([source, { item_ids, readers }]) => ({ source, item_ids, readers: readers.size }))
    .sort(
      (a, b) => b.readers - a.readers || b.item_ids.length - a.item_ids.length || a.source.localeCompare(b.source),
    );

  return { reports: reports.map(({ readerIds: _, ...report }) => report), sources };
}
