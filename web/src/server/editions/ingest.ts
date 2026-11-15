// Edition ingest: validate one Edition v3 document, then store it in a single
// transaction. All-or-nothing, and idempotent for a repeated edition_id.
//
// Items are upserted by stable id. The stored version of an Item is the one
// from the newest Edition (by generated_at) that carried it, so a later
// Edition replaces an Item while an older Edition posted late cannot.
import type { AppContext } from "../app";
import { CORE_ITEM_FIELDS, IGNORED_ITEM_FIELDS, type EditionDocument, type EditionItem } from "./types";
import { validateEdition } from "./validate";

export interface IngestCounts {
  items: number;
  threads: number;
  topics: number;
}

export type IngestResult =
  | { accepted: true; edition_id: string; counts: IngestCounts }
  | { accepted: false; reasons: string[] };

export function ingestEdition(ctx: AppContext, doc: unknown): IngestResult {
  const validation = validateEdition(doc);
  if (!validation.ok) return { accepted: false, reasons: validation.reasons };
  const edition = validation.edition;
  store(ctx, edition);
  return {
    accepted: true,
    edition_id: edition.edition_id,
    counts: {
      items: edition.items.length,
      threads: edition.threads.length,
      topics: new Set(edition.items.flatMap((i) => i.topics)).size,
    },
  };
}

function store(ctx: AppContext, edition: EditionDocument): void {
  const { db } = ctx;
  const generatedMs = Date.parse(edition.generated_at);

  const newestOther = db
    .prepare("SELECT MAX(generated_at_ms) FROM editions WHERE id <> ?")
    .pluck()
    .get(edition.edition_id) as number | null;
  const isNewest = newestOther === null || generatedMs >= newestOther;

  const upsertEdition = db.prepare(`
    INSERT INTO editions (id, kind, generated_at, generated_at_ms, widgets, top_stories)
    VALUES (@id, @kind, @generated_at, @generated_at_ms, @widgets, @top_stories)
    ON CONFLICT (id) DO UPDATE SET
      kind = excluded.kind, generated_at = excluded.generated_at,
      generated_at_ms = excluded.generated_at_ms, widgets = excluded.widgets,
      top_stories = excluded.top_stories`);
  const insertThread = db.prepare(
    "INSERT INTO threads (id, title, title_ar) VALUES (@id, @title, @title_ar) ON CONFLICT (id) DO NOTHING",
  );
  const updateThread = db.prepare("UPDATE threads SET title = @title, title_ar = @title_ar WHERE id = @id");
  const itemVersionMs = db.prepare(`
    SELECT e.generated_at_ms FROM items i JOIN editions e ON e.id = i.edition_id WHERE i.id = ?`).pluck();
  const upsertItem = db.prepare(`
    INSERT INTO items (id, edition_id, thread_id, status, time, time_ms, title, title_ar, summary,
                       summary_ar, sources, image, image_kind, nsfw_media, warning, warning_ar, extras)
    VALUES (@id, @edition_id, @thread_id, @status, @time, @time_ms, @title, @title_ar, @summary,
            @summary_ar, @sources, @image, @image_kind, @nsfw_media, @warning, @warning_ar, @extras)
    ON CONFLICT (id) DO UPDATE SET
      edition_id = excluded.edition_id, thread_id = excluded.thread_id, status = excluded.status,
      time = excluded.time, time_ms = excluded.time_ms, title = excluded.title,
      title_ar = excluded.title_ar, summary = excluded.summary, summary_ar = excluded.summary_ar,
      sources = excluded.sources, image = excluded.image, image_kind = excluded.image_kind,
      nsfw_media = excluded.nsfw_media, warning = excluded.warning,
      warning_ar = excluded.warning_ar, extras = excluded.extras`);
  const clearTopics = db.prepare("DELETE FROM item_topics WHERE item_id = ?");
  const insertTopic = db.prepare("INSERT INTO item_topics (item_id, topic_id, position) VALUES (?, ?, ?)");
  const clearEditionItems = db.prepare("DELETE FROM edition_items WHERE edition_id = ?");
  const insertEditionItem = db.prepare(
    "INSERT INTO edition_items (edition_id, item_id, position) VALUES (?, ?, ?)",
  );

  db.transaction(() => {
    upsertEdition.run({
      id: edition.edition_id,
      kind: edition.kind,
      generated_at: edition.generated_at,
      generated_at_ms: generatedMs,
      widgets: JSON.stringify(edition.widgets),
      top_stories: edition.top_stories ? JSON.stringify(edition.top_stories) : null,
    });

    for (const thread of edition.threads) {
      insertThread.run(thread);
      if (isNewest) updateThread.run(thread);
    }

    clearEditionItems.run(edition.edition_id);
    edition.items.forEach((item, position) => {
      const storedMs = itemVersionMs.get(item.id) as number | undefined;
      if (storedMs === undefined || generatedMs >= storedMs) {
        upsertItem.run(itemRow(item, edition.edition_id));
        clearTopics.run(item.id);
        item.topics.forEach((topic, i) => insertTopic.run(item.id, topic, i));
      }
      insertEditionItem.run(edition.edition_id, item.id, position);
    });
  })();
}

function itemRow(item: EditionItem, editionId: string) {
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if ((CORE_ITEM_FIELDS as readonly string[]).includes(key) || (IGNORED_ITEM_FIELDS as readonly string[]).includes(key)) continue;
    extras[key] = value;
  }
  return {
    id: item.id,
    edition_id: editionId,
    thread_id: item.thread_id ?? null,
    status: item.status ?? "",
    time: item.time,
    time_ms: Date.parse(item.time),
    title: item.title,
    title_ar: item.title_ar ?? null,
    summary: item.summary,
    summary_ar: item.summary_ar ?? null,
    sources: JSON.stringify(item.sources),
    image: item.image ?? null,
    image_kind: item.image_kind ?? null,
    nsfw_media: item.nsfw_media ? 1 : 0,
    warning: item.warning ?? null,
    warning_ar: item.warning_ar ?? null,
    extras: JSON.stringify(extras),
  };
}
