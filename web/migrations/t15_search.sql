-- t15: full-text search over every Item ever ingested (Saved & Search).
--
-- item_search holds each Item's title and summary in both languages,
-- normalised for search (Arabic hamza forms, vowel marks and the article
-- folded; see src/server/saved-search/search.ts). The normalising is done in
-- TypeScript, so the triggers on items only note which Items changed, and
-- search brings the index up to date before it runs. Items are never deleted,
-- but a delete is noted too.
--
-- item_search_docs gives each Item a fixed document number (the FTS rowid).
-- items.rowid is not used: without an INTEGER PRIMARY KEY, VACUUM may renumber it.

CREATE VIRTUAL TABLE item_search USING fts5 (
  title,      -- title and title_ar
  summary,    -- summary and summary_ar
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE item_search_docs (
  doc      INTEGER PRIMARY KEY,   -- item_search.rowid
  item_id  TEXT NOT NULL UNIQUE
);

CREATE TABLE item_search_pending (
  item_id  TEXT PRIMARY KEY
);

-- The triggers check for an existing row rather than use INSERT OR IGNORE: the
-- upsert in Edition ingest that fires them would override that conflict clause.
CREATE TRIGGER item_search_on_insert AFTER INSERT ON items BEGIN
  INSERT INTO item_search_pending (item_id)
    SELECT new.id WHERE NOT EXISTS (SELECT 1 FROM item_search_pending WHERE item_id = new.id);
END;

CREATE TRIGGER item_search_on_update AFTER UPDATE OF title, title_ar, summary, summary_ar ON items BEGIN
  INSERT INTO item_search_pending (item_id)
    SELECT new.id WHERE NOT EXISTS (SELECT 1 FROM item_search_pending WHERE item_id = new.id);
END;

CREATE TRIGGER item_search_on_delete AFTER DELETE ON items BEGIN
  INSERT INTO item_search_pending (item_id)
    SELECT old.id WHERE NOT EXISTS (SELECT 1 FROM item_search_pending WHERE item_id = old.id);
END;

-- Items stored before this migration.
INSERT INTO item_search_pending (item_id) SELECT id FROM items;
