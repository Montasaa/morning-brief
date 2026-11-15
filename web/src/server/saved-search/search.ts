// Search (ticket 15): full-text search (SQLite FTS5) over the titles and
// summaries of every Item ever ingested, in English and Arabic. Editions are
// never pruned, so a story from any past Edition can be found.
//
// - Every word of the query must match, in the title or the summary, in either
//   language; a word's beginning is enough ("expan" finds "expansion").
// - Query words are always plain words: quotes, operators and brackets are
//   never FTS5 syntax.
// - Arabic is folded the same way on both sides, so the Reader need not match
//   the text's spelling: vowel marks and tatweel are ignored, أ إ آ ٱ read as ا,
//   ى as ي, ة as ه, and a leading article (ال, وال, بال, فال, كال, لل) is dropped.
// - Results are newest first (by the Item's time), at most SEARCH_LIMIT, and
//   follow the listing rules in ./listing.ts (sensitive opt-ins, Catalog
//   Topics, the Reader's own Reactions).
//
// The index (migration t15_search.sql) is brought up to date here, just
// before each search, from the Items whose text changed since the last one.
import type { AppContext } from "../app";
import {
  LISTED_ITEM_COLUMNS,
  LISTED_ITEM_JOINS,
  toListedItems,
  topicNamesOf,
  type ListedItem,
  type ListedRow,
} from "./listing";
import { itemVisibleSql } from "../topics/visibility";

export const SEARCH_LIMIT = 50;
/** Words beyond this many are ignored. */
const MAX_QUERY_WORDS = 12;

export interface SearchResults {
  query: string;
  results: ListedItem[];
  topic_names: Record<string, string>;
  topic_names_ar: Record<string, string>;
}

export function searchItems(ctx: AppContext, readerId: number, query: string): SearchResults {
  const words = searchWords(query).slice(0, MAX_QUERY_WORDS);
  if (words.length === 0) return { query, results: [], topic_names: {}, topic_names_ar: {} };
  updateSearchIndex(ctx);

  const match = words.map((w) => `"${w}"*`).join(" ");
  const rows = ctx.db
    .prepare(
      `SELECT ${LISTED_ITEM_COLUMNS},
              EXISTS (SELECT 1 FROM reactions r WHERE r.reader_id = ? AND r.item_id = i.id AND r.kind = 'save') AS saved
         FROM item_search
         JOIN item_search_docs d ON d.doc = item_search.rowid
         JOIN items i ON i.id = d.item_id
         ${LISTED_ITEM_JOINS}
        WHERE item_search MATCH ? AND ${itemVisibleSql("i.id")}
        ORDER BY i.time_ms DESC, i.id
        LIMIT ${SEARCH_LIMIT}`,
    )
    .all(readerId, readerId, match, readerId, readerId) as (ListedRow & { saved: number })[];
  const results = toListedItems(ctx, readerId, rows, (r) => r.saved === 1);
  return { query, results, ...topicNamesOf(ctx, results) };
}

/** Index the Items whose text changed since the last search. */
function updateSearchIndex(ctx: AppContext): void {
  const { db } = ctx;
  const pending = db.prepare("SELECT item_id FROM item_search_pending").pluck().all() as string[];
  if (pending.length === 0) return;
  const read = db.prepare("SELECT title, title_ar, summary, summary_ar FROM items WHERE id = ?");
  const docOf = db.prepare("SELECT doc FROM item_search_docs WHERE item_id = ?").pluck();
  const newDoc = db.prepare("INSERT INTO item_search_docs (item_id) VALUES (?)");
  const dropDoc = db.prepare("DELETE FROM item_search_docs WHERE doc = ?");
  const remove = db.prepare("DELETE FROM item_search WHERE rowid = ?");
  const add = db.prepare("INSERT INTO item_search (rowid, title, summary) VALUES (?, ?, ?)");
  const done = db.prepare("DELETE FROM item_search_pending WHERE item_id = ?");
  db.transaction(() => {
    for (const itemId of pending) {
      const item = read.get(itemId) as
        | { title: string; title_ar: string | null; summary: string; summary_ar: string | null }
        | undefined;
      let doc = docOf.get(itemId) as number | undefined;
      if (doc !== undefined) remove.run(doc);
      if (item) {
        doc ??= Number(newDoc.run(itemId).lastInsertRowid);
        add.run(doc, searchText(item.title, item.title_ar), searchText(item.summary, item.summary_ar));
      } else if (doc !== undefined) {
        dropDoc.run(doc);
      }
      done.run(itemId);
    }
  })();
}

/** Text as it is indexed: its words, folded for search, separated by spaces. */
function searchText(...texts: (string | null)[]): string {
  return searchWords(texts.filter(Boolean).join("\n")).join(" ");
}

const ARABIC_MARKS = /[ؐ-ؚـً-ٰٟۖ-ۭ]/g;
const ARABIC_ARTICLE = /^(?:وال|فال|بال|كال|لل|ال)(?=\p{L}{2})/u;

/** The words of `text`, lower-cased and with Arabic folded (see the header). */
export function searchWords(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word.replace(ARABIC_ARTICLE, ""));
}
