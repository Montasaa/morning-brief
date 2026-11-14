// Catalog & Topics. Ticket 02 seeds the 14 starting Topics (migration
// t02_topics.sql); ticket 07 adds following and unfollowing. Later tickets add
// Reader-created Topics, sharing and Gathering Rules here.
import type { AppContext } from "../app";

export interface CatalogTopic {
  id: string;
  name: string;
  name_ar: string;
  /** A Sensitive Topic: each Reader must opt in before seeing it. */
  sensitive: boolean;
  /** Whether the Reader asking follows it. */
  followed: boolean;
}

interface TopicRow {
  id: string;
  name: string;
  name_ar: string;
  sensitive: number;
  followed: number;
}

const SELECT = `SELECT t.id, t.name, t.name_ar, t.sensitive,
                       EXISTS (SELECT 1 FROM topic_follows f WHERE f.topic_id = t.id AND f.reader_id = ?) AS followed
                  FROM topics t`;

const toTopic = (r: TopicRow): CatalogTopic => ({ ...r, sensitive: r.sensitive === 1, followed: r.followed === 1 });

/** The Catalog in its order, each Topic marked with whether `readerId` follows it. */
export function listCatalog(ctx: AppContext, readerId: number): CatalogTopic[] {
  return (ctx.db.prepare(`${SELECT} ORDER BY t.position, t.id`).all(readerId) as TopicRow[]).map(toTopic);
}

export function catalogTopic(ctx: AppContext, readerId: number, topicId: string): CatalogTopic | null {
  const row = ctx.db.prepare(`${SELECT} WHERE t.id = ?`).get(readerId, topicId) as TopicRow | undefined;
  return row ? toTopic(row) : null;
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

/** Which of `topicIds` are not in the Catalog. */
export function unknownTopicIds(ctx: AppContext, topicIds: string[]): string[] {
  const exists = ctx.db.prepare("SELECT 1 FROM topics WHERE id = ?").pluck();
  return topicIds.filter((id) => !exists.get(id));
}
