// The Saved list (ticket 15): the Items one Reader saved (a `save` Reaction,
// ticket 09), newest-saved first, from any Edition. Unsaving is undoing the
// Reaction (DELETE /api/items/{id}/reactions/save). Saved Items are never
// pruned; a sensitive one is listed only while the Reader is opted in.
import type { AppContext } from "../app";
import {
  LISTED_ITEM_COLUMNS,
  LISTED_ITEM_JOINS,
  toListedItems,
  topicNamesOf,
  type ItemList,
  type ListedItem,
  type ListedRow,
} from "./listing";
import { itemVisibleSql } from "../topics/visibility";

export interface SavedItem extends ListedItem {
  /** When the Reader saved it (ISO 8601). */
  saved_at: string;
}

export function savedItems(ctx: AppContext, readerId: number): ItemList<SavedItem> {
  const rows = ctx.db
    .prepare(
      `SELECT ${LISTED_ITEM_COLUMNS}, s.created_at_ms AS saved_at_ms
         FROM reactions s
         JOIN items i ON i.id = s.item_id
         ${LISTED_ITEM_JOINS}
        WHERE s.reader_id = ? AND s.kind = 'save' AND ${itemVisibleSql("i.id")}
        ORDER BY s.created_at_ms DESC, s.rowid DESC`,
    )
    .all(readerId, readerId, readerId, readerId) as (ListedRow & { saved_at_ms: number })[];
  const listed = toListedItems(ctx, readerId, rows, () => true);
  const items = listed.map((item, n) => ({ ...item, saved_at: new Date(rows[n]!.saved_at_ms).toISOString() }));
  return { items, ...topicNamesOf(ctx, items) };
}
