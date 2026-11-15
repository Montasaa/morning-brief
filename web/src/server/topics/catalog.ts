// Catalog & Topics. Ticket 02 seeds the 14 starting Topics (migration
// t02_topics.sql); ticket 07 adds following and unfollowing; ticket 11 adds
// Reader-created Topics (reader-topics.ts) and Gathering Rules
// (gathering-rules.ts).
//
// What a Reader sees as the Catalog: the starting Topics, every shared Topic,
// and the private Topics they created themselves. Another Reader's private
// Topic does not exist for them (not even for the Owner here; the Owner sees
// every Topic through the Gathering Rules listing instead).
import type { AppContext } from "../app";

export interface CatalogTopic {
  id: string;
  name: string;
  name_ar: string;
  /** A Sensitive Topic: each Reader must opt in before seeing it. */
  sensitive: boolean;
  /** Whether the Reader asking follows it. */
  followed: boolean;
  /** Created by a Reader and not shared to the Catalog yet (only its creator sees it). */
  private: boolean;
  /** Created by the Reader asking. */
  mine: boolean;
}

interface TopicRow {
  id: string;
  name: string;
  name_ar: string;
  sensitive: number;
  followed: number;
  private: number;
  mine: number;
}

/** SQL: the Topic `t` is in the Catalog of the Reader bound as @reader. */
export const VISIBLE_TO_READER = "(t.created_by IS NULL OR t.shared_at_ms IS NOT NULL OR t.created_by = @reader)";

const SELECT = `SELECT t.id, t.name, t.name_ar, t.sensitive,
                       EXISTS (SELECT 1 FROM topic_follows f WHERE f.topic_id = t.id AND f.reader_id = @reader) AS followed,
                       (t.created_by IS NOT NULL AND t.shared_at_ms IS NULL) AS private,
                       (t.created_by IS NOT NULL AND t.created_by = @reader) AS mine
                  FROM topics t
                 WHERE ${VISIBLE_TO_READER}`;

const toTopic = (r: TopicRow): CatalogTopic => ({
  ...r,
  sensitive: r.sensitive === 1,
  followed: r.followed === 1,
  private: r.private === 1,
  mine: r.mine === 1,
});

/** The Catalog `readerId` sees, in its order, each Topic marked with whether they follow it. */
export function listCatalog(ctx: AppContext, readerId: number): CatalogTopic[] {
  return (ctx.db.prepare(`${SELECT} ORDER BY t.position, t.id`).all({ reader: readerId }) as TopicRow[]).map(toTopic);
}

/** One Topic in the Catalog `readerId` sees, or null (unknown, or another Reader's private Topic). */
export function catalogTopic(ctx: AppContext, readerId: number, topicId: string): CatalogTopic | null {
  const row = ctx.db.prepare(`${SELECT} AND t.id = @id`).get({ reader: readerId, id: topicId }) as TopicRow | undefined;
  return row ? toTopic(row) : null;
}

/** The ids of other Readers' private Topics: never shown to `readerId`, even as an Item's Topic. */
export function hiddenTopicIds(ctx: AppContext, readerId: number): Set<string> {
  const ids = ctx.db
    .prepare("SELECT t.id FROM topics t WHERE NOT " + VISIBLE_TO_READER)
    .pluck()
    .all({ reader: readerId }) as string[];
  return new Set(ids);
}

/** The ids of the Topics `readerId` follows, in Catalog order. */
export function followedTopicIds(ctx: AppContext, readerId: number): string[] {
  return ctx.db
    .prepare(
      `SELECT t.id FROM topic_follows f JOIN topics t ON t.id = f.topic_id
        WHERE f.reader_id = ? ORDER BY t.position, t.id`,
    )
    .pluck()
    .all(readerId) as string[];
}

/** Follow a Catalog Topic. Following twice changes nothing. Null for a Topic not in the Catalog. */
export function followTopic(ctx: AppContext, readerId: number, topicId: string): CatalogTopic | null {
  if (!catalogTopic(ctx, readerId, topicId)) return null;
  ctx.db
    .prepare("INSERT INTO topic_follows (reader_id, topic_id, followed_at_ms) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .run(readerId, topicId, Date.now());
  return catalogTopic(ctx, readerId, topicId);
}

/** Unfollow a Catalog Topic. Unfollowing twice changes nothing. Null for a Topic not in the Catalog. */
export function unfollowTopic(ctx: AppContext, readerId: number, topicId: string): CatalogTopic | null {
  if (!catalogTopic(ctx, readerId, topicId)) return null;
  ctx.db.prepare("DELETE FROM topic_follows WHERE reader_id = ? AND topic_id = ?").run(readerId, topicId);
  return catalogTopic(ctx, readerId, topicId);
}

/**
 * Replace everything `readerId` follows with `topicIds` (all in the Catalog;
 * the caller checks). Topics kept keep their original follow time.
 */
export function setFollowedTopics(ctx: AppContext, readerId: number, topicIds: string[]): void {
  const { db } = ctx;
  db.transaction(() => {
    const keep = new Set(topicIds);
    for (const id of followedTopicIds(ctx, readerId)) {
      if (!keep.has(id)) db.prepare("DELETE FROM topic_follows WHERE reader_id = ? AND topic_id = ?").run(readerId, id);
    }
    for (const id of keep) followTopic(ctx, readerId, id);
  })();
}

/** Which of `topicIds` are not in the Catalog `readerId` sees. */
export function unknownTopicIds(ctx: AppContext, topicIds: string[], readerId: number): string[] {
  const visible = ctx.db.prepare(`SELECT 1 FROM topics t WHERE t.id = @id AND ${VISIBLE_TO_READER}`).pluck();
  return topicIds.filter((id) => !visible.get({ id, reader: readerId }));
}
