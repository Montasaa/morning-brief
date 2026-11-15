// Ask: a Reader's question to Claude about one Item. Claude gets the Item, its
// sources and web search, and must cite the links it relies on. Questions and
// answers are stored per Reader and are only ever read back for that Reader.
// Each question counts against the Reader's daily limit (see limits.ts); one
// Claude could not answer does not. An Item the Reader may not see (another
// Reader's private Topic, a sensitive one not opted into) is no Item for them.
import type { AppContext } from "../app";
import type { Source } from "../editions/types";
import type { ClaudeRequest } from "../outside";
import type { Reader } from "../readers/readers";
import { readerCanSeeItem } from "../topics/visibility";
import { askLimitFor, riyadhDay, type AskLimit } from "./limits";

export const MAX_QUESTION_LENGTH = 2000;
/** Earlier questions on the same Item sent along, so follow-ups make sense. */
const HISTORY = 5;

export interface Citation {
  title: string | null;
  url: string;
}

export interface Ask {
  id: number;
  item_id: string;
  question: string;
  answer: string;
  citations: Citation[];
  /** RFC 3339 (UTC). */
  asked_at: string;
}

interface AskRow {
  id: number;
  item_id: string;
  question: string;
  answer: string;
  citations: string;
  asked_at_ms: number;
}

interface ItemForAsk {
  id: string;
  time: string;
  title: string;
  title_ar: string | null;
  summary: string;
  summary_ar: string | null;
  sources: string;
}

function toAsk(row: AskRow): Ask {
  return {
    id: row.id,
    item_id: row.item_id,
    question: row.question,
    answer: row.answer,
    citations: JSON.parse(row.citations) as Citation[],
    asked_at: new Date(row.asked_at_ms).toISOString(),
  };
}

/** The Item, or null when there is none or `readerId` may not see it. */
function findItem(ctx: AppContext, readerId: number, itemId: string): ItemForAsk | null {
  if (!readerCanSeeItem(ctx, readerId, itemId)) return null;
  return (
    (ctx.db
      .prepare("SELECT id, time, title, title_ar, summary, summary_ar, sources FROM items WHERE id = ?")
      .get(itemId) as ItemForAsk | undefined) ?? null
  );
}

/** The Reader's answered questions about one Item, oldest first. */
function answeredAsks(ctx: AppContext, readerId: number, itemId: string): Ask[] {
  return (
    ctx.db
      .prepare(
        `SELECT id, item_id, question, answer, citations, asked_at_ms FROM asks
          WHERE reader_id = ? AND item_id = ? AND answer IS NOT NULL
          ORDER BY asked_at_ms, id`,
      )
      .all(readerId, itemId) as AskRow[]
  ).map(toAsk);
}

export type AskListResult = { ok: true; item_id: string; asks: Ask[]; ask_limit: AskLimit } | { ok: false; reason: "no-such-item" };

/** What the Ask sheet opens with: this Reader's earlier questions about the Item, and what is left today. */
export function listAsks(ctx: AppContext, reader: Reader, itemId: string): AskListResult {
  if (!findItem(ctx, reader.id, itemId)) return { ok: false, reason: "no-such-item" };
  return { ok: true, item_id: itemId, asks: answeredAsks(ctx, reader.id, itemId), ask_limit: askLimitFor(ctx, reader) };
}

export type AskResult =
  | { ok: true; ask: Ask; ask_limit: AskLimit }
  | { ok: false; reason: "invalid-question" | "no-such-item" | "claude-failed"; ask_limit?: AskLimit }
  | { ok: false; reason: "limit-reached"; ask_limit: AskLimit };

/** Ask Claude about an Item for this Reader, within their daily limit. */
export async function askAboutItem(
  ctx: AppContext,
  reader: Reader,
  itemId: string,
  rawQuestion: unknown,
): Promise<AskResult> {
  const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
  if (!question || question.length > MAX_QUESTION_LENGTH) return { ok: false, reason: "invalid-question" };
  const item = findItem(ctx, reader.id, itemId);
  if (!item) return { ok: false, reason: "no-such-item" };

  // Check the limit and hold a place in one step, so two questions sent at
  // once cannot both slip under it. The place is given back if Claude fails.
  const history = answeredAsks(ctx, reader.id, itemId).slice(-HISTORY);
  const reserved = ctx.db.transaction(() => {
    const now = Date.now();
    const limit = askLimitFor(ctx, reader, now);
    if (limit.remaining === 0) return { ok: false as const, limit };
    const { lastInsertRowid } = ctx.db
      .prepare("INSERT INTO asks (reader_id, item_id, question, asked_at_ms, ask_day) VALUES (?, ?, ?, ?, ?)")
      .run(reader.id, itemId, question, now, riyadhDay(now));
    return { ok: true as const, id: Number(lastInsertRowid) };
  })();
  if (!reserved.ok) return { ok: false, reason: "limit-reached", ask_limit: reserved.limit };

  let answer: string;
  let citations: Citation[];
  try {
    const reply = await ctx.services.claude.complete(askRequest(item, history, question));
    answer = reply.text.trim();
    citations = cleanCitations(reply.citations ?? []);
    if (!answer) throw new Error("Claude returned an empty answer");
  } catch (error) {
    ctx.db.prepare("DELETE FROM asks WHERE id = ?").run(reserved.id);
    console.error(`Ask about ${itemId} failed:`, error instanceof Error ? error.message : error);
    return { ok: false, reason: "claude-failed", ask_limit: askLimitFor(ctx, reader) };
  }

  ctx.db.prepare("UPDATE asks SET answer = ?, citations = ? WHERE id = ?").run(answer, JSON.stringify(citations), reserved.id);
  const row = ctx.db
    .prepare("SELECT id, item_id, question, answer, citations, asked_at_ms FROM asks WHERE id = ?")
    .get(reserved.id) as AskRow;
  return { ok: true, ask: toAsk(row), ask_limit: askLimitFor(ctx, reader) };
}

const INSTRUCTIONS = `You answer a Reader's questions about one Item in their Morning Brief, a private daily news brief.

Ground your answer in the Item's sources below (fetch them when it helps) and search the web for background or newer reporting. Cite the links you rely on. Prefer established outlets and official sources; say plainly when sources disagree or when you could not confirm something, and never invent facts or links.

Keep it short: a few sentences or a few bullet points, plain text. Answer in the language the question is written in.`;

/** The request Claude gets: the instructions and the Item, then the Reader's earlier questions on it and the new one. */
function askRequest(item: ItemForAsk, history: Ask[], question: string): ClaudeRequest {
  const sources = JSON.parse(item.sources) as Source[];
  const lines = [
    `Title: ${item.title}`,
    item.title_ar ? `Title (Arabic): ${item.title_ar}` : null,
    `Time: ${item.time}`,
    `Summary: ${item.summary}`,
    item.summary_ar ? `Summary (Arabic): ${item.summary_ar}` : null,
    "Sources:",
    ...sources.map((s) => `- ${s.title} (${s.type}): ${s.url}`),
  ].filter((l): l is string => l !== null);

  return {
    purpose: "ask",
    system: `${INSTRUCTIONS}\n\nThe Item:\n${lines.join("\n")}`,
    messages: [
      ...history.flatMap((a) => [
        { role: "user" as const, content: a.question },
        { role: "assistant" as const, content: a.answer },
      ]),
      { role: "user", content: question },
    ],
    webSearch: true,
  };
}

/** Only http(s) links, each once, in the order Claude cited them. */
function cleanCitations(citations: { title?: string; url: string }[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const c of citations) {
    if (typeof c.url !== "string" || !/^https?:\/\//i.test(c.url) || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push({ title: c.title?.trim() || null, url: c.url });
  }
  return out;
}
