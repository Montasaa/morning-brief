-- t09: each Reader's Reactions to Items (like, save, open, hide with an
-- optional reason). One row per Reader, Item and kind; undoing deletes the row.
-- Reactions are private: they are only ever read for the Reader who gave them.

CREATE TABLE reactions (
  reader_id      INTEGER NOT NULL REFERENCES readers (id) ON DELETE CASCADE,
  item_id        TEXT NOT NULL REFERENCES items (id),
  kind           TEXT NOT NULL CHECK (kind IN ('like', 'save', 'open', 'hide')),
  -- Only a hide carries a reason; NULL is "just hide".
  reason         TEXT CHECK (reason IN ('not_interested', 'already_seen', 'bad_source')),
  created_at_ms  INTEGER NOT NULL,
  PRIMARY KEY (reader_id, item_id, kind),
  CHECK (kind = 'hide' OR reason IS NULL)
);
-- Saved lists, "bad source" reports and similar read by kind.
CREATE INDEX reactions_kind ON reactions (kind, reason);
