// Whether a Reader may see an Item at all: the one definition, used by
// everything that lists Items to a Reader without needing them to follow its
// Topics (Saved & Search) and everything that takes an Item id from a Reader
// (Ask, Reactions). An Item a Reader may not see does not exist for them.
//
// - Catalog (ticket 11): it carries at least one Topic in the Catalog as this
//   Reader sees it, so an Item tagged only with other Readers' private Topics
//   never reaches them.
// - Sensitive (ticket 08): every Sensitive Topic it carries is one they opted into.
//   That rule also keeps an Owner-only Topic's Items (Adult Trending, rework
//   ticket 10) from everyone else: it is sensitive, and nobody but the Owner can
//   follow it.
import type { AppContext } from "../app";
import { sensitiveItemVisibleSql } from "./sensitive";

/**
 * SQL that is true when the Reader may see the Item whose id is `itemId` (an
 * SQL expression such as `i.id`). Takes two `?` parameters, both the Reader's id.
 */
export function itemVisibleSql(itemId: string): string {
  return `EXISTS (SELECT 1 FROM item_topics ct JOIN topics ctt ON ctt.id = ct.topic_id
                   WHERE ct.item_id = ${itemId}
                     AND (ctt.created_by IS NULL OR ctt.shared_at_ms IS NOT NULL OR ctt.created_by = ?))
      AND ${sensitiveItemVisibleSql(itemId)}`;
}

/** Whether `readerId` may see the Item `itemId` (false for an Item no Edition carried). */
export function readerCanSeeItem(ctx: AppContext, readerId: number, itemId: string): boolean {
  return (
    ctx.db.prepare(`SELECT 1 FROM items i WHERE i.id = ? AND ${itemVisibleSql("i.id")}`).get(itemId, readerId, readerId) !==
    undefined
  );
}
