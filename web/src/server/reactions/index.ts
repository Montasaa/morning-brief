// Reactions: a Reader's like, save, open and hide (with an optional reason)
// on one Item, each undoable. They are private: every read here is for one
// Reader, and nothing reads another Reader's Reactions to build a Brief.
// The Scorer (../brief/score.ts) turns them into ranking; the Brief composer
// marks liked/saved Items, dims opened ones and leaves hidden ones out.
// The routes only take Reactions to Items the Reader may see
// (`readerCanSeeItem`, ../topics/visibility.ts); any other Item is a 404.
import type { AppContext } from "../app";

export const REACTION_KINDS = ["like", "save", "open", "hide"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const HIDE_REASONS = ["not_interested", "already_seen", "bad_source"] as const;
/** Why an Item was hidden; null is "just hide". */
export type HideReason = (typeof HIDE_REASONS)[number] | null;

/** One Reader's Reactions to one Item. */
export interface ItemReactions {
  like: boolean;
  save: boolean;
  open: boolean;
  /** Null when not hidden. */
  hide: { reason: HideReason } | null;
}

/** One Reaction, as the Scorer reads it. */
export interface Reaction {
  item_id: string;
  kind: ReactionKind;
  reason: HideReason;
}

export type ReactionInput = { kind: ReactionKind; reason: HideReason };

export const isReactionKind = (v: unknown): v is ReactionKind => REACTION_KINDS.includes(v as ReactionKind);

/** Checks a POST body `{kind, reason?}`. A reason is only allowed on a hide. */
export function parseReaction(body: unknown): { ok: true; reaction: ReactionInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send {kind, reason?}." };
  }
  const { kind, reason = null } = body as Record<string, unknown>;
  if (!isReactionKind(kind)) return { ok: false, error: `kind must be one of ${REACTION_KINDS.join(", ")}.` };
  if (reason !== null && kind !== "hide") return { ok: false, error: "Only a hide can carry a reason." };
  if (reason !== null && !HIDE_REASONS.includes(reason as never)) {
    return { ok: false, error: `reason must be one of ${HIDE_REASONS.join(", ")}, or left out.` };
  }
  return { ok: true, reaction: { kind, reason: reason as HideReason } };
}

/** Set a Reaction. Setting it again changes nothing, except that a new hide reason replaces the old one. */
export function setReaction(ctx: AppContext, readerId: number, itemId: string, r: ReactionInput): ItemReactions {
  ctx.db
    .prepare(
      `INSERT INTO reactions (reader_id, item_id, kind, reason, created_at_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (reader_id, item_id, kind) DO UPDATE SET reason = excluded.reason`,
    )
    .run(readerId, itemId, r.kind, r.reason, Date.now());
  return itemReactions(ctx, readerId, itemId);
}

/** Undo a Reaction. Undoing one that was never set changes nothing. */
export function undoReaction(ctx: AppContext, readerId: number, itemId: string, kind: ReactionKind): ItemReactions {
  ctx.db.prepare("DELETE FROM reactions WHERE reader_id = ? AND item_id = ? AND kind = ?").run(readerId, itemId, kind);
  return itemReactions(ctx, readerId, itemId);
}

export function itemReactions(ctx: AppContext, readerId: number, itemId: string): ItemReactions {
  return toItemReactions(
    ctx.db
      .prepare("SELECT item_id, kind, reason FROM reactions WHERE reader_id = ? AND item_id = ?")
      .all(readerId, itemId) as Reaction[],
  );
}

/** Every Reaction this one Reader has given, oldest first. */
export function readerReactions(ctx: AppContext, readerId: number): Reaction[] {
  return ctx.db
    .prepare("SELECT item_id, kind, reason FROM reactions WHERE reader_id = ? ORDER BY created_at_ms, item_id, kind")
    .all(readerId) as Reaction[];
}

/** One Item's Reactions out of a list of Reactions to that Item. */
export function toItemReactions(rs: Reaction[]): ItemReactions {
  const hide = rs.find((r) => r.kind === "hide");
  return {
    like: rs.some((r) => r.kind === "like"),
    save: rs.some((r) => r.kind === "save"),
    open: rs.some((r) => r.kind === "open"),
    hide: hide ? { reason: hide.reason } : null,
  };
}
