// The Scorer (ticket 09): a pure, deterministic function of the Topics a
// Reader follows, that Reader's own Reaction history, recency and status. The
// Brief composer orders Items (and Topic groups) by it; the top picker (ticket
// 13) falls back to the highest-scored Items.
//
// - Recency: newer is better, measured against the Edition's generated_at (not
//   the clock), so the same inputs always give the same order.
// - Status: "new" and "updated" Items get a small lift.
// - Reactions: a like or save raises Items similar to the one reacted to (they
//   share a followed Topic or the Story Thread); a "not interested" hide lowers
//   them. "Already seen", "bad source", a plain hide and opening an Item say
//   nothing about the subject, so they have no effect here.
//
// Tests check the Brief's order, never these weights.
import type { ItemStatus } from "../editions/types";
import type { HideReason, ReactionKind } from "../reactions";

/** An Item to score. */
export interface ScoredItem {
  id: string;
  topics: string[];
  thread_id: string | null;
  status: ItemStatus;
  /** Epoch milliseconds. */
  time_ms: number;
}

/** One of the Reader's Reactions, with the Topics and Thread of the Item it was given to. */
export interface ScoredReaction {
  kind: ReactionKind;
  reason: HideReason;
  topics: string[];
  thread_id: string | null;
}

export interface ScoreInput {
  /** The Topics the Reader follows. */
  followed: ReadonlySet<string>;
  /** Only this Reader's Reactions. */
  reactions: readonly ScoredReaction[];
  /** The Edition's generated_at, epoch milliseconds: "now" for recency. */
  asOfMs: number;
}

const HOURS_PER_POINT = 6; // one point of score per 6 hours of age
const STATUS_POINTS: Record<ItemStatus, number> = { new: 0.25, updated: 0.15, "": 0 };
const AFFINITY_POINTS = 2; // one like on a similar Item is worth half a day of recency

/** How much one Reaction says about the subject: + more like this, - less, 0 nothing. */
function signal(r: ScoredReaction): number {
  if (r.kind === "like" || r.kind === "save") return 1;
  if (r.kind === "hide" && r.reason === "not_interested") return -1;
  return 0;
}

/** Diminishing returns: 1 Reaction counts 1, 3 count 2, 7 count 3. */
const squash = (x: number) => Math.sign(x) * Math.log2(1 + Math.abs(x));

/** Each Item's score, by id. Higher ranks first. */
export function scoreItems(items: readonly ScoredItem[], input: ScoreInput): Map<string, number> {
  const byTopic = new Map<string, number>();
  const byThread = new Map<string, number>();
  for (const r of input.reactions) {
    const s = signal(r);
    if (s === 0) continue;
    for (const t of r.topics) if (input.followed.has(t)) byTopic.set(t, (byTopic.get(t) ?? 0) + s);
    if (r.thread_id) byThread.set(r.thread_id, (byThread.get(r.thread_id) ?? 0) + s);
  }

  const scores = new Map<string, number>();
  for (const item of items) {
    const ageHours = Math.max(0, input.asOfMs - item.time_ms) / 3_600_000;
    let affinity = 0;
    for (const t of new Set(item.topics)) if (input.followed.has(t)) affinity += squash(byTopic.get(t) ?? 0);
    if (item.thread_id) affinity += squash(byThread.get(item.thread_id) ?? 0);
    scores.set(item.id, -ageHours / HOURS_PER_POINT + STATUS_POINTS[item.status] + AFFINITY_POINTS * affinity);
  }
  return scores;
}
