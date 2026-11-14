// Each Reader's top stories for one Edition (ticket 13): where the top picker
// (./top-picker.ts) stores them and how the Brief composer reads them back.
// Private to the Reader, like their Reactions.
import type { AppContext } from "../app";

/** A Brief leads with 1 to this many top stories. */
export const MAX_TOP_STORIES = 3;

export interface TopStory {
  item_id: string;
  /** "Why this matters to you", in English and Arabic. Null when the Scorer picked it (Claude failed). */
  why: string | null;
  why_ar: string | null;
}

/** Who chose a Reader's top stories: Claude, or the Scorer when Claude failed. */
export type PickedBy = "claude" | "scorer";

export interface StoredTopStories {
  picked_by: PickedBy;
  /** In Brief order. */
  stories: TopStory[];
}

/** The top stories stored for a Reader and Edition, or null when none were picked. */
export function storedTopStories(ctx: AppContext, readerId: number, editionId: string): StoredTopStories | null {
  const rows = ctx.db
    .prepare(
      `SELECT item_id, why, why_ar, picked_by FROM top_stories
        WHERE reader_id = ? AND edition_id = ? ORDER BY position`,
    )
    .all(readerId, editionId) as (TopStory & { picked_by: PickedBy })[];
  if (rows.length === 0) return null;
  return { picked_by: rows[0]!.picked_by, stories: rows.map(({ picked_by: _, ...story }) => story) };
}

/** Replace a Reader's top stories for an Edition. */
export function saveTopStories(
  ctx: AppContext,
  readerId: number,
  editionId: string,
  pickedBy: PickedBy,
  stories: TopStory[],
): void {
  const { db } = ctx;
  const clear = db.prepare("DELETE FROM top_stories WHERE reader_id = ? AND edition_id = ?");
  const insert = db.prepare(
    `INSERT INTO top_stories (reader_id, edition_id, item_id, position, why, why_ar, picked_by, picked_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const now = Date.now();
  db.transaction(() => {
    clear.run(readerId, editionId);
    stories.slice(0, MAX_TOP_STORIES).forEach((s, position) =>
      insert.run(readerId, editionId, s.item_id, position, s.why, s.why_ar, pickedBy, now),
    );
  })();
}

/**
 * The fallback when Claude cannot pick: the Edition's own top stories that are
 * in the Reader's Brief, then the Reader's highest-scored Items, up to
 * MAX_TOP_STORIES. `ranked` is the Reader's Brief, highest score first.
 */
export function scoredTopStories(ranked: readonly string[], editionTopIds: readonly string[]): string[] {
  const inBrief = new Set(ranked);
  const ids = [...new Set([...editionTopIds.filter((id) => inBrief.has(id)), ...ranked])];
  return ids.slice(0, MAX_TOP_STORIES);
}
