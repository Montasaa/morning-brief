// Reader-created Topics (ticket 11). Any Reader can create a Topic with a name
// and a short note, up to CREATED_TOPICS_LIMIT each (the Owner has no limit).
// A new Topic is private to its creator, who follows it straight away, until
// they share it to the Catalog. Claude drafts its Gathering Rules on creation,
// and it is gathered from the next Edition on (it is on the gathering list as
// soon as anyone follows it).
import { randomBytes } from "node:crypto";
import type { AppContext } from "../app";
import type { Reader } from "../readers/readers";
import { catalogTopic, listCatalog, type CatalogTopic } from "./catalog";
import { draftGatheringRules } from "./gathering-rules";

export const CREATED_TOPICS_LIMIT = 10;
export const TOPIC_NAME_MAX_LENGTH = 60;
export const TOPIC_NOTE_MAX_LENGTH = 300;

export type CreateResult =
  | { ok: true; topic: CatalogTopic }
  | { ok: false; status: 409 | 422; error: string; reasons?: string[]; topic?: CatalogTopic; limit?: number };

const FIELDS = new Set(["name", "name_ar", "note"]);

const clean = (s: string): string => s.replace(/\s+/g, " ").trim();

/** How many Topics `readerId` has created (shared ones included). */
export function createdTopicCount(ctx: AppContext, readerId: number): number {
  return ctx.db.prepare("SELECT COUNT(*) FROM topics WHERE created_by = ?").pluck().get(readerId) as number;
}

function limitReached(ctx: AppContext, reader: Reader): boolean {
  return reader.role !== "owner" && createdTopicCount(ctx, reader.id) >= CREATED_TOPICS_LIMIT;
}

const LIMIT_MESSAGE = `You have created ${CREATED_TOPICS_LIMIT} Topics, the most a Reader can create. Follow one from the Catalog instead.`;

/** POST /api/topics: create a private Topic, draft its Gathering Rules, and follow it. */
export async function createTopic(ctx: AppContext, reader: Reader, body: unknown): Promise<CreateResult> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 422, error: "Send a JSON object.", reasons: ["The body must be a JSON object."] };
  }
  const input = body as Record<string, unknown>;
  const reasons: string[] = [];
  for (const key of Object.keys(input)) if (!FIELDS.has(key)) reasons.push(`Unknown field "${key}".`);
  const text = (key: string, max: number, required: boolean): string | null => {
    const value = input[key];
    if (value === undefined || value === null || (typeof value === "string" && !clean(value))) {
      if (required) reasons.push(`Give the Topic a ${key}.`);
      return null;
    }
    if (typeof value !== "string") {
      reasons.push(`${key} must be text.`);
      return null;
    }
    const cleaned = clean(value);
    if (cleaned.length > max) reasons.push(`${key} can be at most ${max} characters.`);
    return cleaned;
  };
  const name = text("name", TOPIC_NAME_MAX_LENGTH, true);
  const nameAr = text("name_ar", TOPIC_NAME_MAX_LENGTH, false);
  const note = text("note", TOPIC_NOTE_MAX_LENGTH, false);
  if (reasons.length || !name) return { ok: false, status: 422, error: reasons[0] ?? "Give the Topic a name.", reasons };

  if (limitReached(ctx, reader)) return { ok: false, status: 409, error: LIMIT_MESSAGE, limit: CREATED_TOPICS_LIMIT };

  // A Topic of that name the Reader can already see: follow it rather than make a twin.
  const key = name.toLowerCase();
  const twin = listCatalog(ctx, reader.id).find((t) => t.name.toLowerCase() === key || t.name_ar.toLowerCase() === key);
  if (twin) {
    return { ok: false, status: 409, error: `"${twin.name}" is already in the Catalog. Follow it instead.`, topic: twin };
  }

  const drafted = await draftGatheringRules(ctx, { name, note });

  const { db } = ctx;
  const id = db.transaction((): string | null => {
    if (limitReached(ctx, reader)) return null; // re-checked: another device may have created one meanwhile
    const id = uniqueTopicId(ctx, name);
    const now = Date.now();
    db.prepare(
      `INSERT INTO topics (id, name, name_ar, sensitive, position, created_by, note, gathering_rules, rules_by, rules_updated_at_ms)
       VALUES (?, ?, ?, 0, (SELECT COALESCE(MAX(position), 0) + 1 FROM topics), ?, ?, ?, ?, ?)`,
    ).run(id, name, nameAr ?? name, reader.id, note, drafted.rules, drafted.by, now);
    db.prepare("INSERT INTO topic_follows (reader_id, topic_id, followed_at_ms) VALUES (?, ?, ?)").run(reader.id, id, now);
    return id;
  })();
  if (!id) return { ok: false, status: 409, error: LIMIT_MESSAGE, limit: CREATED_TOPICS_LIMIT };
  return { ok: true, topic: catalogTopic(ctx, reader.id, id)! };
}

/**
 * A Topic id from its name, as Editions use it in items[].topics: lowercase
 * ASCII letters, digits and dashes ("Formula 1" -> "formula-1"). A taken id
 * gets a random suffix, so the id never hints at another Reader's private Topic.
 */
function uniqueTopicId(ctx: AppContext, name: string): string {
  const base =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "topic";
  const taken = ctx.db.prepare("SELECT 1 FROM topics WHERE id = ?").pluck();
  if (base !== "topic" && !taken.get(base)) return base;
  for (;;) {
    const id = `${base}-${randomBytes(3).toString("hex")}`;
    if (!taken.get(id)) return id;
  }
}

export type ShareResult = { ok: true; topic: CatalogTopic } | { ok: false; status: 403 | 404; error: string };

/** POST /api/topics/{id}/share: the creator shares their Topic to the Catalog. Sharing twice changes nothing. */
export function shareTopic(ctx: AppContext, reader: Reader, topicId: string): ShareResult {
  const topic = catalogTopic(ctx, reader.id, topicId);
  if (!topic) return { ok: false, status: 404, error: "No such Topic in the Catalog." };
  if (!topic.mine) return { ok: false, status: 403, error: "Only the Reader who created a Topic can share it." };
  ctx.db
    .prepare("UPDATE topics SET shared_at_ms = ? WHERE id = ? AND shared_at_ms IS NULL")
    .run(Date.now(), topicId);
  return { ok: true, topic: catalogTopic(ctx, reader.id, topicId)! };
}
