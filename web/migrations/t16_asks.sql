-- t16: Ask Claude about an Item. Questions and answers are private to the
-- Reader who asked and kept for later. Times are epoch milliseconds.

CREATE TABLE asks (
  id           INTEGER PRIMARY KEY,
  reader_id    INTEGER NOT NULL REFERENCES readers (id),
  item_id      TEXT NOT NULL REFERENCES items (id),
  question     TEXT NOT NULL,
  answer       TEXT,                             -- NULL while Claude is answering (the question already counts)
  citations    TEXT NOT NULL DEFAULT '[]',       -- JSON array of {title, url}
  asked_at_ms  INTEGER NOT NULL,
  ask_day      TEXT NOT NULL                     -- YYYY-MM-DD in Asia/Riyadh: the day it counts against
);
CREATE INDEX asks_reader_item ON asks (reader_id, item_id, asked_at_ms);
CREATE INDEX asks_reader_day ON asks (reader_id, ask_day);

-- A Reader's daily Ask limit, set by the Owner. No row means the default (20).
-- The Owner has no limit and never gets a row.
CREATE TABLE ask_limits (
  reader_id    INTEGER PRIMARY KEY REFERENCES readers (id),
  daily_limit  INTEGER NOT NULL CHECK (daily_limit >= 0),
  set_at_ms    INTEGER NOT NULL
);
